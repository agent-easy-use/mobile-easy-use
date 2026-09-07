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

/** Bounded native operations for chain capture integration tests. */
@interface APIChainCaptureFixture : NSObject
+ (instancetype)sharedState;
- (void)reset;
- (NSInteger)calls;
- (NSUInteger)retainedBytes;
- (NSString *)work:(NSString *)key bytes:(int)bytes delay:(int)delayMs;
- (NSString *)plain:(NSString *)key;
- (int)recursive:(int)depth;
- (void)startWorkers;
- (NSInteger)workersDone;
- (NSInteger)workersPeak;
- (NSString *)workerResults;
- (int)worker:(int)identifier;
- (int)contextDepth:(int)depth;
- (int)contextLeaf;
- (BOOL)booleanValue:(BOOL)value;
- (signed char)byteValue:(signed char)value;
- (int64_t)signedValue:(int64_t)value;
- (uint64_t)unsignedValue:(uint64_t)value;
- (NSString *)nullable:(NSString *)value;
- (void)consume:(NSString *)value;
- (BOOL)exerciseScalars;
- (double)floating:(double)value;
- (NSRange)rangeValue:(NSRange)value;
- (BOOL)exerciseUnsupported;
@end
