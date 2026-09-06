import { closeConnection } from './utils.js';

export async function disconnect(owner) {
  const connection = owner.currentConnection;
  if (connection === null) {
    owner.state = 'disconnected';
    return { connected: false, state: 'disconnected' };
  }

  await closeConnection(owner, connection);
  return { connected: false, state: 'disconnected' };
}
