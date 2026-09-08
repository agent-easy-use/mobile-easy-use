#import "APIController.h"
#import "../UI/APICapabilityViewController.h"
#import "../State/APISDKFixtureState.h"
#import "../UI/APIInputWindowFixture.h"

static __weak APICapabilityViewController *APICurrentController;

@implementation APIController

+ (void)registerCapabilityController:(APICapabilityViewController *)controller {
    APICurrentController = controller;
}

+ (void)unregisterCapabilityController:(APICapabilityViewController *)controller {
    if (APICurrentController == controller) APICurrentController = nil;
}

+ (NSInteger)reset {
    __block NSInteger result = 0;
    [self onMain:^{ result = [[self requireController] resetCurrentScenario]; }];
    return result;
}

+ (NSInteger)generation { return APISDKFixtureState.sharedState.generation; }
+ (NSString *)category { return APISDKFixtureState.sharedState.category; }
+ (NSString *)scenario { return APISDKFixtureState.sharedState.scenario; }

+ (NSDictionary *)snapshot {
    __block NSDictionary *snapshot;
    [self onMain:^{ snapshot = [[self requireController] fixtureSnapshot]; }];
    return snapshot;
}

+ (NSString *)snapshotJSON {
    NSDictionary *snapshot = [self snapshot];
    NSData *data = [NSJSONSerialization dataWithJSONObject:snapshot options:0 error:nil];
    if (data == nil) return @"{}";
    return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"{}";
}

+ (void)showAfter:(NSString *)key delayMs:(NSInteger)delayMs { [self schedule:@"show" key:key delayMs:delayMs]; }
+ (void)hideAfter:(NSString *)key delayMs:(NSInteger)delayMs { [self schedule:@"hide" key:key delayMs:delayMs]; }
+ (void)attachAfter:(NSString *)key delayMs:(NSInteger)delayMs { [self schedule:@"attach" key:key delayMs:delayMs]; }
+ (void)detachAfter:(NSString *)key delayMs:(NSInteger)delayMs { [self schedule:@"detach" key:key delayMs:delayMs]; }
+ (void)resizeAfter:(NSString *)key delayMs:(NSInteger)delayMs { [self schedule:@"resize" key:key delayMs:delayMs]; }

+ (void)returnToMain {
    [self onMain:^{
        [[self requireController].inputWindows invalidate];
        UINavigationController *navigation = [self requireController].navigationController;
        [navigation popToRootViewControllerAnimated:NO];
    }];
}

+ (void)configureInputWindow:(NSString *)mode {
    [self onMain:^{ [[self requireController].inputWindows configure:mode]; }];
}

+ (UIView *)inputWindowTarget:(NSString *)action front:(BOOL)front {
    __block UIView *target;
    [self onMain:^{ target = [[self requireController].inputWindows targetForAction:action front:front]; }];
    return target;
}

+ (NSString *)inputWindowSnapshotJSON {
    __block NSDictionary *state;
    [self onMain:^{ state = [[self requireController].inputWindows snapshot]; }];
    NSData *data = [NSJSONSerialization dataWithJSONObject:state options:0 error:nil];
    return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
}

+ (void)schedule:(NSString *)action key:(NSString *)key delayMs:(NSInteger)delayMs {
    [self onMain:^{ [[self requireController] scheduleFixtureAction:action key:key delayMs:delayMs]; }];
}

+ (APICapabilityViewController *)requireController {
    APICapabilityViewController *controller = APICurrentController;
    if (!controller || !controller.view.window) {
        @throw [NSException exceptionWithName:@"APIFixtureUnavailable" reason:@"ApiDemo capability controller is unavailable" userInfo:nil];
    }
    return controller;
}

+ (void)onMain:(dispatch_block_t)block {
    if (NSThread.isMainThread) block();
    else dispatch_sync(dispatch_get_main_queue(), block);
}

@end
