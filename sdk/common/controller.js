let controllerRequestSequence = 0;

/**
 * Request an allow-listed action from the Host-side Controller.
 *
 * Frida provides `send` and `recv` as globals in the injected Agent runtime; they are not
 * imported modules. When `payload.blob` is present, it is removed from the JSON payload and sent
 * through Frida's binary data argument. A valid Controller reply always resolves to
 * `{ ok, responsePayload }`, including replies where `ok` is false. Transport failures, malformed
 * replies, and timeouts reject the Promise.
 *
 * @param {string} action Controller action agreed by the Agent and Controller.
 * @param {Record<string, unknown> & { blob?: ArrayBuffer }} payload Action payload.
 * @param {number} timeout Maximum response wait in milliseconds.
 * @returns {Promise<{ok: boolean, responsePayload: unknown}>}
 */
function requestController(action, payload, timeout = 10000) {
  if (typeof action !== 'string' || action.length === 0) {
    return Promise.reject(new Error('Controller action must be a non-empty string'));
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return Promise.reject(new Error('Controller payload must be an object'));
  }
  if (!Number.isFinite(timeout) || timeout <= 0) {
    return Promise.reject(new Error('Controller timeout must be a positive number'));
  }
  if (typeof send !== 'function' || typeof recv !== 'function') {
    return Promise.reject(new Error('Controller transport is unavailable'));
  }

  const requestId = `${Date.now()}-${++controllerRequestSequence}`;
  const responseType = `mobile-easy-use.controller.response.${requestId}`;
  const { blob, ...messagePayload } = payload;
  if (blob !== undefined && !(blob instanceof ArrayBuffer)) {
    return Promise.reject(new Error('Controller payload blob must be an ArrayBuffer'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    recv(responseType, (message) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      const response = message?.payload;
      if (typeof response?.ok !== 'boolean'
          || !Object.hasOwn(response, 'responsePayload')) {
        reject(new Error(`Invalid Controller response for action: ${action}`));
        return;
      }
      resolve({
        ok: response.ok,
        responsePayload: response.responsePayload,
      });
    });
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Controller action timed out: ${action}`));
    }, timeout);

    const request = {
      source: 'mobile-easy-use',
      channel: 'controller.request',
      timestamp: Date.now(),
      payload: {
        requestId,
        action,
        payload: messagePayload,
      },
    };
    try {
      if (blob === undefined) {
        send(request);
      } else {
        send(request, blob);
      }
    } catch (error) {
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
  });
}

export { requestController };
