#import "APIMainViewController.h"
#import "APICapabilityViewController.h"
#import "../State/APISDKFixtureState.h"

@implementation APIMainViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = UIColor.systemGroupedBackgroundColor;
    self.view.accessibilityIdentifier = @"api.main.root";
    [[APISDKFixtureState sharedState] resetForCategory:@"main" scenario:@"catalog"];

    UILabel *title = [[UILabel alloc] init];
    title.text = @"iOS SDK ApiDemo";
    title.font = [UIFont boldSystemFontOfSize:28];
    title.textAlignment = NSTextAlignmentCenter;

    UIStackView *stack = [[UIStackView alloc] initWithArrangedSubviews:@[title]];
    stack.axis = UILayoutConstraintAxisVertical;
    stack.spacing = 16;
    stack.translatesAutoresizingMaskIntoConstraints = NO;
    [self.view addSubview:stack];

    for (NSString *category in @[@"ui", @"input", @"wait", @"probe"]) {
        UIButton *button = [UIButton buttonWithType:UIButtonTypeSystem];
        [button setTitle:[category.uppercaseString stringByAppendingString:@" capability"] forState:UIControlStateNormal];
        button.titleLabel.font = [UIFont boldSystemFontOfSize:18];
        button.backgroundColor = UIColor.systemBlueColor;
        [button setTitleColor:UIColor.whiteColor forState:UIControlStateNormal];
        button.layer.cornerRadius = 12;
        button.accessibilityIdentifier = [NSString stringWithFormat:@"api.menu.%@", category];
        button.accessibilityValue = category;
        [[button.heightAnchor constraintEqualToConstant:56] setActive:YES];
        [button addTarget:self action:@selector(openCategory:) forControlEvents:UIControlEventTouchUpInside];
        [stack addArrangedSubview:button];
    }

    [NSLayoutConstraint activateConstraints:@[
        [stack.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor constant:24],
        [stack.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor constant:-24],
        [stack.centerYAnchor constraintEqualToAnchor:self.view.centerYAnchor],
    ]];
}

- (void)openCategory:(UIButton *)sender {
    NSString *category = sender.accessibilityValue;
    APICapabilityViewController *controller = [[APICapabilityViewController alloc] initWithCategory:category];
    [self.navigationController pushViewController:controller animated:NO];
}

@end
