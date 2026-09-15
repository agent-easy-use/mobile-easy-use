#import "APIActivatingView.h"
#import "../State/APISDKFixtureState.h"

@implementation APIActivatingView

- (void)recordActivation {
    [[APISDKFixtureState sharedState] recordActivation];
    self.accessibilityValue = [NSString stringWithFormat:@"activated:%ld", (long)[APISDKFixtureState sharedState].activationCount];
}

- (BOOL)isAccessibilityElement {
    return YES;
}

- (BOOL)accessibilityActivate {
    _accessibilityActivationCount += 1;
    [self recordActivation];
    return YES;
}

- (void)touchesEnded:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
    [super touchesEnded:touches withEvent:event];
    _touchCount += 1;
    [self recordActivation];
}

@end
