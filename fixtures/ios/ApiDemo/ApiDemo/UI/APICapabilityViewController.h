#import <UIKit/UIKit.h>

@interface APICapabilityViewController : UIViewController

- (instancetype)initWithCategory:(NSString *)category;
- (NSInteger)resetCurrentScenario;
- (void)scheduleFixtureAction:(NSString *)action key:(NSString *)key delayMs:(NSInteger)delayMs;
- (NSDictionary *)fixtureSnapshot;

@property(nonatomic, copy, readonly) NSString *category;
@property(nonatomic, copy, readonly) NSString *scenario;

@end
