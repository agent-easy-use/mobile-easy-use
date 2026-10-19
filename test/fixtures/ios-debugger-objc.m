#import <Foundation/Foundation.h>

int debuggerObjCValid;

void debuggerObjC(void) {
    int price = 10;
    NSString *label = @"OC 世界";
    id erased = @"from id";
    NSNumber *number = @42;
    id empty = nil;
    id nullObject = [NSNull null];
    long long wide = 7;
    const char *text = "cstring";
    price += 1; // OBJC_BREAKPOINT
    debuggerObjCValid = price == 21 && [label isEqualToString:@"OC 世界!"];
    (void)nullObject; (void)wide; (void)text;
    NSLog(@"%@ %@ %@ %@ %d", label, erased, number, empty, price);
}
