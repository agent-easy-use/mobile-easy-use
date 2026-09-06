#include <dlfcn.h>
#include <limits.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/sysctl.h>
#include <unistd.h>

#define MEU_RUNTIME_BOOTSTRAP_MAGIC 0x4D455542u

typedef struct {
  uint32_t magic;
  _Atomic int32_t state;
  char error[256];
} MEURuntimeBootstrapStatus;

__attribute__((visibility("default"))) MEURuntimeBootstrapStatus
    mobile_easy_use_runtime_bootstrap_status = {
        .magic = MEU_RUNTIME_BOOTSTRAP_MAGIC,
        .state = 0,
        .error = "",
    };

static int MEUIsDebuggerAttached(void) {
  int query[4] = {CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()};
  struct kinfo_proc processInfo;
  memset(&processInfo, 0, sizeof(processInfo));
  size_t processInfoSize = sizeof(processInfo);
  if (sysctl(query, 4, &processInfo, &processInfoSize, NULL, 0) != 0) {
    return 0;
  }
  return (processInfo.kp_proc.p_flag & P_TRACED) != 0;
}

static void MEUFinishRuntimeLoad(int state) {
  atomic_store(&mobile_easy_use_runtime_bootstrap_status.state, state);
}

static void *MEULoadRuntime(void *context) {
  (void)context;
  if (!MEUIsDebuggerAttached()) {
    snprintf(mobile_easy_use_runtime_bootstrap_status.error,
             sizeof(mobile_easy_use_runtime_bootstrap_status.error),
             "debugger detached before runtime load");
    MEUFinishRuntimeLoad(-1);
    return NULL;
  }

  Dl_info imageInfo;
  if (dladdr((const void *)&MEULoadRuntime, &imageInfo) == 0 || imageInfo.dli_fname == NULL) {
    snprintf(mobile_easy_use_runtime_bootstrap_status.error,
             sizeof(mobile_easy_use_runtime_bootstrap_status.error),
             "could not resolve bridge image path");
    MEUFinishRuntimeLoad(-1);
    return NULL;
  }

  char runtimePath[PATH_MAX];
  const char *lastSeparator = strrchr(imageInfo.dli_fname, '/');
  if (lastSeparator == NULL) {
    snprintf(mobile_easy_use_runtime_bootstrap_status.error,
             sizeof(mobile_easy_use_runtime_bootstrap_status.error),
             "bridge image path has no directory");
    MEUFinishRuntimeLoad(-1);
    return NULL;
  }
  size_t directoryLength = (size_t)(lastSeparator - imageInfo.dli_fname);
  int written = snprintf(
      runtimePath,
      sizeof(runtimePath),
      "%.*s/MobileEasyUseRuntime.dylib",
      (int)directoryLength,
      imageInfo.dli_fname);
  if (written <= 0 || (size_t)written >= sizeof(runtimePath)) {
    snprintf(mobile_easy_use_runtime_bootstrap_status.error,
             sizeof(mobile_easy_use_runtime_bootstrap_status.error),
             "runtime image path is too long");
    MEUFinishRuntimeLoad(-1);
    return NULL;
  }

  if (dlopen(runtimePath, RTLD_NOW | RTLD_LOCAL) == NULL) {
    const char *error = dlerror();
    snprintf(
        mobile_easy_use_runtime_bootstrap_status.error,
        sizeof(mobile_easy_use_runtime_bootstrap_status.error),
        "%s",
        error != NULL ? error : "dlopen returned null");
    MEUFinishRuntimeLoad(-1);
    return NULL;
  }

  MEUFinishRuntimeLoad(2);
  return NULL;
}

__attribute__((visibility("default"))) int mobile_easy_use_load_runtime_async(void) {
  if (!MEUIsDebuggerAttached()) {
    snprintf(mobile_easy_use_runtime_bootstrap_status.error,
             sizeof(mobile_easy_use_runtime_bootstrap_status.error),
             "LLDB is not attached");
    return -1;
  }

  int expected = 0;
  if (!atomic_compare_exchange_strong(
          &mobile_easy_use_runtime_bootstrap_status.state, &expected, 1)) {
    return expected == 1 || expected == 2 ? 0 : -1;
  }

  pthread_t thread;
  int status = pthread_create(&thread, NULL, MEULoadRuntime, NULL);
  if (status != 0) {
    snprintf(mobile_easy_use_runtime_bootstrap_status.error,
             sizeof(mobile_easy_use_runtime_bootstrap_status.error),
             "pthread_create failed: %d", status);
    atomic_store(&mobile_easy_use_runtime_bootstrap_status.state, -1);
    return -1;
  }
  pthread_detach(thread);
  return 0;
}

__attribute__((visibility("default"))) int mobile_easy_use_runtime_bootstrap_state(void) {
  return atomic_load(&mobile_easy_use_runtime_bootstrap_status.state);
}

__attribute__((visibility("default"))) const char *mobile_easy_use_runtime_bootstrap_error(void) {
  return mobile_easy_use_runtime_bootstrap_status.error;
}

__attribute__((constructor)) static void MEURuntimeBootstrapInitialize(void) {
  (void)mobile_easy_use_load_runtime_async();
}
