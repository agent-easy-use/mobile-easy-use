#import "MEUScreenshot.h"
#import "MEUUIQuery.h"

static dispatch_queue_t MEUScreenshotEncodingQueue(void) {
    static dispatch_queue_t queue;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        queue = dispatch_queue_create(
            "com.agenteasyuse.mobileeasyuse.screenshot-encoder",
            DISPATCH_QUEUE_SERIAL);
    });
    return queue;
}

static NSDictionary<NSString *, id> *MEUScreenshotFailure(NSString *message) {
    return @{
        @"ok": @NO,
        @"error": message ?: @"Screenshot capture failed",
        @"artifacts": @[],
    };
}

static void MEUCompleteScreenshotAsync(
        MEUScreenshotCompletion completion,
        NSDictionary<NSString *, id> *result) {
    dispatch_async(MEUScreenshotEncodingQueue(), ^{
        completion(result);
    });
}

@implementation MEUScreenshot

+ (void)captureWindowWithTargets:(NSDictionary<NSString *, UIView *> *)targets
                   includeWindow:(BOOL)includeWindow
                         quality:(CGFloat)quality
                      completion:(MEUScreenshotCompletion)completion {
    if (completion == nil) return;
    MEUScreenshotCompletion callback = [completion copy];
    void (^render)(void) = ^{
        @autoreleasepool {
            UIWindow *window = [MEUUIQuery focusedWindow];
            if (window == nil || CGRectIsEmpty(window.bounds)) {
                MEUCompleteScreenshotAsync(
                    callback,
                    MEUScreenshotFailure(@"Focused App Window is unavailable"));
                return;
            }

            UIGraphicsImageRendererFormat *format = [UIGraphicsImageRendererFormat defaultFormat];
            format.opaque = window.opaque;
            UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc]
                initWithBounds:window.bounds format:format];
            __block BOOL complete = YES;
            UIImage *windowImage = [renderer
                imageWithActions:^(UIGraphicsImageRendererContext *context) {
                    (void)context;
                    complete = [window drawViewHierarchyInRect:window.bounds
                                            afterScreenUpdates:YES];
                }];
            if (windowImage == nil || windowImage.CGImage == nil) {
                MEUCompleteScreenshotAsync(
                    callback,
                    MEUScreenshotFailure(@"Window rendering returned no image"));
                return;
            }

            NSMutableDictionary<NSString *, NSValue *> *targetBounds =
                [NSMutableDictionary dictionary];
            [targets enumerateKeysAndObjectsUsingBlock:^(NSString *uiKey, UIView *view, BOOL *stop) {
                (void)stop;
                if (![view isKindOfClass:UIView.class] || view.window != window || view.hidden
                        || view.alpha <= 0.01 || CGRectIsEmpty(view.bounds)) {
                    return;
                }
                CGRect logicalBounds = [view convertRect:view.bounds toView:window];
                CGRect visibleBounds = CGRectIntersection(logicalBounds, window.bounds);
                if (!CGRectIsNull(visibleBounds) && !CGRectIsEmpty(visibleBounds)) {
                    targetBounds[uiKey] = [NSValue valueWithCGRect:visibleBounds];
                }
            }];

            NSDictionary<NSString *, NSValue *> *capturedBounds = [targetBounds copy];
            dispatch_async(MEUScreenshotEncodingQueue(), ^{
                @autoreleasepool {
                    CGFloat normalizedQuality = MAX(0.01, MIN(1.0, quality));
                    NSMutableArray<NSDictionary<NSString *, id> *> *artifacts =
                        [NSMutableArray array];

                    if (includeWindow) {
                        NSData *windowData = UIImageJPEGRepresentation(
                            windowImage,
                            normalizedQuality);
                        if (windowData == nil) {
                            callback(MEUScreenshotFailure(@"JPEG compression failed"));
                            return;
                        }
                        [artifacts addObject:@{
                            @"scope": @"window",
                            @"mimeType": @"image/jpeg",
                            @"width": @(CGImageGetWidth(windowImage.CGImage)),
                            @"height": @(CGImageGetHeight(windowImage.CGImage)),
                            @"data": windowData,
                        }];
                    }

                    CGFloat scale = windowImage.scale;
                    [capturedBounds enumerateKeysAndObjectsUsingBlock:^(
                            NSString *uiKey,
                            NSValue *boundsValue,
                            BOOL *stop) {
                        (void)stop;
                        CGRect visibleBounds = boundsValue.CGRectValue;
                        CGRect pixelBounds = CGRectMake(
                            visibleBounds.origin.x * scale,
                            visibleBounds.origin.y * scale,
                            visibleBounds.size.width * scale,
                            visibleBounds.size.height * scale);
                        CGImageRef cropped = CGImageCreateWithImageInRect(
                            windowImage.CGImage,
                            pixelBounds);
                        if (cropped == nil) return;
                        UIImage *elementImage = [UIImage
                            imageWithCGImage:cropped
                                     scale:scale
                               orientation:UIImageOrientationUp];
                        CGImageRelease(cropped);
                        NSData *elementData = UIImageJPEGRepresentation(
                            elementImage,
                            normalizedQuality);
                        if (elementData == nil) return;
                        [artifacts addObject:@{
                            @"scope": @"element",
                            @"uiKey": uiKey,
                            @"mimeType": @"image/jpeg",
                            @"width": @(CGImageGetWidth(elementImage.CGImage)),
                            @"height": @(CGImageGetHeight(elementImage.CGImage)),
                            @"bounds": @{
                                @"x": @(visibleBounds.origin.x),
                                @"y": @(visibleBounds.origin.y),
                                @"width": @(visibleBounds.size.width),
                                @"height": @(visibleBounds.size.height),
                            },
                            @"data": elementData,
                        }];
                    }];

                    callback(@{
                        @"ok": @YES,
                        @"captureMethod": @"draw-view-hierarchy",
                        @"complete": @(complete),
                        @"artifacts": artifacts,
                    });
                }
            });
        }
    };

    if (NSThread.isMainThread) {
        render();
    } else {
        dispatch_async(dispatch_get_main_queue(), render);
    }
}

@end
