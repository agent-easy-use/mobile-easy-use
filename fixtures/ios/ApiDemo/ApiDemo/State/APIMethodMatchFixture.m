#import "APIMethodMatchFixture.h"
#import <objc/runtime.h>

static NSInteger matchCalls;
static NSInteger SharedMatch(id receiver, SEL selector, NSInteger value) {
    matchCalls++;
    return value + 10;
}

@implementation APIMethodMatchFixture
+ (void)load {
    // Use one actual native address for both selectors, both kinds and unrelated classes.
    for (Class cls in @[[APIMethodMatchFixture class], [APIMethodMatchSibling class]]) {
        method_setImplementation(class_getInstanceMethod(cls, @selector(match:)), (IMP)SharedMatch);
        method_setImplementation(class_getInstanceMethod(cls, @selector(alias:)), (IMP)SharedMatch);
        method_setImplementation(class_getClassMethod(cls, @selector(match:)), (IMP)SharedMatch);
        method_setImplementation(class_getClassMethod(cls, @selector(alias:)), (IMP)SharedMatch);
    }
}
- (NSInteger)match:(NSInteger)value { return SharedMatch(self, _cmd, value); }
- (NSInteger)alias:(NSInteger)value { return SharedMatch(self, _cmd, value); }
+ (NSInteger)match:(NSInteger)value { return SharedMatch(self, _cmd, value); }
+ (NSInteger)alias:(NSInteger)value { return SharedMatch(self, _cmd, value); }
+ (void)resetCalls { matchCalls = 0; }
+ (NSInteger)calls { return matchCalls; }
+ (BOOL)sharedImplementationVerified {
    for (Class cls in @[[APIMethodMatchFixture class], [APIMethodMatchChild class], [APIMethodMatchGrandchild class], [APIMethodMatchSibling class]]) {
        for (NSString *name in @[@"match:", @"alias:"]) {
            SEL selector = NSSelectorFromString(name);
            if (method_getImplementation(class_getInstanceMethod(cls, selector)) != (IMP)SharedMatch) return NO;
            if (method_getImplementation(class_getClassMethod(cls, selector)) != (IMP)SharedMatch) return NO;
        }
    }
    return method_getImplementation(class_getInstanceMethod([APIMethodMatchOverride class], @selector(match:))) != (IMP)SharedMatch
        && method_getImplementation(class_getClassMethod([APIMethodMatchOverride class], @selector(match:))) != (IMP)SharedMatch;
}
@end
@implementation APIMethodMatchChild @end
@implementation APIMethodMatchGrandchild @end
@implementation APIMethodMatchOverride
- (NSInteger)match:(NSInteger)value { matchCalls++; return value + 100; }
+ (NSInteger)match:(NSInteger)value { matchCalls++; return value + 100; }
@end
@implementation APIMethodMatchSibling
- (NSInteger)match:(NSInteger)value { return SharedMatch(self, _cmd, value); }
- (NSInteger)alias:(NSInteger)value { return SharedMatch(self, _cmd, value); }
+ (NSInteger)match:(NSInteger)value { return SharedMatch(self, _cmd, value); }
+ (NSInteger)alias:(NSInteger)value { return SharedMatch(self, _cmd, value); }
@end
