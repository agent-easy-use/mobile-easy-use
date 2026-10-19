#import "APIDebuggerFixture.h"
#import "ApiDemo-Swift.h"

// Keep a genuinely addressable local for source-level writes.
__attribute__((noinline)) static void debuggerTouch(NSInteger *value) { asm volatile("" : : "r"(value) : "memory"); }

@interface APIDebuggerFixture ()
@property(nonatomic) BOOL done;
@property(nonatomic, copy) NSString *failure;
@property(nonatomic) NSMutableArray *values;
@end

@implementation APIDebuggerFixture
+ (instancetype)shared {
    static APIDebuggerFixture *instance;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ instance = [self new]; });
    return instance;
}
- (NSInteger)calculate:(NSInteger)input {
    NSInteger price = input;
    NSString *label = @"hello 世界";
    NSNumber *object = @42;
    id empty = nil;
    debuggerTouch(&price); // BP_OC_VALUE
    self.tail += 1;
    self.result = price + self.field;
    (void)label; (void)object; (void)empty;
    return self.result;
}
- (void)performVoid {
    self.tail += 1; // BP_OC_VOID
}
- (void)start:(NSString *)operation count:(NSInteger)count {
    // Return to Frida before entering code that LLDB may stop.
    self.done = NO;
    self.failure = nil;
    self.field = 5;
    self.tail = 0;
    self.result = 0;
    self.values = [NSMutableArray array];
    dispatch_async(dispatch_get_main_queue(), ^{
        @try {
            APIDebuggerSwiftFixture *swift = [APIDebuggerSwiftFixture new];
            for (NSInteger i = 0; i < count; i++) {
                if ([operation isEqualToString:@"swift"]) {
                    [self.values addObject:@([swift calculate:10])];
                } else if ([operation isEqualToString:@"swiftVoid"]) {
                    [swift performVoid];
                    [self.values addObject:@"void"];
                } else if ([operation isEqualToString:@"ocVoid"]) {
                    [self performVoid];
                    [self.values addObject:@"void"];
                } else {
                    [self.values addObject:@([self calculate:10])];
                }
            }
            if ([operation hasPrefix:@"swift"]) {
                self.tail = swift.tail;
                self.result = swift.result;
                self.field = swift.field;
            }
        } @catch (NSException *error) { self.failure = error.description; }
        self.done = YES;
    });
}
- (NSString *)snapshotJSON {
    NSDictionary *state = @{@"done": @(self.done), @"values": self.values ?: @[],
        @"tail": @(self.tail), @"result": @(self.result), @"field": @(self.field),
        @"failure": self.failure ?: (id)[NSNull null]};
    NSData *data = [NSJSONSerialization dataWithJSONObject:state options:0 error:nil];
    return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
}
@end
