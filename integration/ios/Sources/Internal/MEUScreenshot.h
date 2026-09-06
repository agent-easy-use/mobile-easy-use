#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^MEUScreenshotCompletion)(NSDictionary<NSString *, id> *result);

/// App-window screenshot bridge used by the injected JavaScript SDK.
@interface MEUScreenshot : NSObject

/// Renders on the main queue, then crops and encodes on a serial background queue.
+ (void)captureWindowWithTargets:(NSDictionary<NSString *, UIView *> *)targets
                   includeWindow:(BOOL)includeWindow
                         quality:(CGFloat)quality
                      completion:(MEUScreenshotCompletion)completion;

@end

NS_ASSUME_NONNULL_END
