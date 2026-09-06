#import "APISDKFixtureState.h"

@interface APISDKFixtureState ()
@property(nonatomic) NSInteger generation;
@property(nonatomic, copy) NSString *category;
@property(nonatomic, copy) NSString *scenario;
@property(nonatomic) NSInteger counter;
@property(nonatomic) NSInteger activationCount;
@property(nonatomic, copy) NSString *text;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSNumber *> *callCounts;
@end

@implementation APISDKFixtureState

+ (instancetype)sharedState {
    static APISDKFixtureState *state;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        state = [[APISDKFixtureState alloc] init];
        state.category = @"main";
        state.scenario = @"catalog";
        state.text = @"";
        state.callCounts = [NSMutableDictionary dictionary];
    });
    return state;
}

+ (NSString *)staticValue {
    APISDKFixtureState *state = [self sharedState];
    @synchronized (state) {
        [state countCall:@"staticValue"];
    }
    return @"static-original";
}

- (NSInteger)resetForCategory:(NSString *)category scenario:(NSString *)scenario {
    @synchronized (self) {
        self.generation += 1;
        self.category = category ?: @"main";
        self.scenario = scenario ?: @"catalog";
        self.counter = 0;
        self.activationCount = 0;
        self.text = @"";
        [self.callCounts removeAllObjects];
        return self.generation;
    }
}

- (NSInteger)increment {
    @synchronized (self) {
        [self countCall:@"increment"];
        self.counter += 1;
        return self.counter;
    }
}

- (NSInteger)recordActivation {
    @synchronized (self) {
        self.activationCount += 1;
        return self.activationCount;
    }
}

- (void)recordText:(NSString *)text {
    @synchronized (self) {
        self.text = text ?: @"";
    }
}

- (BOOL)featureForScope:(NSString *)scope {
    @synchronized (self) {
        [self countCall:@"featureForScope:"];
        return [scope isEqualToString:@"enabled-scope"] && self.counter > 0;
    }
}

- (NSString *)single:(NSString *)value {
    @synchronized (self) {
        [self countCall:@"single:"];
        self.text = value ?: @"";
        return [NSString stringWithFormat:@"single:%@", value ?: @""];
    }
}

- (NSInteger)originalCallCount:(NSString *)methodKey {
    @synchronized (self) {
        return self.callCounts[methodKey].integerValue;
    }
}

- (NSDictionary<NSString *,NSNumber *> *)originalCallCounts {
    @synchronized (self) {
        return [self.callCounts copy];
    }
}

- (void)emitPrimaryLog {
    NSLog(@"[MEU.ApiDemo] chain-primary value=%d", 42);
}

- (void)emitSecondaryLog {
    NSLog(@"[MEU.ApiDemo.Other] chain-secondary");
}

- (void)emitDynamicTagLog {
    NSLog(@"[%@]chain-dynamic", @"MEU.ApiDemo");
}

- (void)countCall:(NSString *)key {
    self.callCounts[key] = @(self.callCounts[key].integerValue + 1);
}

@end
