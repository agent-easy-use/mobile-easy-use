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


@interface APIChainCaptureFixture ()
@property(nonatomic) NSInteger callCount;
@property(nonatomic, strong) NSMutableData *retained;
@property(nonatomic) NSInteger done;
@property(nonatomic) NSInteger active;
@property(nonatomic) NSInteger peak;
@property(nonatomic, strong) NSMutableArray<NSNumber *> *results;
@end

@implementation APIChainCaptureFixture
+ (instancetype)sharedState {
    static APIChainCaptureFixture *state;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ state = [APIChainCaptureFixture new]; [state reset]; });
    return state;
}
- (void)reset { @synchronized(self) { self.callCount=0; self.retained=nil; self.done=0; self.active=0; self.peak=0; self.results=[NSMutableArray array]; } }
- (NSInteger)calls { @synchronized(self) { return self.callCount; } }
- (NSUInteger)retainedBytes { @synchronized(self) { return self.retained.length; } }
- (NSString *)work:(NSString *)key bytes:(int)bytes delay:(int)delayMs {
    NSParameterAssert(bytes >= 0 && bytes <= 1048576 && delayMs >= 0 && delayMs <= 50);
    @synchronized(self) { self.callCount++; self.retained=[NSMutableData dataWithLength:bytes];
        if(bytes) memset(self.retained.mutableBytes, 1, bytes); }
    [NSThread sleepForTimeInterval:delayMs / 1000.0];
    return [NSString stringWithFormat:@"%@:%d", key, bytes];
}
- (NSString *)plain:(NSString *)key { @synchronized(self) { self.callCount++; } return [@"plain:" stringByAppendingString:key]; }
- (int)recursive:(int)depth {
    NSParameterAssert(depth >= 0 && depth <= 4);
    @synchronized(self) { self.callCount++; }
    return depth == 0 ? 1 : [self recursive:depth - 1] + 1;
}
- (NSInteger)workersDone { @synchronized(self) { return self.done; } }
- (NSInteger)workersPeak { @synchronized(self) { return self.peak; } }
- (NSString *)workerResults { @synchronized(self) { return self.results.description; } }
- (void)startWorkers {
    @synchronized(self) { self.done=0; self.active=0; self.peak=0; [self.results removeAllObjects]; }
    for(int identifier=1; identifier<=2; identifier++) {
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0), ^{
            @autoreleasepool {
                NSThread *thread = NSThread.currentThread;
                NSString *previousName = thread.name;
                thread.name = [NSString stringWithFormat:@"capture-worker-%d", identifier];
                @try {
                    int result=[self worker:identifier];
                    @synchronized(self) { [self.results addObject:@(result)]; }
                } @finally {
                    thread.name = previousName;
                    @synchronized(self) { self.done++; }
                }
            }
        });
    }
}
- (int)worker:(int)identifier {
    @synchronized(self) { self.callCount++; self.active++; self.peak=MAX(self.peak,self.active); }
    NSLog(@"[MEU.Context] worker:%d", identifier);
    [NSThread sleepForTimeInterval:0.05];
    @synchronized(self) { self.active--; }
    return identifier * 10;
}
- (int)contextDepth:(int)depth {
    NSParameterAssert(depth >= 0 && depth <= 12);
    return depth == 0 ? [self contextLeaf] : [self contextDepth:depth - 1] + 1;
}
- (int)contextLeaf {
    @synchronized(self) { self.callCount++; }
    NSLog(@"[MEU.Context] leaf");
    return 7;
}
- (BOOL)booleanValue:(BOOL)value { @synchronized(self) { self.callCount++; } return value; }
- (signed char)byteValue:(signed char)value { @synchronized(self) { self.callCount++; } return value; }
- (int64_t)signedValue:(int64_t)value { @synchronized(self) { self.callCount++; } return value; }
- (uint64_t)unsignedValue:(uint64_t)value { @synchronized(self) { self.callCount++; } return value; }
- (NSString *)nullable:(NSString *)value { @synchronized(self) { self.callCount++; } return value; }
- (void)consume:(NSString *)value { @synchronized(self) { self.callCount++; } }
- (BOOL)exerciseScalars {
    [self consume:nil];
    return ![self booleanValue:NO] && [self byteValue:-7] == -7
        && [self signedValue:INT64_MIN] == INT64_MIN && [self unsignedValue:UINT64_MAX] == UINT64_MAX
        && [self nullable:nil] == nil;
}
- (double)floating:(double)value { @synchronized(self) { self.callCount++; } return value + 0.5; }
- (NSRange)rangeValue:(NSRange)value { @synchronized(self) { self.callCount++; } return NSMakeRange(value.location + 1, value.length); }
- (BOOL)exerciseUnsupported { return [self floating:1.0] == 1.5 && [self rangeValue:NSMakeRange(2,3)].location == 3; }
@end

@implementation APIOverrideFieldsBase
@end

@interface APIOverrideFieldsFixture ()
@property(nonatomic, strong) id originalOwner;
@property(nonatomic, strong) id mockOwner;
@property(nonatomic, weak) id originalWitness;
@property(nonatomic, weak) id mockWitness;
@property(nonatomic, weak) id policyWitness;
@property(nonatomic, weak) id regionWitness;
@property(nonatomic, weak) id itemsWitness;
@property(nonatomic, weak) id inheritedWitness;
@end

@implementation APIOverrideFieldsFixture
- (instancetype)init {
    if ((self = [super init])) {
        _enabled = NO; _mode = 2; _wide = 7; _ratio = 0.5;
        _region = [NSMutableString stringWithString:@"original-region"];
        _items = @[@"original-item"];
        _policy = [NSObject new];
        self.inheritedText = [NSMutableString stringWithString:@"inherited-original"];
        _originalOwner = [NSObject new];
        _weakPolicy = _originalOwner;
        _originalWitness = _originalOwner;
        _policyWitness = _policy; _regionWitness = _region;
        _itemsWitness = _items; _inheritedWitness = self.inheritedText;
    }
    return self;
}
- (id)makeMock { _mockOwner = [NSObject new]; _mockWitness = _mockOwner; return _mockOwner; }
- (void)dropMockOwner { _mockOwner = nil; }
- (void)dropOriginalOwner { _originalOwner = nil; }
- (BOOL)weakHasOriginal { return _originalOwner != nil && _weakPolicy == _originalOwner; }
- (BOOL)mockAlive { return _mockWitness != nil; }
- (BOOL)originalAlive { return _originalWitness != nil; }
- (BOOL)weakEmpty { return _weakPolicy == nil; }
- (BOOL)extraScalarsOverridden {
    return _byteMode == -3 && _unsignedByte == 250 && _shortMode == -300 && _unsignedShort == 60000
        && _intMode == -70000 && _unsignedInt == 4000000000U && _longMode == -90000
        && _unsignedLong == 90000 && _unsignedWide == UINT64_C(18446744073709551615) && _floatRatio == 0.75f;
}
- (BOOL)extraScalarsRestored {
    return _byteMode == 0 && _unsignedByte == 0 && _shortMode == 0 && _unsignedShort == 0
        && _intMode == 0 && _unsignedInt == 0 && _longMode == 0 && _unsignedLong == 0
        && _unsignedWide == 0 && _floatRatio == 0;
}
- (BOOL)scalarsOverridden {
    return _enabled && _mode == 3 && _wide == INT64_C(9007199254740993) && _ratio == 0.75;
}
- (BOOL)scalarsRestored { return !_enabled && _mode == 2 && _wide == 7 && _ratio == 0.5; }
- (BOOL)objectsRestored {
    return _policy != nil && _policy == _policyWitness && _region == _regionWitness
        && _items == _itemsWitness && self.inheritedText == _inheritedWitness && _optional == nil;
}
@end
