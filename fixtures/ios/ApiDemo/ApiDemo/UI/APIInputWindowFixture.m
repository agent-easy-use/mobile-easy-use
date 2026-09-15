#import "APIInputWindowFixture.h"

@interface APIInputOverlayWindow : UIWindow
@property(nonatomic) BOOL passThrough;
@end
@implementation APIInputOverlayWindow
- (UIView *)hitTest:(CGPoint)point withEvent:(UIEvent *)event {
    return self.passThrough ? nil : [super hitTest:point withEvent:event];
}
@end

@interface APIInputWindowFixture ()
@property(nonatomic, weak) UIView *container;
@property(nonatomic, weak) UIWindow *mainWindow;
@property(nonatomic, strong) APIInputOverlayWindow *overlay;
@property(nonatomic, strong) UIButton *baseButton;
@property(nonatomic, strong) UIButton *frontButton;
@property(nonatomic, strong) UITextField *textField;
@property(nonatomic, strong) UIScrollView *scrollView;
@property(nonatomic) NSInteger baseClicks;
@property(nonatomic) NSInteger frontClicks;
@property(nonatomic) NSInteger longPresses;
@end

@implementation APIInputWindowFixture
- (instancetype)initWithContainer:(UIView *)container {
    self = [super init];
    if (self) {
        _container = container;
        _baseButton = [self button:@"Underlying button" identifier:@"api.input.window.base"];
        [container addSubview:_baseButton];
        [_baseButton addTarget:self action:@selector(baseClicked) forControlEvents:UIControlEventTouchUpInside];
        UILongPressGestureRecognizer *press = [[UILongPressGestureRecognizer alloc] initWithTarget:self action:@selector(held:)];
        press.minimumPressDuration = 0.4;
        [_baseButton addGestureRecognizer:press];
        _textField = [[UITextField alloc] init];
        _textField.borderStyle = UITextBorderStyleRoundedRect;
        _textField.accessibilityIdentifier = @"api.input.window.text";
        [container addSubview:_textField];
        _scrollView = [[UIScrollView alloc] init];
        _scrollView.accessibilityIdentifier = @"api.input.window.scroll";
        _scrollView.backgroundColor = UIColor.systemYellowColor;
        _scrollView.contentSize = CGSizeMake(200, 1500);
        [container addSubview:_scrollView];
    }
    return self;
}

- (UIButton *)button:(NSString *)title identifier:(NSString *)identifier {
    UIButton *button = [UIButton buttonWithType:UIButtonTypeSystem];
    [button setTitle:title forState:UIControlStateNormal];
    button.accessibilityIdentifier = identifier;
    button.backgroundColor = UIColor.systemGreenColor;
    return button;
}

- (void)configure:(NSString *)mode {
    if (!self.overlay) {
        self.mainWindow = self.container.window;
        NSAssert(self.mainWindow != nil, @"Window fixture must be attached before configuration");
        [self.mainWindow layoutIfNeeded];
        CGFloat width = self.container.bounds.size.width;
        self.baseButton.frame = CGRectMake(20, 20, width - 40, 52);
        self.textField.frame = CGRectMake(20, 92, width - 40, 52);
        self.scrollView.frame = CGRectMake(20, 164, width - 40, 220);
        self.overlay = [[APIInputOverlayWindow alloc] initWithWindowScene:self.mainWindow.windowScene];
        self.overlay.accessibilityIdentifier = @"api.input.window.overlay";
        UIViewController *root = [[UIViewController alloc] init];
        root.view.backgroundColor = UIColor.systemOrangeColor;
        root.view.accessibilityIdentifier = @"api.input.fixture";
        self.overlay.rootViewController = root;
        self.frontButton = [self button:@"Front window button" identifier:@"api.input.window.front"];
        self.frontButton.frame = self.baseButton.frame;
        [self.frontButton addTarget:self action:@selector(frontClicked) forControlEvents:UIControlEventTouchUpInside];
        [root.view addSubview:self.frontButton];
    }
    if ([mode isEqualToString:@"hide"]) { self.overlay.hidden = YES; return; }
    if ([mode isEqualToString:@"show"]) { self.overlay.hidden = NO; return; }
    if ([mode isEqualToString:@"overlay-key"]) { [self.overlay makeKeyWindow]; return; }
    if ([mode isEqualToString:@"main-key"]) { [self.mainWindow makeKeyWindow]; return; }

    self.overlay.hidden = YES;
    [self.mainWindow makeKeyWindow];
    self.overlay.passThrough = [mode isEqualToString:@"passthrough"];
    self.overlay.windowLevel = self.mainWindow.windowLevel;
    if ([mode isEqualToString:@"higher"]) self.overlay.windowLevel += 1;
    if ([mode isEqualToString:@"lower"]) self.overlay.windowLevel -= 1;
    CGRect frame = [self.container convertRect:self.container.bounds toView:self.mainWindow];
    if ([mode isEqualToString:@"outside"]) frame.origin.x += frame.size.width;
    self.overlay.frame = frame;
    self.overlay.hidden = [mode isEqualToString:@"hidden"];
    if ([mode isEqualToString:@"top"]) [self.overlay makeKeyWindow];
    if ([mode isEqualToString:@"reshow"]) {
        self.overlay.hidden = YES;
        self.overlay.hidden = NO;
    }
    [self.overlay layoutIfNeeded];
}

- (UIView *)targetForAction:(NSString *)action front:(BOOL)front {
    if (front) return self.frontButton;
    if ([action isEqualToString:@"input"]) return self.textField;
    if ([action isEqualToString:@"scroll"]) return self.scrollView;
    return self.baseButton;
}
- (void)baseClicked { self.baseClicks += 1; }
- (void)frontClicked { self.frontClicks += 1; }
- (void)held:(UILongPressGestureRecognizer *)press {
    if (press.state == UIGestureRecognizerStateBegan) self.longPresses += 1;
}
- (NSDictionary *)snapshot {
    // Record the two fixture windows only, preserving the system's order. No UI-tree dump.
    NSMutableArray *order = [NSMutableArray array];
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    for (UIWindow *window in UIApplication.sharedApplication.windows) {
        if (window == self.mainWindow) [order addObject:@"main"];
        if (window == self.overlay) [order addObject:@"overlay"];
    }
#pragma clang diagnostic pop
    return @{@"baseClicks": @(self.baseClicks), @"frontClicks": @(self.frontClicks),
             @"longPresses": @(self.longPresses), @"text": self.textField.text ?: @"",
             @"scrollY": @(self.scrollView.contentOffset.y), @"windowOrder": order,
             @"mainKey": @(self.mainWindow.isKeyWindow), @"overlayKey": @(self.overlay.isKeyWindow),
             @"mainLevel": @(self.mainWindow.windowLevel), @"overlayLevel": @(self.overlay.windowLevel),
             @"overlayHidden": @(self.overlay.hidden), @"passThrough": @(self.overlay.passThrough)};
}
- (void)invalidate {
    BOOL wasKey = self.overlay.isKeyWindow;
    self.overlay.hidden = YES;
    self.overlay = nil;
    if (wasKey) [self.mainWindow makeKeyWindow];
}
- (void)dealloc { [self invalidate]; }
@end
