import SwiftUI

/// The Wise-inspired design: near-black ink at heavy weights, one vivid lime
/// accent, and white rounded cards on a sage canvas. Nothing is translucent and
/// nothing is blurred — the hierarchy comes from weight and space.
///
/// Fixed rather than following the device: lime means "this is the action",
/// amber means "you are needed", red ends a call. A dark scheme or a tinted
/// accent would overwrite meaning with decoration, which is why the app asks
/// for the light scheme at its root.
enum Ink {
    /// The action colour. Everything important is this or sits on it.
    static let lime = Color(hex: 0x9FE870)
    static let limeActive = Color(hex: 0xCDFFAD)
    static let limeNeutral = Color(hex: 0xC5EDAB)
    /// The wash behind a lime-tinted panel.
    static let limePale = Color(hex: 0xE2F6D5)

    /// Near-black. Headlines, the live screen, the account card.
    static let text = Color(hex: 0x0E0F0C)
    /// The green-black used for links and text on lime.
    static let deep = Color(hex: 0x163300)
    static let body = Color(hex: 0x454745)
    static let mute = Color(hex: 0x868685)

    static let card = Color(hex: 0xFFFFFF)
    /// The page behind the cards.
    static let canvas = Color(hex: 0xE8EBE6)
    /// A pressed or hovered row inside a card.
    static let cardSoft = Color(hex: 0xF8FAF6)
    static let divider = Color(hex: 0xEEF0EA)
    static let hairline = Color(hex: 0x0E0F0C, alpha: 0.1)
    static let outline = Color(hex: 0x0E0F0C)
    /// The ring on an unselected control: a code box, a carousel dot.
    static let rim = Color(hex: 0xC9CDC5)
    /// The same idea one step softer — an unselected radio.
    static let rimSoft = Color(hex: 0xB8BCB4)
    /// A disabled pill, and the rule between transcript lines.
    static let canvasSoft = Color(hex: 0xF2F4EF)

    static let positive = Color(hex: 0x2EAD4B)
    static let positiveDeep = Color(hex: 0x054D28)
    static let warning = Color(hex: 0xFFD11A)
    static let warningDeep = Color(hex: 0xB86700)
    /// Text on the amber badge — amber is far too bright to carry white.
    static let warningInk = Color(hex: 0x4A3B1C)
    static let negative = Color(hex: 0xD03238)
    static let negativeDeep = Color(hex: 0xA72027)
    static let negativeWash = Color(hex: 0xFBE4E5)

    /// Google's blue, for the one button that has to look like theirs.
    static let google = Color(hex: 0x4285F4)

    static let onLime = Color(hex: 0x0E0F0C)
    static let onDark = Color(hex: 0xFFFFFF)
    /// Muted text and hairlines on the dark live screen.
    static let onDarkMute = Color(hex: 0x868685)

    /// Body text on the black live card — lighter than ``mute`` so a whole line
    /// of transcript stays readable against it.
    static let onDarkBody = Color(hex: 0xB9BAB6)
    static let onDarkWash = Color(hex: 0xFFFFFF, alpha: 0.09)
    static let onDarkRim = Color(hex: 0xFFFFFF, alpha: 0.3)
    /// The other party's bubble on the live screen.
    static let onDarkBubble = Color(hex: 0x2A2A28)
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}
