import UIKit

final class AuthViewController: UIViewController {
    private var isRegisterMode = false
    private var acceptedTerms = false
    private let scrollView = UIScrollView()
    private var previousViewportSize = CGSize.zero
    private var needsEditingReveal = false

    private let loginTab = AuthViewController.makeTab(
        title: NSLocalizedString("auth.login", comment: "Login tab"),
        identifier: "hello.auth.login.tab"
    )
    private let registerTab = AuthViewController.makeTab(
        title: NSLocalizedString("auth.register", comment: "Registration tab"),
        identifier: "hello.auth.register.tab"
    )
    private let nameField = AuthViewController.makeField(
        placeholder: NSLocalizedString("auth.name.hint", comment: "Display name input hint"),
        contentType: .name,
        identifier: "hello.register.name"
    )
    private let accountField = AuthViewController.makeField(
        placeholder: NSLocalizedString("auth.account.hint", comment: "Account input hint"),
        contentType: .username,
        identifier: "hello.login.account"
    )
    private let passwordField = AuthViewController.makeField(
        placeholder: NSLocalizedString("auth.password.hint", comment: "Password input hint"),
        contentType: .password,
        identifier: "hello.login.password",
        secure: true
    )
    private let confirmationField = AuthViewController.makeField(
        placeholder: NSLocalizedString("auth.confirm_password.hint", comment: "Password confirmation hint"),
        contentType: .newPassword,
        identifier: "hello.register.confirm",
        secure: true
    )
    private let errorLabel: UILabel = {
        let label = UILabel()
        label.font = .preferredFont(forTextStyle: .footnote)
        label.textColor = AppStyle.error
        label.numberOfLines = 0
        label.isHidden = true
        label.accessibilityIdentifier = "hello.auth.error"
        return label
    }()
    private let termsButton: UIButton = {
        var configuration = UIButton.Configuration.plain()
        configuration.title = NSLocalizedString("auth.terms", comment: "Terms acceptance label")
        configuration.image = UIImage(systemName: "square")
        configuration.imagePadding = 8
        configuration.baseForegroundColor = AppStyle.secondary
        configuration.contentInsets = .zero
        let button = UIButton(configuration: configuration)
        button.contentHorizontalAlignment = .leading
        button.titleLabel?.font = .preferredFont(forTextStyle: .footnote)
        button.accessibilityIdentifier = "hello.register.terms"
        return button
    }()
    private let submitButton: UIButton = {
        var configuration = UIButton.Configuration.filled()
        configuration.title = NSLocalizedString("auth.login_continue", comment: "Login submit button")
        configuration.baseBackgroundColor = AppStyle.brand
        configuration.baseForegroundColor = .white
        configuration.cornerStyle = .medium
        let button = UIButton(configuration: configuration)
        button.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        button.accessibilityIdentifier = "hello.login.submit"
        return button
    }()
    private lazy var nameGroup = makeFieldGroup(
        title: NSLocalizedString("auth.name.label", comment: "Display name label"),
        field: nameField
    )
    private lazy var confirmationGroup = makeFieldGroup(
        title: NSLocalizedString("auth.confirm_password.label", comment: "Password confirmation label"),
        field: confirmationField
    )

    override func viewDidLoad() {
        super.viewDidLoad()
        title = ""
        view.backgroundColor = AppStyle.page
        view.accessibilityIdentifier = "hello.login.page"
        navigationItem.largeTitleDisplayMode = .never
        navigationController?.setNavigationBarHidden(true, animated: false)
        buildInterface()
        wireInteractions()
        let dismissTap = UITapGestureRecognizer(target: self, action: #selector(dismissKeyboard))
        dismissTap.cancelsTouchesInView = false
        dismissTap.delegate = self
        view.addGestureRecognizer(dismissTap)
        updateMode(animated: false)
    }

    @objc private func dismissKeyboard() {
        view.endEditing(true)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let viewportChanged = scrollView.bounds.size != previousViewportSize
        previousViewportSize = scrollView.bounds.size
        guard viewportChanged || needsEditingReveal else { return }
        needsEditingReveal = false
        guard let field = [nameField, accountField, passwordField, confirmationField]
            .first(where: { $0.isFirstResponder }) else { return }

        // Keep the active input and submit action above the keyboard together.
        // On short screens the active input takes priority; the form remains scrollable.
        let fieldRect = field.convert(field.bounds, to: scrollView).insetBy(dx: 0, dy: -12)
        let submitRect = submitButton.convert(submitButton.bounds, to: scrollView).insetBy(dx: 0, dy: -12)
        let editingRect = fieldRect.union(submitRect)
        let availableHeight = scrollView.bounds.height
            - scrollView.adjustedContentInset.top - scrollView.adjustedContentInset.bottom
        scrollView.scrollRectToVisible(
            editingRect.height <= availableHeight ? editingRect : fieldRect,
            animated: false
        )
    }

    private func buildInterface() {
        scrollView.alwaysBounceVertical = true
        scrollView.keyboardDismissMode = .interactive
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scrollView)

        let content = UIStackView()
        content.axis = .vertical
        content.alignment = .fill
        content.spacing = 0
        content.translatesAutoresizingMaskIntoConstraints = false
        content.accessibilityIdentifier = "hello.auth.page"
        scrollView.addSubview(content)

        let logo = UILabel()
        logo.text = "H"
        logo.textColor = .white
        logo.font = .systemFont(ofSize: 18, weight: .bold)
        logo.textAlignment = .center
        logo.backgroundColor = AppStyle.brand
        logo.layer.cornerRadius = 18
        logo.clipsToBounds = true
        logo.accessibilityLabel = NSLocalizedString("auth.logo.accessibility", comment: "Logo accessibility label")
        logo.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            logo.widthAnchor.constraint(equalToConstant: 64),
            logo.heightAnchor.constraint(equalToConstant: 64),
        ])

        let titleLabel = UILabel()
        titleLabel.text = NSLocalizedString("auth.title", comment: "Authentication page title")
        titleLabel.font = .systemFont(ofSize: 29, weight: .bold)
        titleLabel.textColor = AppStyle.ink
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0

        let subtitle = UILabel()
        subtitle.text = NSLocalizedString("auth.subtitle", comment: "Authentication page subtitle")
        subtitle.font = .preferredFont(forTextStyle: .subheadline)
        subtitle.textColor = AppStyle.secondary
        subtitle.textAlignment = .center

        let header = UIStackView(arrangedSubviews: [logo, titleLabel, subtitle])
        header.axis = .vertical
        header.alignment = .center
        header.spacing = 10
        header.setCustomSpacing(18, after: logo)
        content.addArrangedSubview(header)
        titleLabel.widthAnchor.constraint(lessThanOrEqualTo: content.widthAnchor).isActive = true
        content.setCustomSpacing(28, after: header)

        let tabBackground = UIView()
        tabBackground.backgroundColor = UIColor(red: 240 / 255, green: 242 / 255, blue: 247 / 255, alpha: 1)
        tabBackground.layer.cornerRadius = 14
        tabBackground.translatesAutoresizingMaskIntoConstraints = false
        tabBackground.heightAnchor.constraint(equalToConstant: 48).isActive = true
        let tabs = UIStackView(arrangedSubviews: [loginTab, registerTab])
        tabs.distribution = .fillEqually
        tabs.spacing = 4
        tabs.translatesAutoresizingMaskIntoConstraints = false
        tabBackground.addSubview(tabs)
        NSLayoutConstraint.activate([
            tabs.topAnchor.constraint(equalTo: tabBackground.topAnchor, constant: 4),
            tabs.leadingAnchor.constraint(equalTo: tabBackground.leadingAnchor, constant: 4),
            tabs.trailingAnchor.constraint(equalTo: tabBackground.trailingAnchor, constant: -4),
            tabs.bottomAnchor.constraint(equalTo: tabBackground.bottomAnchor, constant: -4),
        ])

        let form = UIStackView(arrangedSubviews: [
            tabBackground,
            nameGroup,
            makeFieldGroup(
                title: NSLocalizedString("auth.account.label", comment: "Account field label"),
                field: accountField
            ),
            makeFieldGroup(
                title: NSLocalizedString("auth.password.label", comment: "Password field label"),
                field: passwordField
            ),
            confirmationGroup,
            termsButton,
            errorLabel,
            submitButton,
        ])
        form.axis = .vertical
        form.spacing = 14
        form.setCustomSpacing(20, after: tabBackground)
        form.setCustomSpacing(20, after: termsButton)
        form.setCustomSpacing(20, after: errorLabel)
        form.backgroundColor = .white
        form.layer.cornerRadius = 22
        form.layer.shadowColor = UIColor.black.cgColor
        form.layer.shadowOpacity = 0.08
        form.layer.shadowRadius = 18
        form.layer.shadowOffset = CGSize(width: 0, height: 8)
        form.isLayoutMarginsRelativeArrangement = true
        form.layoutMargins = UIEdgeInsets(top: 20, left: 20, bottom: 20, right: 20)
        form.translatesAutoresizingMaskIntoConstraints = false
        form.accessibilityIdentifier = "hello.auth.form"
        submitButton.heightAnchor.constraint(equalToConstant: 54).isActive = true
        content.addArrangedSubview(form)

        let privacy = UILabel()
        privacy.text = NSLocalizedString("auth.privacy_note", comment: "Authentication privacy notice")
        privacy.font = .preferredFont(forTextStyle: .caption1)
        privacy.textColor = AppStyle.secondary
        privacy.textAlignment = .center
        privacy.numberOfLines = 0
        content.setCustomSpacing(20, after: form)
        content.addArrangedSubview(privacy)

        let contentGuide = scrollView.contentLayoutGuide
        let frameGuide = scrollView.frameLayoutGuide
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
            content.topAnchor.constraint(equalTo: contentGuide.topAnchor, constant: 44),
            content.leadingAnchor.constraint(equalTo: contentGuide.leadingAnchor, constant: 24),
            content.trailingAnchor.constraint(equalTo: contentGuide.trailingAnchor, constant: -24),
            content.bottomAnchor.constraint(equalTo: contentGuide.bottomAnchor, constant: -32),
            content.widthAnchor.constraint(equalTo: frameGuide.widthAnchor, constant: -48),
        ])
    }

    private func wireInteractions() {
        loginTab.addTarget(self, action: #selector(selectLogin), for: .touchUpInside)
        registerTab.addTarget(self, action: #selector(selectRegister), for: .touchUpInside)
        termsButton.addTarget(self, action: #selector(toggleTerms), for: .touchUpInside)
        submitButton.addTarget(self, action: #selector(submit), for: .touchUpInside)

        [nameField, accountField, passwordField, confirmationField].forEach { $0.delegate = self }
        nameField.returnKeyType = .next
        accountField.returnKeyType = .next
        passwordField.returnKeyType = .done
        confirmationField.returnKeyType = .done
    }

    @objc private func selectLogin() {
        isRegisterMode = false
        updateMode(animated: true)
    }

    @objc private func selectRegister() {
        isRegisterMode = true
        updateMode(animated: true)
    }

    @objc private func toggleTerms() {
        acceptedTerms.toggle()
        termsButton.configuration?.image = UIImage(systemName: acceptedTerms ? "checkmark.square.fill" : "square")
        termsButton.configuration?.baseForegroundColor = acceptedTerms ? AppStyle.brand : AppStyle.secondary
        termsButton.accessibilityValue = acceptedTerms
            ? NSLocalizedString("auth.terms.accepted", comment: "Terms accepted accessibility value")
            : NSLocalizedString("auth.terms.not_accepted", comment: "Terms not accepted accessibility value")
    }

    @objc private func submit() {
        view.endEditing(true)
        let account = (accountField.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let result: AuthResult
        if isRegisterMode {
            result = AuthSession.shared().createAccount(
                name: (nameField.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                account: account,
                password: passwordField.text ?? "",
                confirmation: confirmationField.text ?? "",
                acceptedTerms: acceptedTerms
            )
        } else {
            result = AuthSession.shared().login(account: account, password: passwordField.text ?? "")
        }

        guard result.isSuccess else {
            errorLabel.text = result.message
            errorLabel.isHidden = false
            UIAccessibility.post(notification: .announcement, argument: result.message)
            return
        }

        errorLabel.isHidden = true
        navigationController?.setViewControllers([HomeViewController()], animated: true)
    }

    private func updateMode(animated: Bool) {
        let changes = {
            self.nameGroup.isHidden = !self.isRegisterMode
            self.confirmationGroup.isHidden = !self.isRegisterMode
            self.termsButton.isHidden = !self.isRegisterMode
            self.loginTab.backgroundColor = self.isRegisterMode ? .clear : AppStyle.brand
            self.registerTab.backgroundColor = self.isRegisterMode ? AppStyle.brand : .clear
            self.loginTab.setTitleColor(self.isRegisterMode ? AppStyle.secondary : .white, for: .normal)
            self.registerTab.setTitleColor(self.isRegisterMode ? .white : AppStyle.secondary, for: .normal)
            self.submitButton.configuration?.title = self.isRegisterMode
                ? NSLocalizedString("auth.create_account", comment: "Registration submit button")
                : NSLocalizedString("auth.login_continue", comment: "Login submit button")
            self.submitButton.accessibilityIdentifier = self.isRegisterMode ? "hello.register.submit" : "hello.login.submit"
            self.passwordField.returnKeyType = self.isRegisterMode ? .next : .done
            self.errorLabel.isHidden = true
            self.view.layoutIfNeeded()
        }
        if animated {
            UIView.animate(withDuration: 0.2, animations: changes)
        } else {
            changes()
        }
    }

    private func makeFieldGroup(title: String, field: UITextField) -> UIStackView {
        let label = UILabel()
        label.text = title
        label.font = .systemFont(ofSize: 13, weight: .semibold)
        label.textColor = AppStyle.ink
        let group = UIStackView(arrangedSubviews: [label, field])
        group.axis = .vertical
        group.spacing = 7
        return group
    }

    private static func makeTab(title: String, identifier: String) -> UIButton {
        let button = UIButton(type: .system)
        button.setTitle(title, for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
        button.layer.cornerRadius = 11
        button.accessibilityIdentifier = identifier
        return button
    }

    private static func makeField(
        placeholder: String,
        contentType: UITextContentType,
        identifier: String,
        secure: Bool = false
    ) -> UITextField {
        let field = InsetTextField()
        field.placeholder = placeholder
        field.textContentType = contentType
        field.isSecureTextEntry = secure
        field.autocapitalizationType = .none
        field.autocorrectionType = .no
        field.clearButtonMode = .whileEditing
        field.backgroundColor = AppStyle.input
        field.layer.cornerRadius = 12
        field.layer.borderWidth = 1
        field.layer.borderColor = AppStyle.divider.cgColor
        field.font = .preferredFont(forTextStyle: .body)
        field.accessibilityIdentifier = identifier
        field.translatesAutoresizingMaskIntoConstraints = false
        field.heightAnchor.constraint(equalToConstant: 52).isActive = true
        return field
    }
}

extension AuthViewController: UIGestureRecognizerDelegate {
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        // Controls may receive touches through their internal labels or image views.
        var touchedView = touch.view
        while let current = touchedView {
            if current is UIControl || current is UITextView {
                return false
            }
            touchedView = current.superview
        }
        return true
    }
}

extension AuthViewController: UITextFieldDelegate {
    func textFieldDidBeginEditing(_ textField: UITextField) {
        needsEditingReveal = true
        view.setNeedsLayout()
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        switch textField {
        case nameField: accountField.becomeFirstResponder()
        case accountField: passwordField.becomeFirstResponder()
        case passwordField where isRegisterMode: confirmationField.becomeFirstResponder()
        default:
            textField.resignFirstResponder()
            submit()
        }
        return true
    }
}
