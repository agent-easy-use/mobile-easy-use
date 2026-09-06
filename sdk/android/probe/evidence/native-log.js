import { safeConsole } from '../../common/reporting.js';
import { writeEvidence } from './utils.js';

const ANDROID_LOG_MODULE = 'liblog.so';
const ANDROID_LOG_MESSAGE_SYMBOL = '__android_log_write_log_message';
const ANDROID_LOG_BUF_WRITE_SYMBOL = '__android_log_buf_write';

const PRIORITY_LEVELS = Object.freeze({
  2: 'v',
  3: 'd',
  4: 'i',
  5: 'w',
  6: 'e',
  7: 'f',
});

const NATIVE_LOG_SOURCE = `
#include <gum/guminterceptor.h>
#include <stddef.h>
#include <stdint.h>

typedef struct _AndroidLogMessage {
  size_t struct_size;
  int32_t buffer_id;
  int32_t priority;
  const char *tag;
  const char *file;
  uint32_t line;
  const char *message;
} AndroidLogMessage;

extern void on_matched_log(
    int priority,
    const char *tag,
    const char *message);

static int strings_equal(const char *left, const char *right) {
  if (left == NULL || right == NULL) {
    return 0;
  }

  while (*left != '\\0' && *right != '\\0') {
    if (*left != *right) {
      return 0;
    }
    left++;
    right++;
  }

  return *left == '\\0' && *right == '\\0';
}

void on_enter_message(GumInvocationContext *context) {
  const char *expected_tag = (const char *)
      gum_invocation_context_get_listener_function_data(context);
  AndroidLogMessage *log_message = (AndroidLogMessage *)
      gum_invocation_context_get_nth_argument(context, 0);

  if (log_message == NULL ||
      log_message->struct_size < offsetof(AndroidLogMessage, message) + sizeof(const char *) ||
      !strings_equal(log_message->tag, expected_tag) ||
      log_message->message == NULL) {
    return;
  }

  on_matched_log(log_message->priority, log_message->tag, log_message->message);
}

void on_enter_buf_write(GumInvocationContext *context) {
  const char *expected_tag = (const char *)
      gum_invocation_context_get_listener_function_data(context);
  const char *actual_tag = (const char *)
      gum_invocation_context_get_nth_argument(context, 2);
  const char *message = (const char *)
      gum_invocation_context_get_nth_argument(context, 3);

  if (!strings_equal(actual_tag, expected_tag) || message == NULL) {
    return;
  }

  int priority = (int) (long)
      gum_invocation_context_get_nth_argument(context, 1);
  on_matched_log(priority, actual_tag, message);
}
`;

let nativeLogRuntime;
let activeCapture = null;
const tagPointersByValue = new Map();

function logLevel(priority) {
  return PRIORITY_LEVELS[priority] ?? `priority-${priority}`;
}

function readUtf8(pointer) {
  if (!pointer || pointer.isNull()) {
    return '';
  }
  return pointer.readUtf8String() ?? '';
}

function getNativeLogRuntime() {
  if (nativeLogRuntime) {
    return nativeLogRuntime;
  }

  const onMatchedLog = new NativeCallback((priority, tagPointer, messagePointer) => {
    const capture = activeCapture;
    if (!capture) {
      return;
    }
    try {
      writeEvidence('chain', {
        type: 'log',
        actionDescription: capture.actionDescription,
        level: logLevel(priority),
        tag: readUtf8(tagPointer),
        message: readUtf8(messagePointer),
      });
    } catch (_) {
    }
  }, 'void', ['int', 'pointer', 'pointer']);

  const module = new CModule(NATIVE_LOG_SOURCE, { on_matched_log: onMatchedLog });
  nativeLogRuntime = { module, onMatchedLog };
  return nativeLogRuntime;
}

function resolveAndroidLogTarget(runtime) {
  const module = Process.getModuleByName(ANDROID_LOG_MODULE);
  const messageTarget = module.findExportByName(ANDROID_LOG_MESSAGE_SYMBOL);
  if (messageTarget !== null) {
    return { callback: runtime.module.on_enter_message, target: messageTarget };
  }
  return {
    callback: runtime.module.on_enter_buf_write,
    target: module.getExportByName(ANDROID_LOG_BUF_WRITE_SYMBOL),
  };
}

function getTagPointer(tag) {
  let pointer = tagPointersByValue.get(tag);
  if (!pointer) {
    // Listener data may still be observed by an invocation already in flight while
    // detach runs. Keep one immutable native string per TAG for the script lifetime.
    pointer = Memory.allocUtf8String(tag);
    tagPointersByValue.set(tag, pointer);
  }
  return pointer;
}

function installNativeLogEvidenceHooks(tags, actionDescription) {
  if (!(tags instanceof Set) || tags.size === 0) {
    throw new Error('Native log hooks require at least one TAG');
  }
  if (activeCapture) {
    throw new Error('Native log evidence capture is already active');
  }

  const runtime = getNativeLogRuntime();
  const { callback, target } = resolveAndroidLogTarget(runtime);
  const listeners = [];
  activeCapture = { actionDescription };

  try {
    for (const tag of tags) {
      const tagPointer = getTagPointer(tag);
      listeners.push(Interceptor.attach(target, callback, tagPointer));
    }
  } catch (error) {
    for (const listener of listeners.reverse()) {
      try {
        listener.detach();
      } catch (_) {
      }
    }
    activeCapture = null;
    throw error;
  }

  let uninstalled = false;
  return () => {
    if (uninstalled) {
      return;
    }
    uninstalled = true;
    for (const listener of listeners.reverse()) {
      try {
        listener.detach();
      } catch (error) {
        safeConsole('warn', '[mobile-easy-use] native log hook cleanup failed', {
          message: String(error?.message ?? error),
        });
      }
    }
    activeCapture = null;
  };
}

export { installNativeLogEvidenceHooks };
