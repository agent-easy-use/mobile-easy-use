#import <UIKit/UIKit.h>

// Two real windows with independent native oracles; all configuration is test setup.
@interface APIInputWindowFixture : NSObject
- (instancetype)initWithContainer:(UIView *)container;
- (void)configure:(NSString *)mode;
- (UIView *)targetForAction:(NSString *)action front:(BOOL)front;
- (NSDictionary *)snapshot;
- (void)invalidate;
@end
