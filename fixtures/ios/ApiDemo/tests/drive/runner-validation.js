import ObjC from 'frida-objc-bridge';
import { requestController } from '../../../../../sdk/common/controller.js';
import { prepareInputCommand } from '../../../../../sdk/ios/drive/input/input-target.js';
import { openScene, returnHome } from './helpers/input-scene.js';
const { describe, test, beforeEach, afterEach, expect, run } = Test.create();
export { run };
const count = () => common.runOnMainThread(() => JSON.parse(String(ObjC.classes.APIController.snapshotJSON())).counter);
describe('native input runner validation', () => {
  beforeEach(async () => { await openScene('click', 'api.input.click'); });
  afterEach(returnHome);
  for (const invalid of ['expired', 'orientation']) {
    test(`${invalid} command cannot click and a fresh command still succeeds`, async () => {
      // Exercise the real Runner protocol with a stale command; public drive normally
      // constructs these fields itself. No Runner or event synthesizer is mocked.
      const command = await common.runOnMainThread(() => prepareInputCommand('click', 'api.input.click'));
      command.expiresAt = Date.now() + 29000;
      if (invalid === 'expired') command.expiresAt = Date.now() - 1;
      else command.orientation = command.orientation === 1 ? 3 : 1;
      const before = await count();
      const reply = await requestController('ios.input.perform', { command }, 30000);
      expect(reply.ok, 'Controller request completes').toBe(true);
      expect(reply.responsePayload.ok).toBe(false);
      expect(reply.responsePayload.error.code).toBe(invalid === 'expired' ? 'INPUT_TIMEOUT' : 'INVALID_COORDINATES');
      expect(await count()).toBe(before);
      const clicked = await drive.click('api.input.click');
      expect(clicked.ok, JSON.stringify(clicked)).toBe(true);
      expect(await count()).toBe(before + 1);
    });
  }
});
