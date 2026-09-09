#import <Foundation/Foundation.h>

/** Deliberately shared IMPs exercise selector and receiver matching. */
@interface APIMethodMatchFixture : NSObject
- (NSInteger)match:(NSInteger)value;
- (NSInteger)alias:(NSInteger)value;
+ (NSInteger)match:(NSInteger)value;
+ (NSInteger)alias:(NSInteger)value;
+ (void)resetCalls;
+ (NSInteger)calls;
+ (BOOL)sharedImplementationVerified;
@end

@interface APIMethodMatchChild : APIMethodMatchFixture @end
@interface APIMethodMatchGrandchild : APIMethodMatchChild @end
@interface APIMethodMatchOverride : APIMethodMatchFixture @end
@interface APIMethodMatchSibling : NSObject
- (NSInteger)match:(NSInteger)value;
- (NSInteger)alias:(NSInteger)value;
+ (NSInteger)match:(NSInteger)value;
+ (NSInteger)alias:(NSInteger)value;
@end
