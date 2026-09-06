#import <Foundation/Foundation.h>

typedef struct {
    const char *tag;
    const char *prefix;
} MEULogFilter;

typedef void (*MEULogCallback)(const char *tag, const char *message);

@interface MEULog : NSObject
@end

__attribute__((visibility("default")))
void mobile_easy_use_set_nslog_capture(
    MEULogFilter *filters,
    unsigned int count,
    MEULogCallback callback
);

__attribute__((visibility("default")))
void mobile_easy_use_replace_nslog(NSString *format, ...) NS_FORMAT_FUNCTION(1, 2);
