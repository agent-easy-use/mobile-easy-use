import UIKit

final class HomeViewController: UIViewController {
    private var count = 0
    private let featureFlagProvider = FeatureFlagProvider()
    private let countLabel: UILabel = {
        let label = UILabel()
        label.font = .monospacedDigitSystemFont(ofSize: 34, weight: .bold)
        label.textColor = AppStyle.ink
        label.accessibilityIdentifier = "hello.counter.value"
        return label
    }()
    private let inspectionStatusLabel: UILabel = {
        let label = UILabel()
        label.text = "Not enabled for this workspace"
        label.textColor = AppStyle.brandDark
        label.font = .systemFont(ofSize: 14, weight: .semibold)
        label.numberOfLines = 0
        label.accessibilityIdentifier = "hello.inspection.status"
        return label
    }()

    override func viewDidLoad() {
        super.viewDidLoad()
        title = ""
        view.backgroundColor = AppStyle.page
        view.accessibilityIdentifier = "hello.home.page"
        navigationController?.setNavigationBarHidden(true, animated: false)
        buildInterface()
        updateCountLabel()
    }

    private func buildInterface() {
        let scrollView = UIScrollView()
        scrollView.alwaysBounceVertical = true
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scrollView)

        let content = UIStackView()
        content.axis = .vertical
        content.spacing = 0
        content.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(content)

        let logo = UILabel()
        logo.text = "M"
        logo.textColor = .white
        logo.textAlignment = .center
        logo.font = .systemFont(ofSize: 18, weight: .bold)
        logo.backgroundColor = AppStyle.brand
        logo.layer.cornerRadius = 12
        logo.clipsToBounds = true
        logo.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            logo.widthAnchor.constraint(equalToConstant: 40),
            logo.heightAnchor.constraint(equalToConstant: 40),
        ])

        let brand = UILabel()
        brand.text = "HelloWorld"
        brand.textColor = AppStyle.ink
        brand.font = .systemFont(ofSize: 19, weight: .bold)

        var logoutConfig = UIButton.Configuration.tinted()
        logoutConfig.title = "Log out"
        logoutConfig.baseForegroundColor = AppStyle.brandDark
        logoutConfig.baseBackgroundColor = UIColor(red: 232 / 255, green: 238 / 255, blue: 1, alpha: 1)
        logoutConfig.cornerStyle = .medium
        let logout = UIButton(configuration: logoutConfig)
        logout.accessibilityIdentifier = "hello.home.logout"
        logout.addTarget(self, action: #selector(logoutTapped), for: .touchUpInside)

        let spacer = UIView()
        let topBar = UIStackView(arrangedSubviews: [logo, brand, spacer, logout])
        topBar.axis = .horizontal
        topBar.alignment = .center
        topBar.spacing = 12
        content.addArrangedSubview(topBar)
        content.setCustomSpacing(24, after: topBar)

        let welcomeCard = GradientView(colors: [AppStyle.brand, UIColor(red: 37 / 255, green: 58 / 255, blue: 136 / 255, alpha: 1)])
        welcomeCard.layer.cornerRadius = 22
        welcomeCard.layer.shadowColor = UIColor.black.cgColor
        welcomeCard.layer.shadowOpacity = 0.12
        welcomeCard.layer.shadowRadius = 14
        welcomeCard.layer.shadowOffset = CGSize(width: 0, height: 7)
        welcomeCard.translatesAutoresizingMaskIntoConstraints = false

        let welcome = UILabel()
        welcome.text = "Ready to explore, \(AuthSession.shared().displayName)?"
        welcome.textColor = .white
        welcome.font = .systemFont(ofSize: 25, weight: .bold)
        welcome.accessibilityIdentifier = "hello.home.welcome"

        let account = UILabel()
        account.text = AuthSession.shared().account
        account.textColor = UIColor(red: 184 / 255, green: 204 / 255, blue: 1, alpha: 1)
        account.font = .preferredFont(forTextStyle: .subheadline)
        account.accessibilityIdentifier = "hello.home.account"

        let message = UILabel()
        message.text = "Explore a native mobile app with stable UI identifiers and repeatable state changes."
        message.textColor = UIColor(white: 0.95, alpha: 1)
        message.font = .preferredFont(forTextStyle: .subheadline)
        message.numberOfLines = 0

        let welcomeStack = UIStackView(arrangedSubviews: [welcome, account, message])
        welcomeStack.axis = .vertical
        welcomeStack.spacing = 6
        welcomeStack.setCustomSpacing(24, after: account)
        welcomeStack.translatesAutoresizingMaskIntoConstraints = false
        welcomeCard.addSubview(welcomeStack)
        NSLayoutConstraint.activate([
            welcomeStack.topAnchor.constraint(equalTo: welcomeCard.topAnchor, constant: 22),
            welcomeStack.leadingAnchor.constraint(equalTo: welcomeCard.leadingAnchor, constant: 22),
            welcomeStack.trailingAnchor.constraint(equalTo: welcomeCard.trailingAnchor, constant: -22),
            welcomeStack.bottomAnchor.constraint(equalTo: welcomeCard.bottomAnchor, constant: -22),
        ])
        content.addArrangedSubview(welcomeCard)

        let overviewTitle = sectionTitle("Activity overview")
        content.setCustomSpacing(28, after: welcomeCard)
        content.addArrangedSubview(overviewTitle)
        content.setCustomSpacing(14, after: overviewTitle)

        let countCard = metricCard(title: "Sample actions", valueView: countLabel, color: UIColor(red: 233 / 255, green: 238 / 255, blue: 1, alpha: 1))
        let evidenceCount = UILabel()
        evidenceCount.text = "3"
        evidenceCount.font = .monospacedDigitSystemFont(ofSize: 34, weight: .bold)
        evidenceCount.textColor = AppStyle.ink
        let evidenceKinds = UILabel()
        evidenceKinds.text = "UI · State · Chain"
        evidenceKinds.font = .systemFont(ofSize: 10, weight: .medium)
        evidenceKinds.textColor = UIColor(red: 37 / 255, green: 122 / 255, blue: 91 / 255, alpha: 1)
        let evidenceValue = UIStackView(arrangedSubviews: [evidenceCount, evidenceKinds])
        evidenceValue.axis = .vertical
        evidenceValue.spacing = 0
        let goalCard = metricCard(title: "Available scenarios", valueView: evidenceValue, color: UIColor(red: 229 / 255, green: 246 / 255, blue: 238 / 255, alpha: 1))
        let metrics = UIStackView(arrangedSubviews: [countCard, goalCard])
        metrics.axis = .horizontal
        metrics.distribution = .fillEqually
        metrics.spacing = 14
        metrics.heightAnchor.constraint(equalToConstant: 128).isActive = true
        content.addArrangedSubview(metrics)

        var incrementConfig = UIButton.Configuration.filled()
        incrementConfig.title = "Run sample action"
        incrementConfig.baseBackgroundColor = AppStyle.brand
        incrementConfig.baseForegroundColor = .white
        incrementConfig.cornerStyle = .medium
        let increment = UIButton(configuration: incrementConfig)
        increment.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        increment.accessibilityIdentifier = "hello.counter.increment"
        increment.addTarget(self, action: #selector(incrementCount), for: .touchUpInside)
        increment.heightAnchor.constraint(equalToConstant: 54).isActive = true
        content.setCustomSpacing(16, after: metrics)
        content.addArrangedSubview(increment)

        let capabilitiesTitle = sectionTitle("Account capabilities")
        content.setCustomSpacing(28, after: increment)
        content.addArrangedSubview(capabilitiesTitle)
        content.setCustomSpacing(14, after: capabilitiesTitle)

        let inspectionHeading = UILabel()
        inspectionHeading.text = "Advanced inspection"
        inspectionHeading.textColor = AppStyle.ink
        inspectionHeading.font = .systemFont(ofSize: 16, weight: .bold)

        let inspectionDescription = UILabel()
        inspectionDescription.text = "Unlock additional account details when the rollout is enabled."
        inspectionDescription.textColor = AppStyle.secondary
        inspectionDescription.font = .systemFont(ofSize: 13)
        inspectionDescription.numberOfLines = 0

        var inspectionConfig = UIButton.Configuration.tinted()
        inspectionConfig.title = "Refresh access"
        inspectionConfig.baseForegroundColor = AppStyle.brandDark
        inspectionConfig.baseBackgroundColor = UIColor(red: 232 / 255, green: 238 / 255, blue: 1, alpha: 1)
        inspectionConfig.cornerStyle = .medium
        let inspectionAction = UIButton(configuration: inspectionConfig)
        inspectionAction.accessibilityIdentifier = "hello.inspection.action"
        inspectionAction.addTarget(self, action: #selector(checkAdvancedInspection), for: .touchUpInside)
        inspectionAction.heightAnchor.constraint(equalToConstant: 48).isActive = true

        let inspectionCard = UIStackView(arrangedSubviews: [
            inspectionHeading,
            inspectionDescription,
            inspectionStatusLabel,
            inspectionAction,
        ])
        inspectionCard.axis = .vertical
        inspectionCard.spacing = 8
        inspectionCard.setCustomSpacing(16, after: inspectionDescription)
        inspectionCard.setCustomSpacing(14, after: inspectionStatusLabel)
        inspectionCard.backgroundColor = .white
        inspectionCard.layer.cornerRadius = 20
        inspectionCard.isLayoutMarginsRelativeArrangement = true
        inspectionCard.layoutMargins = UIEdgeInsets(top: 18, left: 18, bottom: 18, right: 18)
        content.addArrangedSubview(inspectionCard)

        let quickTitle = sectionTitle("Quick actions")
        content.setCustomSpacing(28, after: inspectionCard)
        content.addArrangedSubview(quickTitle)
        content.setCustomSpacing(14, after: quickTitle)

        let quickCard = UIStackView(arrangedSubviews: [
            featureRow(icon: "person.crop.circle", title: "Manage account", subtitle: "Update profile and sign-in preferences"),
            divider(),
            featureRow(icon: "clock.fill", title: "Review activity", subtitle: "Inspect recent actions and current state"),
            divider(),
            featureRow(icon: "bookmark.fill", title: "Save preferences", subtitle: "Keep frequently used choices available"),
        ])
        quickCard.axis = .vertical
        quickCard.backgroundColor = .white
        quickCard.layer.cornerRadius = 20
        quickCard.isLayoutMarginsRelativeArrangement = true
        quickCard.layoutMargins = UIEdgeInsets(top: 4, left: 18, bottom: 4, right: 18)
        content.addArrangedSubview(quickCard)

        let mcpTitle = sectionTitle("App status")
        content.setCustomSpacing(28, after: quickCard)
        content.addArrangedSubview(mcpTitle)
        content.setCustomSpacing(14, after: mcpTitle)

        let mcpDescription = UILabel()
        mcpDescription.text = "The sample states below make UI and state changes easy to verify."
        mcpDescription.textColor = AppStyle.secondary
        mcpDescription.font = .preferredFont(forTextStyle: .subheadline)
        mcpDescription.numberOfLines = 0
        let chips = UIStackView(arrangedSubviews: [
            toolChip("signed in"),
            toolChip("active"),
            toolChip("ready"),
        ])
        chips.axis = .horizontal
        chips.distribution = .fillEqually
        chips.spacing = 8
        chips.heightAnchor.constraint(equalToConstant: 38).isActive = true
        let mcpCard = UIStackView(arrangedSubviews: [mcpDescription, chips])
        mcpCard.axis = .vertical
        mcpCard.spacing = 16
        mcpCard.backgroundColor = .white
        mcpCard.layer.cornerRadius = 20
        mcpCard.isLayoutMarginsRelativeArrangement = true
        mcpCard.layoutMargins = UIEdgeInsets(top: 18, left: 18, bottom: 18, right: 18)
        content.addArrangedSubview(mcpCard)

        let contentGuide = scrollView.contentLayoutGuide
        let frameGuide = scrollView.frameLayoutGuide
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            content.topAnchor.constraint(equalTo: contentGuide.topAnchor, constant: 18),
            content.leadingAnchor.constraint(equalTo: contentGuide.leadingAnchor, constant: 22),
            content.trailingAnchor.constraint(equalTo: contentGuide.trailingAnchor, constant: -22),
            content.bottomAnchor.constraint(equalTo: contentGuide.bottomAnchor, constant: -36),
            content.widthAnchor.constraint(equalTo: frameGuide.widthAnchor, constant: -44),
        ])
    }

    @objc private func incrementCount() {
        count += 1
        updateCountLabel()
        NSLog("[HelloWorld] count=%d", count)
    }

    @objc private func checkAdvancedInspection() {
        let enabled = featureFlagProvider.isAdvancedInspectionEnabled()
        inspectionStatusLabel.text = enabled
            ? "Enabled for this workspace"
            : "Not enabled for this workspace"
        inspectionStatusLabel.accessibilityLabel = inspectionStatusLabel.text
        NSLog("[HelloWorld] advancedInspectionEnabled=%d", enabled)
    }

    @objc private func logoutTapped() {
        AuthSession.shared().logout()
        navigationController?.setViewControllers([AuthViewController()], animated: true)
    }

    private func updateCountLabel() {
        countLabel.text = "Count: \(count)"
        countLabel.accessibilityLabel = "Count: \(count)"
    }

    private func sectionTitle(_ text: String) -> UILabel {
        let label = UILabel()
        label.text = text
        label.textColor = AppStyle.ink
        label.font = .systemFont(ofSize: 18, weight: .bold)
        return label
    }

    private func metricCard(title: String, valueView: UIView, color: UIColor) -> UIView {
        let label = UILabel()
        label.text = title
        label.textColor = AppStyle.brandDark
        label.font = .systemFont(ofSize: 13, weight: .semibold)
        let stack = UIStackView(arrangedSubviews: [label, valueView])
        stack.axis = .vertical
        stack.alignment = .leading
        stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false
        let card = UIView()
        card.backgroundColor = color
        card.layer.cornerRadius = 18
        card.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 18),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: card.trailingAnchor, constant: -12),
            stack.centerYAnchor.constraint(equalTo: card.centerYAnchor),
        ])
        return card
    }

    private func featureRow(icon: String, title: String, subtitle: String) -> UIView {
        let image = UIImageView(image: UIImage(systemName: icon))
        image.tintColor = AppStyle.brand
        image.contentMode = .scaleAspectFit
        image.backgroundColor = UIColor(red: 232 / 255, green: 238 / 255, blue: 1, alpha: 1)
        image.layer.cornerRadius = 12
        image.translatesAutoresizingMaskIntoConstraints = false
        image.widthAnchor.constraint(equalToConstant: 40).isActive = true
        image.heightAnchor.constraint(equalToConstant: 40).isActive = true
        let titleLabel = UILabel()
        titleLabel.text = title
        titleLabel.textColor = AppStyle.ink
        titleLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        let subtitleLabel = UILabel()
        subtitleLabel.text = subtitle
        subtitleLabel.textColor = AppStyle.secondary
        subtitleLabel.font = .systemFont(ofSize: 12)
        subtitleLabel.numberOfLines = 2
        let copy = UIStackView(arrangedSubviews: [titleLabel, subtitleLabel])
        copy.axis = .vertical
        copy.spacing = 4
        let row = UIStackView(arrangedSubviews: [image, copy])
        row.axis = .horizontal
        row.alignment = .center
        row.spacing = 14
        row.heightAnchor.constraint(greaterThanOrEqualToConstant: 72).isActive = true
        return row
    }

    private func toolChip(_ title: String) -> UILabel {
        let label = UILabel()
        label.text = title
        label.textAlignment = .center
        label.textColor = AppStyle.brandDark
        label.font = .monospacedSystemFont(ofSize: 10, weight: .semibold)
        label.backgroundColor = UIColor(red: 232 / 255, green: 238 / 255, blue: 1, alpha: 1)
        label.layer.cornerRadius = 10
        label.clipsToBounds = true
        return label
    }

    private func divider() -> UIView {
        let line = UIView()
        line.backgroundColor = AppStyle.divider
        line.heightAnchor.constraint(equalToConstant: 1).isActive = true
        return line
    }
}
