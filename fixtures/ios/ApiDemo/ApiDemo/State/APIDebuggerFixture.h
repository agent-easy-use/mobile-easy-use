#import <Foundation/Foundation.h>

@interface APIDebuggerFixture : NSObject
@property(nonatomic) NSInteger field;
@property(nonatomic) NSInteger tail;
@property(nonatomic) NSInteger result;
+ (instancetype)shared;
- (void)start:(NSString *)operation count:(NSInteger)count;
- (NSString *)snapshotJSON;
@end
