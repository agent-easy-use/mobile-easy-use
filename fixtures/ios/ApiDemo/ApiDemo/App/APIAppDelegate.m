#import "APIAppDelegate.h"
#import "../UI/APIMainViewController.h"

@implementation APIAppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
    APIMainViewController *main = [[APIMainViewController alloc] init];
    UINavigationController *navigation = [[UINavigationController alloc] initWithRootViewController:main];
    navigation.navigationBarHidden = YES;
    self.window.rootViewController = navigation;
    [self.window makeKeyAndVisible];
    return YES;
}

@end
