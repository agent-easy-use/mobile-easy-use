#import "MEUUIQuery.h"

@interface MEUTestLabel : UILabel
@end
@implementation MEUTestLabel
@end

static UIWindow *testWindow;
@interface MEUTestQuery : MEUUIQuery
@end
@implementation MEUTestQuery
+ (UIWindow *)focusedWindow { return testWindow; }
@end

static void check(BOOL condition, NSString *message) {
    if (!condition) {
        NSLog(@"FAIL: %@", message);
        exit(1);
    }
}

int main(void) {
    @autoreleasepool {
        testWindow = [[UIWindow alloc] initWithFrame:CGRectMake(0, 0, 300, 600)];
        UIView *branch = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 300, 200)];
        branch.accessibilityIdentifier = @"branch";
        MEUTestLabel *first = [[MEUTestLabel alloc] initWithFrame:CGRectMake(0, 0, 100, 30)];
        UILabel *second = [[UILabel alloc] initWithFrame:CGRectMake(0, 0, 100, 30)];
        second.accessibilityLabel = @"second";
        [branch addSubview:first];
        [testWindow addSubview:branch];
        [testWindow addSubview:second];
        check([MEUTestQuery findUIView:@[@"class::UIView"]] == testWindow, @"includes root and subclasses");
        check([MEUTestQuery findUIView:@[@"class::UILabel"]] == first, @"DFS order and subclass matching");
        check([MEUTestQuery findUIView:@[@"class::MEUTestLabel"]] == first, @"exact class");
        check([MEUTestQuery findUIView:@[@"identifier::branch", @"class::UILabel"]] == first, @"mixed scoped path");
        check([MEUTestQuery findUIView:@[@"class::MEUTestLabel", @"class::UILabel"]] == first, @"next step includes current node");
        check([MEUTestQuery findUIView:@[@"class::UILabel", @"label::second"]] == nil, @"no backtracking to second label");
        check([MEUTestQuery findUIView:@[@"label::second", @"class::MEUTestLabel"]] == nil, @"base does not match subclass");
        check([MEUTestQuery findUIView:@[@"class::uilabel"]] == nil, @"case sensitive");
        check([MEUTestQuery findUIView:@[@"class::missing.Type"]] == nil, @"unknown class");
        check([MEUTestQuery findUIView:@[@"class::"]] == nil, @"empty class name");
        first.hidden = YES;
        check([MEUTestQuery findUIView:@[@"class::UILabel"]] == first, @"lookup includes hidden views");
        NSDictionary *state = [MEUTestQuery stateForUIViewPath:@[@"class::UILabel"]];
        check([state[@"exist"] boolValue] && ![state[@"visible"] boolValue], @"wait state uses same class lookup");
        check([MEUTestQuery findUIView:@[@"identifier::branch"]] == branch, @"identifier unchanged");
        check([MEUTestQuery findUIView:@[@"label::second"]] == second, @"label unchanged");
        branch.accessibilityIdentifier = @"branch::nested";
        second.accessibilityLabel = @"second::value";
        check([MEUTestQuery findUIView:@[@"identifier::branch::nested"]] == branch, @"identifier preserves separators in value");
        check([MEUTestQuery findUIView:@[@"label::second::value"]] == second, @"label preserves separators in value");
        for (NSString *step in @[@"identifier", @"::branch", @"identifier::", @"label::", @"unknown::branch"]) {
            check([MEUTestQuery findUIView:@[step]] == nil, @"invalid step does not match");
        }
        puts("iOS native UI query passed");
    }
    return 0;
}
