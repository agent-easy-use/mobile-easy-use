#import <Foundation/Foundation.h>

@class APICapabilityViewController;

@interface APIController : NSObject

+ (void)registerCapabilityController:(APICapabilityViewController *)controller;
+ (void)unregisterCapabilityController:(APICapabilityViewController *)controller;
+ (NSInteger)reset;
+ (NSInteger)generation;
+ (NSString *)category;
+ (NSString *)scenario;
+ (NSDictionary *)snapshot;
+ (NSString *)snapshotJSON;
+ (void)showAfter:(NSString *)key delayMs:(NSInteger)delayMs;
+ (void)hideAfter:(NSString *)key delayMs:(NSInteger)delayMs;
+ (void)attachAfter:(NSString *)key delayMs:(NSInteger)delayMs;
+ (void)detachAfter:(NSString *)key delayMs:(NSInteger)delayMs;
+ (void)resizeAfter:(NSString *)key delayMs:(NSInteger)delayMs;
+ (void)returnToMain;

@end
