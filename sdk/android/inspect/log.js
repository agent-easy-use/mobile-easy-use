import { installLogCapture } from './native-log.js';
import { currentThreadName } from '../common/thread.js';

const MAX_RECORDS = 10000;
const MAX_TEXT_UNITS = 2 * 1024 * 1024; // About 4 MiB of UTF-16 text.

/**
 * Subscribe to exact TAG matches and collect records for this watcher.
 * watch() registers a subscription; stop() removes it and releases its resources.
 * The first watch installs a native liblog hook, shared until script unload.
 * Each log is matched against subscriptions in native code; matching callbacks
 * append records to their watcher buffers. current() returns a cumulative snapshot.
 * Native matching and callbacks hold a read lock; registration and removal hold
 * a write lock, so removal waits for active callbacks before freeing the node.
 * Capacity exhaustion rejects further records without unregistering. JS keeps
 * native resources alive until stop(), with cleanup for remaining watches on unload.
 */
async function watch(tags) {
  if (!Array.isArray(tags) || tags.length === 0 || Array.from(tags).some(tag =>
    typeof tag !== 'string' || tag.length === 0 || tag.includes('\0'))) {
    throw new TypeError('Expected a non-empty array of non-empty TAG strings without NUL');
  }
  // closed controls the public API; collecting also becomes false on capacity exhaustion.
  let closed = false, collecting = false;
  let captureError = null, textUnits = 0;
  const records = [];
  // Copy records so callers cannot mutate the internal buffer or earlier snapshots.
  const snapshot = (error = captureError) => ({
    ok: error === null,
    data: records.map(record => ({ ...record })),
    error,
  });
  // Frida serializes JS execution, but native calls can yield the JS lock.
  const receive = (read) => {
    if (!collecting) return;
    try {
      const timestamp = new Date().toISOString();
      const { tag, level, message } = read();
      const threadId = Process.getCurrentThreadId();
      const threadName = currentThreadName();
      // Native calls may let another callback or stop() run before we resume.
      if (!collecting) return;
      const size = tag.length + message.length + (threadName?.length ?? 0);
      if (records.length >= MAX_RECORDS || textUnits + size > MAX_TEXT_UNITS) {
        captureError ??= 'Log capture limit reached';
        collecting = false;
        // Reject further deliveries without requesting a write lock from this callback.
        return false;
      }
      // Capacity check and append stay together without native calls or await.
      records.push({ timestamp, threadName, threadId, tag, level, message });
      textUnits += size;
    } catch (error) {
      captureError ??= String(error?.message ?? error);
    }
  };
  const cleanup = await installLogCapture([...new Set(tags)], receive);
  collecting = true;
  let stopping, finished = false;
  return {
    async current() {
      if (closed) return { ok: false, data: [], error: 'Log watcher has stopped' };
      return snapshot();
    },
    async stop() {
      // Reject records immediately, including callbacks resuming after a native call.
      closed = true;
      collecting = false;
      if (finished) return snapshot();
      // Concurrent stops share cleanup; a failed attempt remains retryable.
      if (!stopping) {
        stopping = (async () => {
          try {
            await cleanup();
            finished = true;
            return null;
          } catch (error) {
            return String(error?.message ?? error);
          }
        })();
      }
      const error = await stopping;
      if (error !== null) stopping = undefined;
      return snapshot(error ?? captureError);
    },
  };
}

export const log = Object.freeze({ watch });
