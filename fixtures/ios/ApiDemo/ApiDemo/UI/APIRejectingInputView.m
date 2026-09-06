#import "APIRejectingInputView.h"

@implementation APIRejectingInputView
- (BOOL)canBecomeFirstResponder { return NO; }
- (BOOL)hasText { return NO; }
- (void)insertText:(NSString *)text {}
- (void)deleteBackward {}
@end
