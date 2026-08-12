import SwiftUI
import UIKit

/// One entry from the design's type scale.
///
/// Compose carries size, line height and tracking on a single `TextStyle`;
/// SwiftUI splits them across a font and two modifiers, so they are held
/// together here and applied in one go by ``View/wise(_:)``.
struct TypeStyle {
    let face: String
    let size: CGFloat
    let lineHeight: CGFloat
    let tracking: CGFloat

    var font: Font { .custom(face, size: size) }

    /// SwiftUI's `lineSpacing` is the gap between lines, not the line's height,
    /// so the font's own leading has to come off the design's figure first.
    var lineSpacing: CGFloat {
        let natural = UIFont(name: face, size: size)?.lineHeight ?? size * 1.2
        return max(0, lineHeight - natural)
    }
}

enum Fonts {
    static let regular = "Inter-Regular"
    static let medium = "Inter-Medium"
    static let semiBold = "Inter-SemiBold"
    static let bold = "Inter-Bold"
    static let extraBold = "Inter-ExtraBold"
    static let black = "Inter-Black"

    static let monoLight = "RobotoMono-Light"
    static let mono = "RobotoMono-Regular"
    static let monoMedium = "RobotoMono-Medium"
}

private func inter(_ face: String, _ size: CGFloat, _ line: CGFloat, _ tracking: CGFloat = 0) -> TypeStyle {
    TypeStyle(face: face, size: size, lineHeight: line, tracking: tracking)
}

/// Every type style in the design. Sizes come straight from the prototype.
enum Type {
    /// The one heavy voice: screen titles and onboarding headlines.
    static let display = inter(Fonts.black, 40, 41, -0.5)
    static let title = inter(Fonts.black, 30, 34, -0.5)
    static let heading = inter(Fonts.black, 28, 31, -0.4)
    static let result = inter(Fonts.black, 27, 32, -0.4)

    /// The title on a pushed screen — one step down from a tab's own title.
    static let pushed = inter(Fonts.black, 24, 28, -0.3)

    /// A card's own heading, and the title in a step header.
    static let section = inter(Fonts.extraBold, 19, 24, -0.2)
    static let amount = inter(Fonts.extraBold, 21, 26, -0.3)
    static let callName = inter(Fonts.extraBold, 21, 26, -0.2)

    /// The title on a screen pushed over the feed — smaller than a step header.
    static let screenTitle = inter(Fonts.bold, 16.5, 22, -0.2)

    /// The wordmark in the feed's top bar.
    static let wordmark = inter(Fonts.extraBold, 15, 20, -0.2)

    /// A row in the activity feed: title over a quieter second line.
    static let rowTitle = inter(Fonts.semiBold, 14, 19)
    static let rowSub = inter(Fonts.regular, 12.5, 17)

    /// A row in a list: the name line.
    static let listTitle = inter(Fonts.bold, 15.5, 20, -0.1)
    static let listItem = inter(Fonts.medium, 15.5, 20)
    static let value = inter(Fonts.bold, 15, 20)

    static let body = inter(Fonts.regular, 15, 22)
    static let bodyLarge = inter(Fonts.regular, 16, 24)
    static let sub = inter(Fonts.regular, 14, 21)
    static let caption = inter(Fonts.regular, 13, 19)
    static let fine = inter(Fonts.regular, 12, 18)
    static let tiny = inter(Fonts.regular, 11, 16)

    /// Wide-tracked uppercase labels above a card or a group.
    static let label = inter(Fonts.bold, 12, 16, 0.7)
    static let labelSmall = inter(Fonts.bold, 11, 15, 0.66)

    static let button = inter(Fonts.bold, 16, 20)
    static let buttonSmall = inter(Fonts.bold, 14, 18)
    static let chip = inter(Fonts.semiBold, 13, 17)
    /// The chip that carries a state rather than an action — a filter, a step.
    static let chipStrong = inter(Fonts.bold, 13, 17)
    static let navLabel = inter(Fonts.bold, 11, 14)
    /// The status badge on a call.
    static let badge = inter(Fonts.bold, 12, 16)
    /// The dial pad under the code boxes.
    static let keypad = inter(Fonts.semiBold, 22, 26)
    /// An underlined text link, in the deep green.
    static let link = inter(Fonts.semiBold, 15, 20)
    static let linkSmall = inter(Fonts.semiBold, 14, 18)

    /// The bubble on the live screen.
    static let bubble = inter(Fonts.regular, 14.5, 21)
    static let bubbleTranslation = inter(Fonts.regular, 12.5, 18)
    static let speaker = inter(Fonts.bold, 11, 15)

    /// Times, phone numbers and money — the things that must not reflow.
    static let mono = TypeStyle(face: Fonts.mono, size: 12, lineHeight: 17, tracking: 0)
    static let monoBody = TypeStyle(face: Fonts.mono, size: 13, lineHeight: 19, tracking: 0)
    /// The OTP boxes.
    static let code = inter(Fonts.extraBold, 24, 28)
}

extension View {
    /// Font, tracking and leading from one entry in the scale. One modifier
    /// rather than three at every call site, and the only place the three are
    /// allowed to disagree.
    func wise(_ style: TypeStyle) -> some View {
        font(style.font)
            .tracking(style.tracking)
            .lineSpacing(style.lineSpacing)
    }
}
