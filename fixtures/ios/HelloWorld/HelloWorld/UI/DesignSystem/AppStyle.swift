import UIKit

enum AppStyle {
    static let brand = UIColor(red: 79 / 255, green: 111 / 255, blue: 239 / 255, alpha: 1)
    static let brandDark = UIColor(red: 52 / 255, green: 76 / 255, blue: 183 / 255, alpha: 1)
    static let ink = UIColor(red: 24 / 255, green: 33 / 255, blue: 59 / 255, alpha: 1)
    static let secondary = UIColor(red: 102 / 255, green: 112 / 255, blue: 138 / 255, alpha: 1)
    static let page = UIColor(red: 245 / 255, green: 247 / 255, blue: 252 / 255, alpha: 1)
    static let input = UIColor(red: 246 / 255, green: 247 / 255, blue: 250 / 255, alpha: 1)
    static let divider = UIColor(red: 233 / 255, green: 236 / 255, blue: 243 / 255, alpha: 1)
    static let error = UIColor(red: 196 / 255, green: 61 / 255, blue: 75 / 255, alpha: 1)
}

final class InsetTextField: UITextField {
    private let insets = UIEdgeInsets(top: 0, left: 16, bottom: 0, right: 16)

    override func textRect(forBounds bounds: CGRect) -> CGRect { bounds.inset(by: insets) }
    override func editingRect(forBounds bounds: CGRect) -> CGRect { bounds.inset(by: insets) }
    override func placeholderRect(forBounds bounds: CGRect) -> CGRect { bounds.inset(by: insets) }
}

final class GradientView: UIView {
    private let gradient = CAGradientLayer()

    init(colors: [UIColor]) {
        super.init(frame: .zero)
        gradient.colors = colors.map(\.cgColor)
        gradient.startPoint = CGPoint(x: 0, y: 0)
        gradient.endPoint = CGPoint(x: 1, y: 1)
        layer.insertSublayer(gradient, at: 0)
    }

    required init?(coder: NSCoder) { nil }

    override func layoutSubviews() {
        super.layoutSubviews()
        gradient.frame = bounds
        gradient.cornerRadius = layer.cornerRadius
    }
}
