#import "MEULog.h"

#import <stdarg.h>
#import <stdlib.h>
#import <string.h>

static MEULogFilter *MEULogFilters;
static unsigned int MEULogFilterCount;
static MEULogCallback MEULogCallbackFunction;

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

static MEULogFilter *MEUFindDynamicLogFilter(NSString *format, va_list arguments) {
    if (![format isKindOfClass:NSString.class] || ![format hasPrefix:@"[%@]"]) {
        return NULL;
    }

    va_list copiedArguments;
    va_copy(copiedArguments, arguments);
    __unsafe_unretained id value = va_arg(copiedArguments, id);
    va_end(copiedArguments);
    if (![value isKindOfClass:NSString.class]) {
        return NULL;
    }

    const char *tag = [(NSString *)value UTF8String];
    for (unsigned int index = 0; index < MEULogFilterCount; index++) {
        MEULogFilter *filter = &MEULogFilters[index];
        if (tag != NULL && filter->tag != NULL && strcmp(tag, filter->tag) == 0) {
            return filter;
        }
    }
    return NULL;
}

__attribute__((noinline, visibility("default"), used))
void mobile_easy_use_set_nslog_capture(
    MEULogFilter *filters,
    unsigned int count,
    MEULogCallback callback
) {
    MEULogFilters = filters;
    MEULogFilterCount = count;
    MEULogCallbackFunction = callback;
}

__attribute__((noinline, visibility("default"), used))
void mobile_easy_use_replace_nslog(NSString *format, ...) {
    va_list arguments;
    va_start(arguments, format);

    const char *rawFormat = [format isKindOfClass:NSString.class] ? format.UTF8String : NULL;
    MEULogCallback callback = MEULogCallbackFunction;
    MEULogFilter *matchedFilter = NULL;
    for (unsigned int index = 0; callback != NULL && index < MEULogFilterCount; index++) {
        MEULogFilter *filter = &MEULogFilters[index];
        if (!MEUCStringStartsWith(rawFormat, filter->prefix)) {
            continue;
        }
        matchedFilter = filter;
        break;
    }
    if (callback != NULL && matchedFilter == NULL) {
        matchedFilter = MEUFindDynamicLogFilter(format, arguments);
    }
    if (callback != NULL && matchedFilter != NULL) {
        char *message = MEUCopyLogMessage(format, arguments);
        if (message != NULL) {
            callback(matchedFilter->tag, message);
            free(message);
        }
    }

    // Preserve the original NSLog output exactly once. NSLogv is only the
    // internal va_list forwarding primitive; it is not an Evidence source.
    NSLogv(format, arguments);
    va_end(arguments);
}
