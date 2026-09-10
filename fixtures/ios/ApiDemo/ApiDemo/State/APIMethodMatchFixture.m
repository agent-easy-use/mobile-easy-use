#import "APIMethodMatchFixture.h"
#import <objc/runtime.h>

static NSInteger matchCalls;
static NSInteger SharedMatch(id receiver, SEL selector, NSInteger value) {
    matchCalls++;
    return value + 10;
}

static void FindClassNoop(id receiver, SEL selector) {}
static NSInteger FindClassValue(id receiver, SEL selector) { return 41; }

static void RegisterFindClassFixture(const char *name, BOOL hasUniqueSelector) {
    if (objc_getClass(name) != Nil) return;
    Class cls = objc_allocateClassPair([NSObject class], name, 0);
    NSCAssert(cls != Nil, @"Failed to allocate findClass fixture %s", name);
    class_addMethod(cls, NSSelectorFromString(@"sharedSelector"), (IMP)FindClassNoop, "v@:");
    if (hasUniqueSelector) {
        class_addMethod(cls, NSSelectorFromString(@"onlyFirstSelector"), (IMP)FindClassNoop, "v@:");
        class_addMethod(cls, NSSelectorFromString(@"onlyFirstValue"), (IMP)FindClassValue, "q@:");
    }
    objc_registerClassPair(cls);
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
    RegisterFindClassFixture("APIFindClassModuleOne.APIFindClassAmbiguousFixture", YES);
    RegisterFindClassFixture("APIFindClassModuleTwo.APIFindClassAmbiguousFixture", NO);
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
