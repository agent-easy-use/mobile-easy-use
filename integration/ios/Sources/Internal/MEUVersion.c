#ifndef MOBILE_EASY_USE_RELEASE_VERSION
#define MOBILE_EASY_USE_RELEASE_VERSION "unknown"
#endif

__attribute__((visibility("default")))
const char *mobile_easy_use_version(void) {
  return MOBILE_EASY_USE_RELEASE_VERSION;
}
