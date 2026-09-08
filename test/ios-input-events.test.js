import assert from 'node:assert/strict';
import test from 'node:test';
import { createEventBackend } from '../sdk/runners/ios-input/events.js';
import { scrollCoordinates } from '../sdk/ios/common/input-geometry.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const nullPointer = { isNull: () => true };

function fixture({ version = '18.7.10', textSupported = true, sync = false } = {}) {
  const paths = [], records = [], sent = [];
  const sender = { refs: 1, retain() { this.refs += 1; return this; },
    release() { this.refs -= 1; assert.ok(this.refs >= 1); },
    synthesizeEvent_completion_(event, block) {
    sent.push({ event, complete: (ok = true) => block.implementation(ok, nullPointer) });
    if (sync) block.implementation(true, nullPointer);
  } };
  const ObjC = { classes: {
    UIDevice: { currentDevice: () => ({ systemVersion: () => version }) },
    XCUIDevice: { sharedDevice: () => ({ eventSynthesizer: () => sender }) },
    XCPointerEventPath: { alloc() {
      const path = { calls: [], refs: 1, release() { this.refs -= 1; assert.ok(this.refs >= 0); },
        initForTouchAtPoint_offset_(point, offset) { this.calls.push(['down', point, offset]); return this; },
        moveToPoint_atOffset_(point, offset) { this.calls.push(['move', point, offset]); },
        liftUpAtOffset_(offset) { this.calls.push(['up', offset]); },
        initForTextInput() { return this; },
      };
      if (textSupported) path.typeText_atOffset_typingSpeed_shouldRedact_ = function (text, offset, speed, redact) {
        this.calls.push(['text', text, offset, speed, redact]);
      };
      paths.push(path); return path;
    } },
    XCSynthesizedEventRecord: { alloc() {
      const event = { refs: 1, release() {
        this.refs -= 1; assert.ok(this.refs >= 0);
        if (this.path) this.path.release();
      }, initWithName_interfaceOrientation_(name, orientation) { this.orientation = orientation; return this; },
      addPointerEventPath_(path) { path.refs += 1; this.path = path; } };
      records.push(event); return event;
    } },
  }, Block: class { constructor(options) { Object.assign(this, options); } } };
  const onMain = (work) => new Promise((resolve, reject) => setImmediate(() => {
    try { resolve(work()); } catch (error) { reject(error); }
  }));
  const backend = createEventBackend(ObjC, onMain);
  const perform = (command, options = {}) => backend.perform({
    action: 'click', point: { x: 30, y: 40 }, orientation: 1, ...command,
  }, { expiresAt: Date.now() + 1000, beforeSubmit() {}, ...options });
  return { backend, perform, sent, paths, records };
}

test('input retains records and submits text only after successful focus completion', async () => {
  const f = fixture();
  const pending = f.perform({ action: 'input', text: '你好🙂' });
  await tick(); await tick();
  assert.equal(f.sent.length, 1);
  assert.ok(f.paths.every((path) => path.refs === 1));
  assert.ok(f.records.every((record) => record.refs === 1));
  f.sent[0].complete();
  await tick(); await tick();
  assert.equal(f.sent.length, 2);
  assert.deepEqual(f.paths[1].calls, [['text', '你好🙂', 0, 60, true]]);
  f.sent[1].complete();
  await pending;
  assert.ok(f.paths.every((path) => path.refs === 0));
  assert.ok(f.records.every((record) => record.refs === 0));
});

test('failed focus tap never sends text and cleans both records', async () => {
  const f = fixture();
  const pending = f.perform({ action: 'input', text: 'hello' });
  const rejected = assert.rejects(pending, /SYNTHESIS_FAILED/);
  await tick(); await tick();
  f.sent[0].complete(false);
  await rejected;
  assert.equal(f.sent.length, 1);
  assert.ok(f.records.every((record) => record.refs === 0));
});

test('unsupported text selector is detected before any touch', async () => {
  const f = fixture({ textSupported: false });
  await assert.rejects(f.perform({ action: 'input', text: 'hello' }), /UNSUPPORTED_SYNTHESIS/);
  assert.equal(f.sent.length, 0);
  assert.ok(f.paths.every((path) => path.refs === 0));
  assert.ok(f.records.every((record) => record.refs === 0));
});

test('late completion cleans up without permitting replay after an uncertain timeout', async () => {
  const f = fixture();
  await assert.rejects(f.perform({}, { expiresAt: Date.now() + 40 }), /SYNTHESIS_UNCERTAIN/);
  assert.equal(f.sent.length, 1);
  assert.equal(f.records[0].refs, 1);
  await assert.rejects(f.perform({}), /SYNTHESIS_UNCERTAIN/);
  f.sent[0].complete();
  await tick();
  assert.equal(f.records[0].refs, 0);
  await assert.rejects(f.perform({}), /SYNTHESIS_UNCERTAIN/);
  assert.equal(f.sent.length, 1);
});

test('expired or backgrounded commands are never dispatched', async () => {
  const f = fixture();
  await assert.rejects(f.perform({}, { expiresAt: Date.now() - 1 }), /INPUT_TIMEOUT/);
  await assert.rejects(f.perform({}, { beforeSubmit() { throw new Error('TARGET_NOT_FOREGROUND'); } }), /TARGET_NOT_FOREGROUND/);
  assert.equal(f.sent.length, 0);
  assert.ok(f.records.every((record) => record.refs === 0));
});

test('native synchronous callback and iOS 26 long press are supported', async () => {
  const f = fixture({ version: '26.0', sync: true });
  await f.perform({ action: 'longPress', duration: 800, orientation: 3 });
  assert.deepEqual(f.paths[0].calls, [['down', [30, 40], 0], ['up', 0.8]]);
  assert.equal(f.records[0].orientation, 3);
  assert.equal(f.records[0].refs, 0);
});

test('scroll submits a complete timeline with clamped finger-direction endpoints', async () => {
  const bounds = { x: 10, y: 20, width: 100, height: 200 };
  for (const direction of ['up', 'down', 'left', 'right']) {
    const f = fixture({ sync: true });
    const gesture = scrollCoordinates(bounds, { x: 60, y: 120 }, direction, 1000);
    await f.perform({ action: 'scroll', gesture });
    const { startX, startY, endX, endY } = gesture;
    for (const [x, y] of [[startX, startY], [endX, endY]]) {
      assert.ok(x > 10 && x < 110 && y > 20 && y < 220);
    }
    if (direction === 'up') assert.ok(endY < startY);
    if (direction === 'down') assert.ok(endY > startY);
    if (direction === 'left') assert.ok(endX < startX);
    if (direction === 'right') assert.ok(endX > startX);
    assert.equal(f.sent.length, 1);
    assert.deepEqual(f.paths[0].calls.at(-1), ['up', 0.35]);
  }
});

test('other iOS majors fail explicitly without a public-tap fallback', async () => {
  const f = fixture({ version: '17.7' });
  await assert.rejects(f.perform({}), /UNSUPPORTED_SYNTHESIS/);
  assert.equal(f.sent.length, 0);
});
