#import <Foundation/Foundation.h>

typedef struct {
    const char *tag;
    const char *prefix;
} MEULogFilter;

typedef void (*MEULogCallback)(const char *tag, const char *message);
typedef struct MEULogSubscription MEULogSubscription;

@interface MEULog : NSObject
@end

__attribute__((visibility("default")))
MEULogSubscription *mobile_easy_use_register_nslog_watch(
    MEULogFilter *filters, unsigned int count, MEULogCallback callback);

// Waits for read-locked callbacks, removes the subscription and frees its node.
// Must not be called from a log callback. Call once per subscription.
__attribute__((visibility("default")))
void mobile_easy_use_unregister_nslog_watch(MEULogSubscription *watch);

__attribute__((visibility("default")))
void mobile_easy_use_replace_nslog(NSString *format, ...) NS_FORMAT_FUNCTION(1, 2);
