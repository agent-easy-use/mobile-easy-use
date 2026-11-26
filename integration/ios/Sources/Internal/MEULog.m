#import "MEULog.h"

#import <pthread.h>
#import <stdarg.h>
#import <stdatomic.h>
#import <stdlib.h>
#import <string.h>

struct MEULogSubscription {
    MEULogFilter *filters;
    unsigned int count;
    MEULogCallback callback;
    struct MEULogSubscription *next;
};

static pthread_rwlock_t MEULogLock = PTHREAD_RWLOCK_INITIALIZER;
static MEULogSubscription *MEUSubscriptions;
static atomic_uint MEUSubscriptionCount;

@implementation MEULog
@end

static BOOL MEUCStringStartsWith(const char *value, const char *prefix) {
    if (value == NULL || prefix == NULL) {
        return NO;
    }
    while (*prefix != '\0') {
        if (*value == '\0' || *value != *prefix) {
            return NO;
        }
        value++;
        prefix++;
    }
    return YES;
}

static char *MEUCopyLogMessage(NSString *format, va_list arguments) {
    va_list copiedArguments;
    va_copy(copiedArguments, arguments);
    NSString *message = nil;
    @try {
        message = [[NSString alloc]
            initWithFormat:format
                 arguments:copiedArguments];
    } @catch (__unused NSException *exception) {
        // Evidence formatting must never change the original NSLog behavior.
    } @finally {
        va_end(copiedArguments);
    }

    const char *utf8 = message.UTF8String;
    return utf8 != NULL ? strdup(utf8) : NULL;
}

static const char *MEUDynamicTag(NSString *format, va_list arguments) {
    if (![format isKindOfClass:NSString.class] || ![format hasPrefix:@"[%@]"]) return NULL;
    va_list copiedArguments;
    va_copy(copiedArguments, arguments);
    __unsafe_unretained id value = va_arg(copiedArguments, id);
    va_end(copiedArguments);
    return [value isKindOfClass:NSString.class] ? [(NSString *)value UTF8String] : NULL;
}

__attribute__((noinline, visibility("default"), used))
MEULogSubscription *mobile_easy_use_register_nslog_watch(
    MEULogFilter *filters, unsigned int count, MEULogCallback callback
) {
    MEULogSubscription *watch = calloc(1, sizeof(*watch));
    if (watch == NULL) return NULL;
    watch->filters = filters;
    watch->count = count;
    watch->callback = callback;
    pthread_rwlock_wrlock(&MEULogLock);
    watch->next = MEUSubscriptions;
    MEUSubscriptions = watch;
    atomic_fetch_add(&MEUSubscriptionCount, 1);
    pthread_rwlock_unlock(&MEULogLock);
    return watch;
}

__attribute__((noinline, visibility("default"), used))
void mobile_easy_use_unregister_nslog_watch(MEULogSubscription *watch) {
    pthread_rwlock_wrlock(&MEULogLock);
    MEULogSubscription **entry = &MEUSubscriptions;
    while (*entry != NULL && *entry != watch) entry = &(*entry)->next;
    if (*entry == watch) {
        *entry = watch->next;
        atomic_fetch_sub(&MEUSubscriptionCount, 1);
        free(watch);
    }
    pthread_rwlock_unlock(&MEULogLock);
}

static void MEUCaptureLog(NSString *format, va_list arguments) {
    if (atomic_load(&MEUSubscriptionCount) == 0) return;
    const char *rawFormat = [format isKindOfClass:NSString.class] ? format.UTF8String : NULL;
    const char *dynamicTag = MEUDynamicTag(format, arguments);
    char *message = NULL;
    BOOL formatted = NO;
    // Callbacks only collect records; they must not register/unregister watches.
    pthread_rwlock_rdlock(&MEULogLock);
    for (MEULogSubscription *watch = MEUSubscriptions; watch != NULL; watch = watch->next) {
        for (unsigned int i = 0; i < watch->count; i++) {
            MEULogFilter *filter = &watch->filters[i];
            if (!MEUCStringStartsWith(rawFormat, filter->prefix) &&
                !(dynamicTag != NULL && strcmp(dynamicTag, filter->tag) == 0)) continue;
            if (!formatted) {
                message = MEUCopyLogMessage(format, arguments);
                formatted = YES;
            }
            if (message != NULL) watch->callback(filter->tag, message);
            break;
        }
    }
    pthread_rwlock_unlock(&MEULogLock);
    free(message);
}

__attribute__((noinline, visibility("default"), used))
void mobile_easy_use_replace_nslog(NSString *format, ...) {
    va_list arguments;
    va_start(arguments, format);
    MEUCaptureLog(format, arguments);
    // Preserve original output exactly once, even with overlapping watchers.
    NSLogv(format, arguments);
    va_end(arguments);
}
