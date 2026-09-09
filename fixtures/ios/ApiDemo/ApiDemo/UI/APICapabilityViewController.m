#import "APICapabilityViewController.h"
#import "APIActivatingView.h"
#import "APIRejectingInputView.h"
#import "APIInputWindowFixture.h"
#import "../Control/APIController.h"
#import "../State/APISDKFixtureState.h"

@interface APICapabilityViewController ()
@property(nonatomic, copy) NSString *category;
@property(nonatomic, copy) NSString *scenario;
@property(nonatomic, strong) NSMutableDictionary<NSString *, UIView *> *fixtures;
@property(nonatomic, strong) UIView *fixtureContainer;
@property(nonatomic, strong) UIScrollView *scrollFixture;
@property(nonatomic, strong) NSLayoutConstraint *resizeWidth;
@property(nonatomic, strong) NSLayoutConstraint *resizeHeight;
@property(nonatomic, strong, readwrite) APIInputWindowFixture *inputWindows;
@end

@implementation APICapabilityViewController

- (instancetype)initWithCategory:(NSString *)category {
    self = [super initWithNibName:nil bundle:nil];
    if (self) {
        _category = [category copy];
        _scenario = @"catalog";
        _fixtures = [NSMutableDictionary dictionary];
    }
    return self;
}

- (void)viewDidLoad {
    [super viewDidLoad];
    [APIController registerCapabilityController:self];
    [self showCatalog];
}

- (void)dealloc {
    [APIController unregisterCapabilityController:self];
}

- (void)viewDidDisappear:(BOOL)animated {
    [super viewDidDisappear:animated];
    [self.inputWindows invalidate];
}

- (NSArray<NSString *> *)scenarioKeys {
    if ([self.category isEqualToString:@"ui"]) return @[@"path", @"visibility", @"window"];
    if ([self.category isEqualToString:@"input"]) return @[@"click", @"text", @"focus_switch", @"vertical_scroll", @"horizontal_scroll", @"errors", @"long_press", @"geometry", @"windows"];
    if ([self.category isEqualToString:@"wait"]) return @[@"immediate", @"delayed_visible", @"delayed_gone", @"attach_detach", @"resize", @"timeout"];
    return @[@"method_log", @"state_evidence", @"ui_evidence", @"chain_evidence"];
}

- (void)showCatalog {
    self.scenario = @"catalog";
    [[APISDKFixtureState sharedState] resetForCategory:self.category scenario:self.scenario];
    UIStackView *stack = [self resetViewWithTitle:[NSString stringWithFormat:@"%@ scenarios", self.category.uppercaseString]];
    for (NSString *scenario in self.scenarioKeys) {
        UIButton *button = [self buttonWithTitle:[scenario stringByReplacingOccurrencesOfString:@"_" withString:@" "]
                                      identifier:[NSString stringWithFormat:@"api.%@.scenario.%@", self.category, scenario]];
        button.accessibilityValue = scenario;
        [button addTarget:self action:@selector(selectScenario:) forControlEvents:UIControlEventTouchUpInside];
        [stack addArrangedSubview:button];
    }
}

- (void)selectScenario:(UIButton *)sender {
    self.scenario = sender.accessibilityValue;
    [self rebuildCurrentScenario];
}

- (NSInteger)resetCurrentScenario {
    if ([self.scenario isEqualToString:@"catalog"]) {
        [self showCatalog];
    } else {
        [self rebuildCurrentScenario];
    }
    return APISDKFixtureState.sharedState.generation;
}

- (void)rebuildCurrentScenario {
    [[APISDKFixtureState sharedState] resetForCategory:self.category scenario:self.scenario];
    UIStackView *stack = [self resetViewWithTitle:[NSString stringWithFormat:@"%@ / %@", self.category, self.scenario]];

    UILabel *ready = [[UILabel alloc] init];
    ready.text = [NSString stringWithFormat:@"ready generation %ld", (long)APISDKFixtureState.sharedState.generation];
    ready.accessibilityIdentifier = [NSString stringWithFormat:@"api.%@.ready.%@", self.category, self.scenario];
    ready.accessibilityLabel = @"fixture ready";
    [stack addArrangedSubview:ready];

    UIView *container = [[UIView alloc] init];
    container.accessibilityIdentifier = [NSString stringWithFormat:@"api.%@.fixture", self.category];
    container.backgroundColor = UIColor.secondarySystemGroupedBackgroundColor;
    container.layer.cornerRadius = 12;
    container.translatesAutoresizingMaskIntoConstraints = NO;
    [[container.heightAnchor constraintEqualToConstant:420] setActive:YES];
    [stack addArrangedSubview:container];
    self.fixtureContainer = container;

    if ([self.category isEqualToString:@"ui"]) [self buildUiScenario];
    else if ([self.category isEqualToString:@"input"]) [self buildInputScenario];
    else if ([self.category isEqualToString:@"wait"]) [self buildWaitScenario];
    else [self buildProbeScenario];
}

- (UIStackView *)resetViewWithTitle:(NSString *)titleText {
    [self.inputWindows invalidate];
    self.inputWindows = nil;
    self.view.backgroundColor = UIColor.systemGroupedBackgroundColor;
    self.view.accessibilityIdentifier = [NSString stringWithFormat:@"api.%@.root", self.category];
    [self.view.subviews makeObjectsPerformSelector:@selector(removeFromSuperview)];
    [self.fixtures removeAllObjects];
    self.scrollFixture = nil;
    self.resizeWidth = nil;
    self.resizeHeight = nil;

    UILabel *title = [[UILabel alloc] init];
    title.text = titleText;
    title.font = [UIFont boldSystemFontOfSize:24];
    title.accessibilityIdentifier = [NSString stringWithFormat:@"api.%@.title", self.category];

    UIStackView *stack = [[UIStackView alloc] initWithArrangedSubviews:@[title]];
    stack.axis = UILayoutConstraintAxisVertical;
    stack.spacing = 12;
    stack.translatesAutoresizingMaskIntoConstraints = NO;
    [self.view addSubview:stack];
    [NSLayoutConstraint activateConstraints:@[
        [stack.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor constant:20],
        [stack.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor constant:20],
        [stack.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor constant:-20],
    ]];
    return stack;
}

- (UIButton *)buttonWithTitle:(NSString *)title identifier:(NSString *)identifier {
    UIButton *button = [UIButton buttonWithType:UIButtonTypeSystem];
    [button setTitle:title forState:UIControlStateNormal];
    button.backgroundColor = UIColor.systemBlueColor;
    [button setTitleColor:UIColor.whiteColor forState:UIControlStateNormal];
    button.layer.cornerRadius = 9;
    button.accessibilityIdentifier = identifier;
    [[button.heightAnchor constraintEqualToConstant:48] setActive:YES];
    return button;
}

- (UILabel *)labelWithText:(NSString *)text identifier:(NSString *)identifier {
    UILabel *label = [[UILabel alloc] init];
    label.text = text;
    label.textAlignment = NSTextAlignmentCenter;
    label.accessibilityIdentifier = identifier;
    label.backgroundColor = UIColor.systemYellowColor;
    return label;
}

- (void)pinView:(UIView *)view inContainer:(UIView *)container top:(CGFloat)top height:(CGFloat)height {
    view.translatesAutoresizingMaskIntoConstraints = NO;
    [container addSubview:view];
    [NSLayoutConstraint activateConstraints:@[
        [view.topAnchor constraintEqualToAnchor:container.topAnchor constant:top],
        [view.leadingAnchor constraintEqualToAnchor:container.leadingAnchor constant:20],
        [view.trailingAnchor constraintEqualToAnchor:container.trailingAnchor constant:-20],
        [view.heightAnchor constraintEqualToConstant:height],
    ]];
}

- (void)recordFixture:(UIView *)view key:(NSString *)key {
    self.fixtures[key] = view;
}

- (void)buildUiScenario {
    if ([self.scenario isEqualToString:@"path"]) {
        UIView *parent = [[UIView alloc] init];
        parent.accessibilityIdentifier = @"api.ui.nested.parent";
        parent.backgroundColor = UIColor.systemGray5Color;
        [self pinView:parent inContainer:self.fixtureContainer top:20 height:190];

        UIButton *child = [self buttonWithTitle:@"Nested child" identifier:@"api.ui.nested.child"];
        child.accessibilityLabel = @"API_FIXED_LABEL";
        [self pinView:child inContainer:parent top:16 height:48];
        [self recordFixture:child key:@"nestedChild"];

        APIActivatingView *custom = [[APIActivatingView alloc] init];
        custom.accessibilityIdentifier = @"api.ui.custom";
        custom.accessibilityLabel = @"API_CUSTOM_CLASS";
        custom.backgroundColor = UIColor.systemGreenColor;
        [self pinView:custom inContainer:parent top:82 height:52];
        [self recordFixture:custom key:@"custom"];

        UILabel *outside = [self labelWithText:@"Outside duplicate" identifier:@"api.ui.outside"];
        outside.accessibilityLabel = @"API_FIXED_LABEL";
        [self pinView:outside inContainer:self.fixtureContainer top:240 height:48];
        [self recordFixture:outside key:@"outside"];
    } else if ([self.scenario isEqualToString:@"visibility"]) {
        UILabel *visible = [self labelWithText:@"Visible" identifier:@"api.ui.visible"];
        visible.accessibilityLabel = @"visible fixture";
        visible.accessibilityValue = @"initial-value";
        [self pinView:visible inContainer:self.fixtureContainer top:24 height:52];
        [self recordFixture:visible key:@"visible"];

        UILabel *hidden = [self labelWithText:@"Hidden" identifier:@"api.ui.hidden"];
        hidden.hidden = YES;
        [self pinView:hidden inContainer:self.fixtureContainer top:96 height:52];
        [self recordFixture:hidden key:@"hidden"];

        UILabel *zero = [self labelWithText:@"Zero" identifier:@"api.ui.zero-size"];
        zero.translatesAutoresizingMaskIntoConstraints = NO;
        [self.fixtureContainer addSubview:zero];
        [NSLayoutConstraint activateConstraints:@[
            [zero.topAnchor constraintEqualToAnchor:self.fixtureContainer.topAnchor constant:170],
            [zero.leadingAnchor constraintEqualToAnchor:self.fixtureContainer.leadingAnchor constant:20],
            [zero.widthAnchor constraintEqualToConstant:0],
            [zero.heightAnchor constraintEqualToConstant:0],
        ]];
        [self recordFixture:zero key:@"zero"];
    } else {
        UILabel *windowTarget = [self labelWithText:@"Focused window target" identifier:@"api.ui.window.target"];
        [self pinView:windowTarget inContainer:self.fixtureContainer top:24 height:52];
        [self recordFixture:windowTarget key:@"windowTarget"];
    }
}

- (void)buildInputScenario {
    if ([self.scenario isEqualToString:@"windows"]) {
        self.inputWindows = [[APIInputWindowFixture alloc] initWithContainer:self.fixtureContainer];
    } else if ([self.scenario isEqualToString:@"click"]) {
        UIButton *button = [self buttonWithTitle:@"Touch click" identifier:@"api.input.click"];
        button.accessibilityLabel = @"click fixture";
        button.accessibilityValue = @"count:0";
        [button addTarget:self action:@selector(clickFixture:) forControlEvents:UIControlEventTouchUpInside];
        [self pinView:button inContainer:self.fixtureContainer top:24 height:52];
        [self recordFixture:button key:@"click"];

        APIActivatingView *activating = [[APIActivatingView alloc] init];
        activating.accessibilityIdentifier = @"api.input.activation";
        activating.accessibilityLabel = @"activation fixture";
        activating.backgroundColor = UIColor.systemGreenColor;
        [self pinView:activating inContainer:self.fixtureContainer top:96 height:52];
        [self recordFixture:activating key:@"activation"];
    } else if ([self.scenario isEqualToString:@"geometry"]) {
        UIView *clippingParent = [[UIView alloc] init];
        clippingParent.clipsToBounds = YES;
        clippingParent.backgroundColor = UIColor.systemGray5Color;
        [self pinView:clippingParent inContainer:self.fixtureContainer top:20 height:60];
        UIButton *clipped = [self buttonWithTitle:@"Partially clipped" identifier:@"api.input.clipped"];
        [clipped addTarget:self action:@selector(clickFixture:) forControlEvents:UIControlEventTouchUpInside];
        [self pinView:clipped inContainer:clippingParent top:40 height:48];
        [self recordFixture:clipped key:@"clipped"];

        UIButton *covered = [self buttonWithTitle:@"Covered target" identifier:@"api.input.covered"];
        [covered addTarget:self action:@selector(clickFixture:) forControlEvents:UIControlEventTouchUpInside];
        [self pinView:covered inContainer:self.fixtureContainer top:120 height:48];
        [self recordFixture:covered key:@"covered"];
        APIActivatingView *cover = [[APIActivatingView alloc] init];
        cover.backgroundColor = UIColor.systemRedColor;
        [self pinView:cover inContainer:self.fixtureContainer top:120 height:48];
        [self recordFixture:cover key:@"cover"];

        for (NSInteger index = 0; index < 2; index++) {
            UIButton *duplicate = [self buttonWithTitle:[NSString stringWithFormat:@"Duplicate %ld", (long)index]
                                                           identifier:@"api.input.duplicate"];
            duplicate.accessibilityValue = @"count:0";
            [duplicate addTarget:self action:@selector(clickFixture:) forControlEvents:UIControlEventTouchUpInside];
            [self pinView:duplicate inContainer:self.fixtureContainer top:210 + index * 70 height:48];
            [self recordFixture:duplicate key:[NSString stringWithFormat:@"duplicate%ld", (long)index]];
        }
    } else if ([self.scenario isEqualToString:@"text"] || [self.scenario isEqualToString:@"focus_switch"]) {
        UITextField *field = [[UITextField alloc] init];
        field.borderStyle = UITextBorderStyleRoundedRect;
        field.accessibilityIdentifier = @"api.input.text";
        field.autocorrectionType = UITextAutocorrectionTypeNo;
        field.autocapitalizationType = UITextAutocapitalizationTypeNone;
        [field addTarget:self action:@selector(textChanged:) forControlEvents:UIControlEventEditingChanged];
        [self pinView:field inContainer:self.fixtureContainer top:24 height:52];
        [self recordFixture:field key:@"text"];
        if ([self.scenario isEqualToString:@"focus_switch"]) {
            field.placeholder = @"Field A";
            UITextField *second = [[UITextField alloc] init];
            second.borderStyle = UITextBorderStyleRoundedRect;
            second.placeholder = @"Field B";
            second.accessibilityIdentifier = @"api.input.text-second";
            second.autocorrectionType = UITextAutocorrectionTypeNo;
            second.autocapitalizationType = UITextAutocapitalizationTypeNone;
            [second addTarget:self action:@selector(textChanged:) forControlEvents:UIControlEventEditingChanged];
            [self pinView:second inContainer:self.fixtureContainer top:100 height:52];
            [self recordFixture:second key:@"textSecond"];
        }
    } else if ([self.scenario hasSuffix:@"scroll"]) {
        UIScrollView *scroll = [[UIScrollView alloc] init];
        scroll.accessibilityIdentifier = [self.scenario hasPrefix:@"vertical"] ? @"api.input.vertical-scroll" : @"api.input.horizontal-scroll";
        scroll.backgroundColor = UIColor.systemGray5Color;
        [self pinView:scroll inContainer:self.fixtureContainer top:20 height:320];
        UIView *content = [[UIView alloc] initWithFrame:CGRectZero];
        content.backgroundColor = UIColor.systemTealColor;
        [scroll addSubview:content];
        BOOL vertical = [self.scenario hasPrefix:@"vertical"];
        content.frame = vertical ? CGRectMake(0, 0, 300, 1200) : CGRectMake(0, 0, 1200, 300);
        scroll.contentSize = content.frame.size;
        self.scrollFixture = scroll;
        [self recordFixture:scroll key:@"scroll"];
    } else if ([self.scenario isEqualToString:@"errors"]) {
        UIButton *hidden = [self buttonWithTitle:@"Hidden" identifier:@"api.input.hidden"];
        hidden.hidden = YES;
        [self pinView:hidden inContainer:self.fixtureContainer top:20 height:44];
        [self recordFixture:hidden key:@"hidden"];

        UIButton *disabled = [self buttonWithTitle:@"Disabled" identifier:@"api.input.disabled"];
        [disabled addTarget:self action:@selector(clickFixture:) forControlEvents:UIControlEventTouchUpInside];
        disabled.enabled = NO;
        [self pinView:disabled inContainer:self.fixtureContainer top:80 height:44];
        [self recordFixture:disabled key:@"disabled"];

        UILabel *unsupported = [self labelWithText:@"Unsupported" identifier:@"api.input.noncontrol"];
        [self pinView:unsupported inContainer:self.fixtureContainer top:140 height:44];
        [self recordFixture:unsupported key:@"noncontrol"];

        APIRejectingInputView *rejecting = [[APIRejectingInputView alloc] init];
        rejecting.accessibilityIdentifier = @"api.input.focus-fail";
        rejecting.backgroundColor = UIColor.systemOrangeColor;
        [self pinView:rejecting inContainer:self.fixtureContainer top:200 height:44];
        [self recordFixture:rejecting key:@"focusFail"];
    } else {
        UIView *target = [[UIView alloc] init];
        target.accessibilityIdentifier = @"api.input.long-press";
        target.backgroundColor = UIColor.systemPurpleColor;
        UILongPressGestureRecognizer *recognizer = [[UILongPressGestureRecognizer alloc] initWithTarget:self action:@selector(longPressFixture:)];
        recognizer.minimumPressDuration = 0.4;
        [target addGestureRecognizer:recognizer];
        [self pinView:target inContainer:self.fixtureContainer top:24 height:80];
        [self recordFixture:target key:@"longPress"];
    }
}

- (void)buildWaitScenario {
    NSString *identifier = [NSString stringWithFormat:@"api.wait.%@", [self.scenario stringByReplacingOccurrencesOfString:@"_" withString:@"-"]];
    UILabel *target = [self labelWithText:self.scenario identifier:identifier];
    target.accessibilityLabel = @"wait fixture";
    target.translatesAutoresizingMaskIntoConstraints = NO;

    if ([self.scenario isEqualToString:@"attach_detach"]) {
        target.accessibilityIdentifier = @"api.wait.attach-target";
        [self recordFixture:target key:@"attach-target"];
        UILabel *detach = [self labelWithText:@"detach" identifier:@"api.wait.detach-target"];
        [self pinView:detach inContainer:self.fixtureContainer top:100 height:52];
        [self recordFixture:detach key:@"detach-target"];
        return;
    }

    [self.fixtureContainer addSubview:target];
    self.resizeWidth = [target.widthAnchor constraintEqualToConstant:[self.scenario isEqualToString:@"resize"] ? 0 : 260];
    self.resizeHeight = [target.heightAnchor constraintEqualToConstant:[self.scenario isEqualToString:@"resize"] ? 0 : 52];
    [NSLayoutConstraint activateConstraints:@[
        [target.topAnchor constraintEqualToAnchor:self.fixtureContainer.topAnchor constant:30],
        [target.centerXAnchor constraintEqualToAnchor:self.fixtureContainer.centerXAnchor],
        self.resizeWidth,
        self.resizeHeight,
    ]];
    if ([self.scenario isEqualToString:@"delayed_visible"] || [self.scenario isEqualToString:@"timeout"]) target.hidden = YES;
    [self recordFixture:target key:[self.scenario stringByReplacingOccurrencesOfString:@"_" withString:@"-"]];
}

- (void)buildProbeScenario {
    if ([self.scenario isEqualToString:@"state_evidence"]) {
        UIButton *button = [self buttonWithTitle:@"Capture state change" identifier:@"api.probe.state.action"];
        button.accessibilityValue = @"count:0";
        [button addTarget:self action:@selector(clickFixture:) forControlEvents:UIControlEventTouchUpInside];
        [self pinView:button inContainer:self.fixtureContainer top:24 height:52];
        [self recordFixture:button key:@"state-action"];
        return;
    }
    if ([self.scenario isEqualToString:@"ui_evidence"]) {
        UILabel *hidden = [self labelWithText:@"Probe UI hidden" identifier:@"api.probe.ui.hidden"];
        hidden.accessibilityLabel = @"PROBE_HIDDEN_LABEL";
        hidden.hidden = YES;
        [self pinView:hidden inContainer:self.fixtureContainer top:24 height:52];
        [self recordFixture:hidden key:@"hidden"];
        return;
    }
    if ([self.scenario isEqualToString:@"chain_evidence"]) {
        UILabel *target = [self labelWithText:@"Method and NSLog chain" identifier:@"api.probe.chain.fixture"];
        [self pinView:target inContainer:self.fixtureContainer top:24 height:52];
        [self recordFixture:target key:@"chain"];
        return;
    }
    UIButton *button = [self buttonWithTitle:@"Objective-C method + log" identifier:@"api.probe.action"];
    [button addTarget:self action:@selector(probeAction:) forControlEvents:UIControlEventTouchUpInside];
    [self pinView:button inContainer:self.fixtureContainer top:24 height:52];
    [self recordFixture:button key:@"action"];
}

- (void)clickFixture:(UIButton *)sender {
    NSInteger count = [[APISDKFixtureState sharedState] increment];
    sender.accessibilityValue = [NSString stringWithFormat:@"count:%ld", (long)count];
}

- (void)textChanged:(UITextField *)sender {
    [[APISDKFixtureState sharedState] recordText:sender.text];
}

- (void)longPressFixture:(UILongPressGestureRecognizer *)recognizer {
    if (recognizer.state == UIGestureRecognizerStateBegan) {
        [[APISDKFixtureState sharedState] recordActivation];
    }
}

- (void)probeAction:(UIButton *)sender {
    APISDKFixtureState *state = [APISDKFixtureState sharedState];
    [sender setTitle:[state single:@"ui-chain"] forState:UIControlStateNormal];
    [state emitPrimaryLog];
}

- (void)scheduleFixtureAction:(NSString *)action key:(NSString *)key delayMs:(NSInteger)delayMs {
    NSInteger generation = APISDKFixtureState.sharedState.generation;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delayMs * NSEC_PER_MSEC)), dispatch_get_main_queue(), ^{
        if (APISDKFixtureState.sharedState.generation != generation) return;
        UIView *view = self.fixtures[key];
        if (!view) return;
        if ([action isEqualToString:@"show"]) view.hidden = NO;
        else if ([action isEqualToString:@"hide"]) view.hidden = YES;
        else if ([action isEqualToString:@"attach"] && !view.superview) {
            [self pinView:view inContainer:self.fixtureContainer top:24 height:52];
        } else if ([action isEqualToString:@"detach"]) {
            [view removeFromSuperview];
        } else if ([action isEqualToString:@"resize"]) {
            self.resizeWidth.constant = 260;
            self.resizeHeight.constant = 52;
        }
        [self.view layoutIfNeeded];
    });
}

- (NSDictionary *)fixtureSnapshot {
    APISDKFixtureState *state = APISDKFixtureState.sharedState;
    NSMutableDictionary *fixtureStates = [NSMutableDictionary dictionary];
    [self.fixtures enumerateKeysAndObjectsUsingBlock:^(NSString *key, UIView *view, BOOL *stop) {
        fixtureStates[key] = @{
            @"attached": @(view.window != nil),
            @"hidden": @(view.hidden),
            @"enabled": @(![view isKindOfClass:UIControl.class] || ((UIControl *)view).enabled),
            @"width": @(view.bounds.size.width),
            @"height": @(view.bounds.size.height),
            @"className": NSStringFromClass(view.class),
            @"value": view.accessibilityValue ?: @"",
        };
        if ([view isKindOfClass:APIActivatingView.class]) {
            NSMutableDictionary *values = [fixtureStates[key] mutableCopy];
            values[@"touchCount"] = @(((APIActivatingView *)view).touchCount);
            values[@"accessibilityActivationCount"] = @(((APIActivatingView *)view).accessibilityActivationCount);
            fixtureStates[key] = values;
        }
        if ([view isKindOfClass:UITextField.class]) {
            NSMutableDictionary *values = [fixtureStates[key] mutableCopy];
            values[@"text"] = ((UITextField *)view).text ?: @"";
            values[@"isFirstResponder"] = @(view.isFirstResponder);
            fixtureStates[key] = values;
        }
    }];
    return @{
        @"generation": @(state.generation),
        @"category": state.category ?: @"",
        @"scenario": state.scenario ?: @"",
        @"counter": @(state.counter),
        @"activationCount": @(state.activationCount),
        @"text": state.text ?: @"",
        @"scrollX": @(self.scrollFixture.contentOffset.x),
        @"scrollY": @(self.scrollFixture.contentOffset.y),
        @"fixtures": fixtureStates,
    };
}

@end
