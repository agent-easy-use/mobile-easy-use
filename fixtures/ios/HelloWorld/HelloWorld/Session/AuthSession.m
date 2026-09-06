#import "AuthSession.h"

@interface AuthSession ()
@property (nonatomic, copy, readwrite) NSString *displayName;
@property (nonatomic, copy, readwrite) NSString *account;
@end

@implementation AuthResult

- (instancetype)initWithSuccess:(BOOL)success message:(NSString *)message {
    self = [super init];
    if (self) {
        _success = success;
        _message = [message copy];
    }
    return self;
}

@end

@implementation AuthSession

+ (instancetype)sharedSession {
    static AuthSession *session;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        session = [[AuthSession alloc] init];
    });
    return session;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _displayName = @"";
        _account = @"";
    }
    return self;
}

- (AuthResult *)loginWithAccount:(NSString *)account password:(NSString *)password {
    NSString *message = [self validationMessageForAccount:account password:password];
    if (message) {
        return [[AuthResult alloc] initWithSuccess:NO message:message];
    }

    self.account = account;
    NSString *candidate = [[account componentsSeparatedByString:@"@"] firstObject];
    self.displayName = candidate.length > 0 ? candidate : @"Explorer";
    return [[AuthResult alloc] initWithSuccess:YES message:@""];
}

- (AuthResult *)createAccountWithName:(NSString *)name
                                 account:(NSString *)account
                                password:(NSString *)password
                            confirmation:(NSString *)confirmation
                           acceptedTerms:(BOOL)acceptedTerms {
    if (name.length < 2) {
        return [[AuthResult alloc] initWithSuccess:NO
                                           message:NSLocalizedString(@"auth.error.name_too_short", nil)];
    }
    NSString *message = [self validationMessageForAccount:account password:password];
    if (message) {
        return [[AuthResult alloc] initWithSuccess:NO message:message];
    }
    if (![password isEqualToString:confirmation]) {
        return [[AuthResult alloc] initWithSuccess:NO
                                           message:NSLocalizedString(@"auth.error.passwords_mismatch", nil)];
    }
    if (!acceptedTerms) {
        return [[AuthResult alloc] initWithSuccess:NO
                                           message:NSLocalizedString(@"auth.error.terms_required", nil)];
    }

    self.displayName = name;
    self.account = account;
    return [[AuthResult alloc] initWithSuccess:YES message:@""];
}

- (void)logout {
    self.displayName = @"";
    self.account = @"";
}

- (nullable NSString *)validationMessageForAccount:(NSString *)account
                                           password:(NSString *)password {
    if (account.length < 3) {
        return NSLocalizedString(@"auth.error.invalid_account", nil);
    }
    if (password.length < 6) {
        return NSLocalizedString(@"auth.error.password_too_short", nil);
    }
    return nil;
}

@end
