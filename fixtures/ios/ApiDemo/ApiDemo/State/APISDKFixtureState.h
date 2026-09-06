#import <Foundation/Foundation.h>

@interface APISDKFixtureState : NSObject

+ (instancetype)sharedState;
+ (NSString *)staticValue;

@property(nonatomic, readonly) NSInteger generation;
@property(nonatomic, copy, readonly) NSString *category;
@property(nonatomic, copy, readonly) NSString *scenario;
@property(nonatomic, readonly) NSInteger counter;
@property(nonatomic, readonly) NSInteger activationCount;
@property(nonatomic, copy, readonly) NSString *text;

- (NSInteger)resetForCategory:(NSString *)category scenario:(NSString *)scenario;
- (NSInteger)increment;
- (NSInteger)recordActivation;
- (void)recordText:(NSString *)text;
- (BOOL)featureForScope:(NSString *)scope;
- (NSString *)single:(NSString *)value;
- (NSInteger)originalCallCount:(NSString *)methodKey;
- (NSDictionary<NSString *, NSNumber *> *)originalCallCounts;
- (void)emitPrimaryLog;
- (void)emitSecondaryLog;
- (void)emitDynamicTagLog;

@end
