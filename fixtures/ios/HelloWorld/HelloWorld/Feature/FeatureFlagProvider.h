#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// App-owned feature boundary used to model a remote rollout decision.
@interface FeatureFlagProvider : NSObject

- (BOOL)isAdvancedInspectionEnabled NS_SWIFT_NAME(isAdvancedInspectionEnabled());

@end

NS_ASSUME_NONNULL_END
