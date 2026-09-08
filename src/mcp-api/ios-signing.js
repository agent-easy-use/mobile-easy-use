import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export class IOSSigningError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function signingFailureFromOutput(output) {
  if (/No Accounts:|Add a new account in Accounts settings|Your session has expired|Unable to log in with account/i.test(output)) {
    return new IOSSigningError('IOS_SIGNING_SETUP_REQUIRED', 'Xcode could not use an Apple Account to sign the Runner. Open Xcode > Settings > Apple Accounts and sign in to, or refresh, the account you use for iOS development. Then follow Repair in the Runner signing section of to-ios-integrate. If that account cannot use the previously selected signing team, select an available team during repair.');
  }
  if (/errSecInteractionNotAllowed|User interaction is not allowed|errSecInternalComponent/i.test(output)) {
    return new IOSSigningError('IOS_SIGNING_KEYCHAIN_ERROR', 'Xcode could not access the signing key. Unlock the signing Keychain and allow codesign access, then follow Repair in the Runner signing section of to-ios-integrate.');
  }
  const lines = output.split(/\r?\n/).filter(line => /error:.*(?:provision|signing|certificate|register|App ID|development team|No profiles)/i.test(line));
  if (lines.length > 0) {
    return new IOSSigningError('IOS_SIGNING_PROVISIONING_FAILED', `Xcode could not sign the Runner for the selected team. Follow Repair in the Runner signing section of to-ios-integrate to check account permissions, device registration, and provisioning: ${lines.slice(0, 3).join('\n')}`);
  }
  return null;
}

// Consumes the configuration written by the independent to-ios-integrate skill.
export async function readIOSSigning({ hardwareUdid }, {
  directory = join(process.env.MEU_HOME || join(homedir(), '.meu'), 'ios/signing'),
} = {}) {
  const deviceKey = createHash('sha256').update(hardwareUdid).digest('hex');
  const path = join(directory, 'devices', `${deviceKey}.json`);
  let record;
  try {
    record = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new IOSSigningError('IOS_SIGNING_SETUP_REQUIRED', 'No verified signing configuration exists for this device. Follow Setup in the Runner signing section of to-ios-integrate first.');
    }
    throw new IOSSigningError('IOS_SIGNING_CONFIG_ERROR', `Cannot read signing configuration at ${path}: ${error.message}. Follow Repair in the Runner signing section of to-ios-integrate.`);
  }
  if (!/^[A-Z0-9]{10}$/.test(record?.teamId ?? '')
      || !/^com\.mobileeasyuse\.runner\.t[a-z0-9]{10}\.r[a-f0-9]{16}$/.test(record?.bundleId ?? '')) {
    throw new IOSSigningError('IOS_SIGNING_CONFIG_ERROR', `Invalid saved signing configuration at ${path}. Follow Repair in the Runner signing section of to-ios-integrate.`);
  }
  return { teamId: record.teamId, bundleId: record.bundleId, source: 'saved' };
}
