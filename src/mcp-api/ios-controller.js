export const IOS_CONTROLLER_ACTIONS = new Map([
  ['ios.input.perform', performInput],
]);

async function performInput(payload, _data, _owner, connection) {
  requireIOSConnection(connection);
  requireObject(payload, 'ios.input.perform payload');
  requireObject(payload.command, 'ios.input.perform payload.command');

  const runner = connection.iosRunner;
  if (runner === null) {
    throw new Error('RUNNER_UNAVAILABLE: iOS XCTest Runner is unavailable');
  }
  return runner.perform(payload.command);
}

function requireIOSConnection(connection) {
  if (connection === null || connection === undefined || connection.platform !== 'ios') {
    throw new Error('iOS Controller actions require an active iOS target connection');
  }
}

function requireObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}
