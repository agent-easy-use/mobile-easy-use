#import <UIKit/UIKit.h>
@class APIInputWindowFixture;

@interface APICapabilityViewController : UIViewController

- (instancetype)initWithCategory:(NSString *)category;
- (NSInteger)resetCurrentScenario;
- (void)scheduleFixtureAction:(NSString *)action key:(NSString *)key delayMs:(NSInteger)delayMs;
- (NSDictionary *)fixtureSnapshot;

@property(nonatomic, copy, readonly) NSString *category;
@property(nonatomic, copy, readonly) NSString *scenario;
@property(nonatomic, strong, readonly) APIInputWindowFixture *inputWindows;

@end
