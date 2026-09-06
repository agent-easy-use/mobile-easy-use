#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// Native UIKit view query used by the mobile-easy-use Frida bridge.
///
/// Each path item is a string in one of these forms:
///   identifier::<accessibilityIdentifier>
///   label::<accessibilityLabel>
///
/// The first item is resolved below the focused application window. Every
/// following item is resolved below the UIView returned by the previous item.
/// The first matching descendant in depth-first UIKit subview order is returned.
@interface MEUUIQuery : NSObject

/// Returns the key or first visible App-owned window.
+ (nullable UIWindow *)focusedWindow;

+ (nullable UIView *)findUIView:(NSArray<NSString *> *)path;

/// Returns { exist: NSNumber, visible: NSNumber } for the native path.
+ (NSDictionary<NSString *, NSNumber *> *)stateForUIViewPath:(NSArray<NSString *> *)path;

@end

NS_ASSUME_NONNULL_END
