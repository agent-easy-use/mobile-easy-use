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
    [self recordActivation];
    return YES;
}

- (void)touchesEnded:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
    [super touchesEnded:touches withEvent:event];
    [self recordActivation];
}

@end
