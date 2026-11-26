#import "APIAppDelegate.h"
#import "../UI/APIMainViewController.h"

@interface APIWindowSceneDelegate : UIResponder <UIWindowSceneDelegate>
@property(nonatomic, strong) UIWindow *window;
@end

@implementation APIAppDelegate
@end

@implementation APIWindowSceneDelegate

- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)connectionOptions {
    self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
    APIMainViewController *main = [[APIMainViewController alloc] init];
    UINavigationController *navigation = [[UINavigationController alloc] initWithRootViewController:main];
    navigation.navigationBarHidden = YES;
    self.window.rootViewController = navigation;
    [self.window makeKeyAndVisible];
}

@end
