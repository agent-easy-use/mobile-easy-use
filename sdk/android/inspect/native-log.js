const LEVELS = { 2: 'v', 3: 'd', 4: 'i', 5: 'w', 6: 'e', 7: 'f' };

const NATIVE_LOG_SOURCE = `
#include <gum/guminterceptor.h>
#include <stddef.h>
#include <stdint.h>

typedef struct {
  size_t struct_size;
  int32_t buffer_id;
  int32_t priority;
  const char *tag;
  const char *file;
  uint32_t line;
  const char *message;
} AndroidLogMessage;

// The node owns no JS allocations: tags and callback are borrowed until unregister.
typedef struct Subscription {
  unsigned int count;
  const char **tags;
  void (*callback)(int, const char *, const char *);
  struct Subscription *next;
} Subscription;

// CModule has no pthread headers; JS supplies opaque Android bionic storage.
extern char subscriptions_lock;
extern int pthread_rwlock_init(void *lock, const void *attributes);
extern int pthread_rwlock_destroy(void *lock);
extern int pthread_rwlock_rdlock(void *lock);
extern int pthread_rwlock_wrlock(void *lock);
extern int pthread_rwlock_unlock(void *lock);
extern Subscription *subscriptions;

// CModule lifecycle hooks. JS unload cleanup frees nodes before finalize destroys the lock.
void init(void) { pthread_rwlock_init(&subscriptions_lock, NULL); }
void finalize(void) { pthread_rwlock_destroy(&subscriptions_lock); }

Subscription *register_watch(const char **tags, unsigned int count,
    void (*callback)(int, const char *, const char *)) {
  Subscription *watch = g_malloc0(sizeof(Subscription));
  watch->tags = tags;
  watch->count = count;
  watch->callback = callback;
  pthread_rwlock_wrlock(&subscriptions_lock);
  watch->next = subscriptions;
  subscriptions = watch;
  pthread_rwlock_unlock(&subscriptions_lock);
  return watch;
}

void unregister_watch(Subscription *watch) {
  // A writer waits for all read-locked callbacks, so the node can be freed here.
  pthread_rwlock_wrlock(&subscriptions_lock);
  Subscription **entry = &subscriptions;
  while (*entry != NULL && *entry != watch) entry = &(*entry)->next;
  if (*entry == watch) {
    *entry = watch->next;
    g_free(watch);
  }
  pthread_rwlock_unlock(&subscriptions_lock);
}

static int equal(const char *left, const char *right) {
  while (*left != '\\0' && *left == *right) { left++; right++; }
  return *left == *right;
}

static void receive(int priority, const char *tag, const char *message) {
  if (tag == NULL || message == NULL) return;
  // Runs on the emitting thread. Unmatched logs never enter JS.
  // Keep the read lock through delivery to protect nodes and borrowed pointers.
  // Callbacks only collect records; they must not register/unregister watches.
  pthread_rwlock_rdlock(&subscriptions_lock);
  for (Subscription *watch = subscriptions; watch != NULL; watch = watch->next) {
    for (unsigned int i = 0; i < watch->count; i++) {
      if (!equal(tag, watch->tags[i])) continue;
      watch->callback(priority, tag, message);
      break;
    }
  }
  pthread_rwlock_unlock(&subscriptions_lock);
}

void on_enter_message(GumInvocationContext *context) {
  AndroidLogMessage *message = gum_invocation_context_get_nth_argument(context, 0);
  if (message == NULL || message->struct_size < offsetof(AndroidLogMessage, message) + sizeof(char *)) return;
  receive(message->priority, message->tag, message->message);
}

void on_enter_buf_write(GumInvocationContext *context) {
  receive((int) (intptr_t) gum_invocation_context_get_nth_argument(context, 1),
    gum_invocation_context_get_nth_argument(context, 2),
    gum_invocation_context_get_nth_argument(context, 3));
}
`;

// The shared listener lives until script unload. Registered resources must stay
// alive even if the caller drops its watcher without stopping it.
let runtime;
// Unlike the C list, this set keeps JS-owned strings, tables and callbacks alive.
const subscriptions = new Set();
function getRuntime() {
  if (runtime) return runtime;
  const liblog = Process.getModuleByName('liblog.so');
  const messageTarget = liblog.findExportByName('__android_log_write_log_message');
  const target = messageTarget ?? liblog.getExportByName('__android_log_buf_write');
  // These allocations back C extern variables; retain them for the module lifetime.
  const memory = {
    subscriptions_lock: Memory.alloc(Process.pointerSize === 8 ? 56 : 40), // bionic: int32_t[14 / 10]
    subscriptions: Memory.alloc(Process.pointerSize),
  };
  // Resolve system functions once; C calls their addresses directly, without JS.
  const symbols = { ...memory };
  for (const name of ['init', 'destroy', 'rdlock', 'wrlock', 'unlock']) {
    const symbol = `pthread_rwlock_${name}`;
    symbols[symbol] = Module.getGlobalExportByName(symbol);
  }
  const module = new CModule(NATIVE_LOG_SOURCE, symbols);
  const native = {
    memory, module,
    register: new NativeFunction(module.register_watch, 'pointer', ['pointer', 'uint', 'pointer']),
    unregister: new NativeFunction(module.unregister_watch, 'void', ['pointer']),
  };
  native.listener = Interceptor.attach(target, messageTarget ? module.on_enter_message : module.on_enter_buf_write);
  Script.bindWeak(native, () => {
    // runtime holds native strongly, so this is primarily a script-unload hook.
    // Pin keeps the script alive until asynchronous cleanup finishes.
    Script.pin();
    return Promise.all([...subscriptions].map(resource => resource.cleanup()))
      .finally(() => Script.unpin());
  });
  runtime = native;
  return runtime;
}

export async function installLogCapture(tags, receive) {
  const native = getRuntime();
  const strings = tags.map(tag => Memory.allocUtf8String(tag));
  const table = Memory.alloc(strings.length * Process.pointerSize);
  strings.forEach((tag, index) => table.add(index * Process.pointerSize).writePointer(tag));
  let enabled = true;
  // The read closure copies borrowed log text while the native call is still active.
  const callback = new NativeCallback((priority, tag, message) => {
    if (!enabled) return;
    if (receive(() => ({ tag: tag.readUtf8String() ?? '', level: LEVELS[priority] ?? `priority-${priority}`,
      message: message.readUtf8String() ?? '' })) === false) {
      // Capacity exhaustion rejects delivery; only stop/unload unregisters.
      enabled = false;
    }
  }, 'void', ['int', 'pointer', 'pointer']);
  const subscription = native.register(table, strings.length, callback);
  let resources = { strings, table, callback, subscription };
  // stop and script unload share one cleanup; failures may be retried.
  let cleanupPromise;
  const cleanup = () => {
    if (!cleanupPromise) cleanupPromise = Promise.resolve().then(() => {
      enabled = false;
      // Cooperative native call: release the JS lock while waiting for readers.
      // The write lock drains callbacks and frees the node before returning.
      native.unregister(subscription);
      // Native code no longer uses these pointers; drop our GC keepalive references.
      subscriptions.delete(resources);
      resources = null;
    }).catch(error => {
      cleanupPromise = undefined;
      throw error;
    });
    return cleanupPromise;
  };
  resources.cleanup = cleanup;
  subscriptions.add(resources);
  return cleanup;
}
