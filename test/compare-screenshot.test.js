import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { compareScreenshot } from '../src/mcp-api/compare-screenshot.js';
import { handleControllerMessage } from '../src/mcp-api/controller.js';
import { AssertionError, createExpect } from '../sdk/common/test/expect.js';

async function images(context) {
  const directory = await mkdtemp(join(tmpdir(), 'meu-screenshot-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const write = async (name, width, height, color, format = 'png') => {
    const data = Buffer.alloc(width * height * 4);
    for (let offset = 0; offset < data.length; offset += 4) {
      data.set(color, offset);
    }
    const image = { width, height, data };
    const path = join(directory, name);
    await writeFile(path, format === 'png' ? PNG.sync.write(image) : jpeg.encode(image, 100).data);
    return path;
  };
  return { directory, write };
}

test('screenshot comparison decodes PNG/JPEG by contents and uses the ratio boundary', async context => {
  const { write } = await images(context);
  const baseline = await write('baseline.data', 4, 4, [0, 0, 0, 255]);
  const same = await write('same.png', 4, 4, [0, 0, 0, 255]);
  const result = await compareScreenshot(same, baseline);
  assert.equal(result.matches, true);
  assert.equal(result.diffPixelRatio, 0);
  const different = await write('different.png', 4, 4, [255, 255, 255, 255]);
  assert.equal((await compareScreenshot(different, baseline)).diffPixelRatio, 1);
  assert.equal((await compareScreenshot(different, baseline, { maxDiffPixelRatio: 0.99 })).matches, false);
  assert.equal((await compareScreenshot(different, baseline, { maxDiffPixelRatio: 1 })).matches, true);
  const partial = new PNG({ width: 4, height: 4 });
  for (let offset = 0; offset < partial.data.length; offset += 4) {
    partial.data.set(offset < 16 ? [255, 255, 255, 255] : [0, 0, 0, 255], offset);
  }
  await writeFile(same, PNG.sync.write(partial));
  assert.equal((await compareScreenshot(same, baseline)).diffPixelRatio, 0.25);
  assert.equal((await compareScreenshot(same, baseline, { maxDiffPixelRatio: 0.25 })).matches, true);
  assert.equal((await compareScreenshot(same, baseline, { maxDiffPixelRatio: 0.24 })).matches, false);
  const jpegPath = await write('jpeg-without-extension', 4, 4, [0, 0, 0, 255], 'jpeg');
  assert.equal((await compareScreenshot(jpegPath, baseline)).matches, true);
  const near = await write('near.png', 4, 4, [1, 1, 1, 255]);
  assert.equal((await compareScreenshot(near, baseline)).matches, true);
});

test('screenshot comparison fails different dimensions without scaling', async context => {
  const { write } = await images(context);
  const actual = await write('actual.png', 4, 4, [0, 0, 0, 255]);
  for (const [width, height] of [[8, 4], [4, 8]]) {
    const baseline = await write('baseline.png', width, height, [0, 0, 0, 255]);
    const result = await compareScreenshot(actual, baseline, { maxDiffPixelRatio: 1 });
    assert.equal(result.matches, false);
    assert.equal(result.diffPixelRatio, null);
    assert.match(result.message, /size .* differs/);
  }
});

test('screenshot comparison rejects invalid options, paths and corrupt files', async context => {
  const { directory, write } = await images(context);
  const valid = await write('valid.png', 4, 4, [0, 0, 0, 255]);
  for (const options of [null, [], { threshold: 0.2 }, { maxDiffPixelRatio: -1 },
    { maxDiffPixelRatio: 1.1 }, { maxDiffPixelRatio: NaN },
    { maxDiffPixelRatio: Infinity }, { maxDiffPixelRatio: '0' }]) {
    await assert.rejects(compareScreenshot(valid, valid, options), TypeError);
  }
  for (const invalid of ['relative.png', null, 42]) {
    await assert.rejects(compareScreenshot(invalid, valid), /absolute Host paths/);
    await assert.rejects(compareScreenshot(valid, invalid), /absolute Host paths/);
  }
  await assert.rejects(compareScreenshot(join(directory, 'missing.png'), valid), /ENOENT/);
  for (const bytes of [Buffer.from('not an image'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.from([0xff, 0xd8])]) {
    const corrupt = join(directory, 'corrupt.png');
    await writeFile(corrupt, bytes);
    await assert.rejects(compareScreenshot(corrupt, valid));
  }
});

test('toHaveScreenshot round-trips through Controller and preserves errors under not', async context => {
  const { directory, write } = await images(context);
  const actual = await write('actual.png', 4, 4, [0, 0, 0, 255]);
  const baseline = await write('baseline.png', 4, 4, [255, 255, 255, 255]);
  const receivers = new Map();
  const requests = [];
  const originalSend = Object.getOwnPropertyDescriptor(globalThis, 'send');
  const originalRecv = Object.getOwnPropertyDescriptor(globalThis, 'recv');
  context.after(() => {
    for (const [name, descriptor] of [['send', originalSend], ['recv', originalRecv]]) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  globalThis.recv = (type, callback) => receivers.set(type, callback);
  globalThis.send = event => {
    requests.push(event.payload);
    const script = { post(message) {
      const callback = receivers.get(message.type);
      receivers.delete(message.type);
      callback(message);
    } };
    return handleControllerMessage(script, { type: 'send', payload: event }, null, {});
  };
  const expect = createExpect();
  await expect(actual).toHaveScreenshot(actual);
  await expect(actual).not.toHaveScreenshot(baseline);
  await expect(actual).toHaveScreenshot(baseline, { maxDiffPixelRatio: 1 });
  assert.deepEqual(requests.at(-1).payload, { actualPath: actual, baselinePath: baseline,
    options: { maxDiffPixelRatio: 1 } });
  assert.equal(requests.at(-1).action, 'screenshot.compare');
  await assert.rejects(expect(actual, 'search page').toHaveScreenshot(baseline), error => {
    assert.ok(error instanceof AssertionError);
    assert.match(error.message, /search page: Screenshot difference ratio 1; allowed 0/);
    assert.equal(error.matcher, 'toHaveScreenshot');
    return true;
  });
  await assert.rejects(expect(actual).not.toHaveScreenshot(actual), AssertionError);
  await assert.rejects(expect(actual).not.toHaveScreenshot(join(directory, 'missing.png')), /ENOENT/);
  await assert.rejects(expect(actual).not.toHaveScreenshot(actual, { maxDiffPixelRatio: 2 }), /\[0, 1\]/);
  globalThis.send = event => receivers.get(`mobile-easy-use.controller.response.${event.payload.requestId}`)({
    payload: { ok: true, responsePayload: { matches: 'true' } },
  });
  await assert.rejects(expect(actual).not.toHaveScreenshot(actual), /boolean/);
  globalThis.send = () => { throw new Error('transport failed'); };
  await assert.rejects(expect(actual).not.toHaveScreenshot(actual), /transport failed/);
});
