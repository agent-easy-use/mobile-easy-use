#import "MEUUIQuery.h"

static NSUInteger const MEUUIQueryMaximumViews = 10000;

@implementation MEUUIQuery

+ (NSArray<UIWindow *> *)applicationWindows {
    UIApplication *application = UIApplication.sharedApplication;
    NSMutableArray<UIWindow *> *windows = [NSMutableArray array];
    NSMutableSet<NSValue *> *seen = [NSMutableSet set];

    void (^appendWindow)(UIWindow *) = ^(UIWindow *window) {
        if (window == nil) {
            return;
        }
        NSValue *identity = [NSValue valueWithNonretainedObject:window];
        if (![seen containsObject:identity]) {
            [seen addObject:identity];
            [windows addObject:window];
        }
    };

    for (UIScene *scene in application.connectedScenes) {
        if (![scene isKindOfClass:UIWindowScene.class]) {
            continue;
        }
        for (UIWindow *window in ((UIWindowScene *)scene).windows) {
            appendWindow(window);
        }
    }

    return windows;
}

+ (nullable UIWindow *)focusedWindow {
    NSArray<UIWindow *> *windows = [self applicationWindows];
    for (UIWindow *window in windows) {
        if (window.isKeyWindow) {
            return window;
        }
    }
    for (UIWindow *window in windows) {
        if (!window.hidden && window.alpha > 0.01) {
            return window;
        }
    }
    return nil;
}

+ (BOOL)matchesView:(UIView *)view step:(NSString *)step {
    NSRange separator = [step rangeOfString:@"::"];
    if (separator.location == NSNotFound || separator.location == 0
        || separator.location + separator.length >= step.length) {
        return NO;
    }

    NSString *kind = [step substringToIndex:separator.location];
    NSString *value = [step substringFromIndex:separator.location + separator.length];
    if ([kind isEqualToString:@"identifier"]) {
        return [view.accessibilityIdentifier isEqualToString:value];
    }
    if ([kind isEqualToString:@"label"]) {
        return [view.accessibilityLabel isEqualToString:value];
    }
    return NO;
}

+ (nullable UIView *)firstDescendantOfView:(UIView *)root matchingStep:(NSString *)step {
    if (root == nil) {
        return nil;
    }

    // Use a stack and push children in reverse order so that subviews[0] is
    // visited first, matching Android ViewGroup descendant traversal.
    NSMutableArray<UIView *> *stack = [NSMutableArray arrayWithObject:root];
    NSMutableSet<NSValue *> *visited = [NSMutableSet set];
    NSUInteger visitedCount = 0;

    while (stack.count > 0) {
        UIView *view = stack.lastObject;
        [stack removeLastObject];
        NSValue *identity = [NSValue valueWithNonretainedObject:view];
        if ([visited containsObject:identity]) {
            continue;
        }
        [visited addObject:identity];
        visitedCount += 1;
        if (visitedCount > MEUUIQueryMaximumViews) {
            return nil;
        }

        if ([self matchesView:view step:step]) {
            return view;
        }
        NSArray<UIView *> *subviews = view.subviews;
        for (UIView *subview in [subviews reverseObjectEnumerator]) {
            [stack addObject:subview];
        }
    }
    return nil;
}

+ (nullable UIView *)findUIViewOnMainThread:(NSArray<NSString *> *)path {
    if (![path isKindOfClass:NSArray.class] || path.count == 0) {
        return nil;
    }

    UIView *current = [self focusedWindow];
    for (id rawStep in path) {
        if (![rawStep isKindOfClass:NSString.class] || ((NSString *)rawStep).length == 0) {
            return nil;
        }
        current = [self firstDescendantOfView:current matchingStep:(NSString *)rawStep];
        if (current == nil) {
            return nil;
        }
    }
    return current;
}

+ (nullable UIView *)findUIView:(NSArray<NSString *> *)path {
    if ([NSThread isMainThread]) {
        return [self findUIViewOnMainThread:path];
    }

    __block UIView *result = nil;
    dispatch_sync(dispatch_get_main_queue(), ^{
        result = [self findUIViewOnMainThread:path];
    });
    return result;
}

+ (NSDictionary<NSString *, NSNumber *> *)stateForUIViewPathOnMainThread:(NSArray<NSString *> *)path {
    UIView *view = [self findUIViewOnMainThread:path];
    if (view == nil) {
        return @{
            @"exist": @NO,
            @"visible": @NO,
        };
    }

    BOOL visible = view.window != nil && !view.hidden && view.alpha > 0.01
        && view.bounds.size.width > 0.0 && view.bounds.size.height > 0.0;
    UIView *ancestor = view.superview;
    CGFloat cumulativeAlpha = view.alpha;
    while (visible && ancestor != nil) {
        visible = !ancestor.hidden;
        cumulativeAlpha *= ancestor.alpha;
        visible = visible && cumulativeAlpha > 0.01;
        ancestor = ancestor.superview;
    }

    return @{
        @"exist": @YES,
        @"visible": @(visible),
    };
}

+ (NSDictionary<NSString *, NSNumber *> *)stateForUIViewPath:(NSArray<NSString *> *)path {
    if ([NSThread isMainThread]) {
        return [self stateForUIViewPathOnMainThread:path];
    }

    __block NSDictionary<NSString *, NSNumber *> *result = nil;
    dispatch_sync(dispatch_get_main_queue(), ^{
        result = [self stateForUIViewPathOnMainThread:path];
    });
    return result ?: @{
        @"exist": @NO,
        @"visible": @NO,
    };
}

@end
