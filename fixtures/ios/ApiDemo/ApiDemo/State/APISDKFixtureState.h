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

/** Non-UI state for temporary field assignment and object lifetime verification. */
@interface APIOverrideFieldsBase : NSObject
@property(nonatomic, strong) NSString *inheritedText;
@end

@interface APIOverrideFieldsFixture : APIOverrideFieldsBase
@property(nonatomic) BOOL enabled;
@property(nonatomic) NSInteger mode;
@property(nonatomic) int64_t wide;
@property(nonatomic) double ratio;
@property(nonatomic) signed char byteMode;
@property(nonatomic) unsigned char unsignedByte;
@property(nonatomic) short shortMode;
@property(nonatomic) unsigned short unsignedShort;
@property(nonatomic) int intMode;
@property(nonatomic) unsigned int unsignedInt;
@property(nonatomic) long longMode;
@property(nonatomic) unsigned long unsignedLong;
@property(nonatomic) uint64_t unsignedWide;
@property(nonatomic) float floatRatio;
- (BOOL)extraScalarsOverridden;
- (BOOL)extraScalarsRestored;
- (BOOL)weakEmpty;
@property(nonatomic, strong) NSString *region;
@property(nonatomic, strong) NSArray *items;
@property(nonatomic, strong) id policy;
@property(nonatomic, strong) id optional;
@property(nonatomic, weak) id weakPolicy;
@property(nonatomic, unsafe_unretained) id unsafePolicy;
@property(nonatomic) NSRange range;
@property(nonatomic, copy) void (^callback)(void);
- (id)makeMock NS_RETURNS_RETAINED;
- (BOOL)weakHasOriginal;
- (void)dropMockOwner;
- (void)dropOriginalOwner;
- (BOOL)mockAlive;
- (BOOL)originalAlive;
- (BOOL)scalarsOverridden;
- (BOOL)scalarsRestored;
- (BOOL)objectsRestored;
@end
