#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface AuthResult : NSObject

@property (nonatomic, readonly, getter=isSuccess) BOOL success;
@property (nonatomic, copy, readonly) NSString *message;

- (instancetype)initWithSuccess:(BOOL)success message:(NSString *)message;

@end

@interface AuthSession : NSObject

@property (nonatomic, copy, readonly) NSString *displayName;
@property (nonatomic, copy, readonly) NSString *account;

+ (instancetype)sharedSession NS_SWIFT_NAME(shared());

- (AuthResult *)loginWithAccount:(NSString *)account
                           password:(NSString *)password
    NS_SWIFT_NAME(login(account:password:));

- (AuthResult *)createAccountWithName:(NSString *)name
                                 account:(NSString *)account
                                password:(NSString *)password
                            confirmation:(NSString *)confirmation
                           acceptedTerms:(BOOL)acceptedTerms
    NS_SWIFT_NAME(createAccount(name:account:password:confirmation:acceptedTerms:));

- (void)logout;

@end

NS_ASSUME_NONNULL_END
