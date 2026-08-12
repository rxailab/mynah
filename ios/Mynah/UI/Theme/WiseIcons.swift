import SwiftUI

/// The design's own icons, kept as the path data it drew them with: a 24-unit
/// grid with 2.2-wide round strokes, or a solid fill.
///
/// SF Symbols are close but not the same shape — the weight and the corner
/// radius differ — and at the 15–22pt these are used at, that difference is
/// most of what a row looks like. Every path here is the one the Android app
/// draws, so the two never diverge.
struct VectorIcon: Equatable {
    let paths: [String]
    /// Nil for a solid fill.
    let strokeWidth: CGFloat?

    static func stroked(_ paths: String..., width: CGFloat = 2.2) -> VectorIcon {
        VectorIcon(paths: paths, strokeWidth: width)
    }

    static func filled(_ paths: String...) -> VectorIcon {
        VectorIcon(paths: paths, strokeWidth: nil)
    }
}

enum Wise {

    /// Back. iOS puts this top-left, and the swipe does the same thing.
    static let arrowLeft = VectorIcon.stroked("M19 12H5", "m11 18-6-6 6-6")

    /// Dismiss a sheet — the counterpart to the swipe down.
    static let close = VectorIcon.stroked("M6 6l12 12", "M18 6 6 18")

    /// "There is more behind this row."
    static let chevronRight = VectorIcon.stroked("m9 6 6 6-6 6")

    static let search = VectorIcon.stroked(
        "M4.5 11a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0 -13 0",
        "m16.5 16.5 4 4"
    )

    static let home = VectorIcon.stroked("M3 11.5 12 4l9 7.5", "M5.5 10v9.5h13V10", width: 1.9)

    static let person = VectorIcon.stroked(
        "M8.6 8a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0 -6.8 0",
        "M5 19.5c1.3-3 4-4.6 7-4.6s5.7 1.6 7 4.6",
        width: 1.9
    )

    /// The heavier tick inside the lime disc on the result screen.
    static let check = VectorIcon.stroked("M5 13l5 5L20 7", width: 2.8)

    static let phone = VectorIcon.filled(
        "M6.6 3.8c.6-.6 1.6-.5 2.1.2l1.5 2c.4.6.3 1.4-.2 1.9l-.9.9a12 12 0 0 0 4.1 4.1l"
            + ".9-.9c.5-.5 1.3-.6 1.9-.2l2 1.5c.7.5.8 1.5.2 2.1l-1 1c-.7.7-1.7 1-2.6.7-2.5-."
            + "8-4.9-2.3-6.9-4.3s-3.5-4.4-4.3-6.9c-.3-.9 0-1.9.7-2.6z"
    )

    static let play = VectorIcon.filled("M8 5v14l11-7z")

    /// Notifications, in the feed's top bar.
    static let bell = VectorIcon.stroked(
        "M6 9.5a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13.5 6 9.5z",
        "M10.3 18.5a1.9 1.9 0 0 0 3.4 0",
        width: 1.9
    )

    /// Settings, in the feed's top bar.
    static let gear = VectorIcon.stroked(
        "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
        "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 "
            + "0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1."
            + "65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1."
            + "82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 "
            + "0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 "
            + "1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.8"
            + "2-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0"
            + " 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
        width: 1.9
    )

    // --- drawn to the same grid, for the screens the prototype did not cover ---

    /// The record of past calls.
    static let clock = VectorIcon.stroked(
        "M5.5 12a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0 -13 0",
        "M12 8.4V12l2.6 1.7",
        width: 1.9
    )

    /// Hold to dictate.
    static let mic = VectorIcon.stroked(
        "M12 4.2a2.5 2.5 0 0 1 2.5 2.5v4.8a2.5 2.5 0 0 1-5 0V6.7A2.5 2.5 0 0 1 12 4.2z",
        "M6.6 11.2a5.4 5.4 0 0 0 10.8 0",
        "M12 16.6v3.2"
    )

    /// Sends a typed fact into a live call.
    static let arrowUp = VectorIcon.stroked("M12 19V5", "m5 12 7-7 7 7")

    static let plus = VectorIcon.stroked("M12 5v14", "M5 12h14")

    /// No connection: the signal arcs, struck through.
    static let wifiOff = VectorIcon.stroked(
        "M5 12.5a10 10 0 0 1 14 0",
        "M8.5 15.5a5.5 5.5 0 0 1 7 0",
        "M12 19h.01",
        "M4 4l16 16",
        width: 1.9
    )

    /// Share the result of a finished call, as the design's tray-and-arrow.
    static let share = VectorIcon.stroked(
        "M12 14.5V4",
        "m8 7.5 4-4 4 4",
        "M5 11.5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6",
        width: 1.9
    )

    /// Redial.
    static let rotate = VectorIcon.stroked(
        "M20 11.5a8 8 0 1 1-2.4-5.7",
        "M20 4.5v5h-5"
    )

    static let eye = VectorIcon.stroked(
        "M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6z",
        "M9.4 12a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0",
        width: 1.9
    )

    static let eyeOff = VectorIcon.stroked(
        "M10 6.2A9.6 9.6 0 0 1 12 6c5.9 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6",
        "M6.4 7.6A17 17 0 0 0 2.5 12s3.6 6 9.5 6a9.3 9.3 0 0 0 3.7-.75",
        "M4 4l16 16",
        width: 1.9
    )
}

/// One icon, drawn at the size it is asked for and tinted by whatever
/// foreground style is in force — the same contract `Image` has.
struct Icon: View {
    let icon: VectorIcon
    var size: CGFloat = 20

    init(_ icon: VectorIcon, size: CGFloat = 20) {
        self.icon = icon
        self.size = size
    }

    var body: some View {
        ZStack {
            ForEach(Array(icon.paths.enumerated()), id: \.offset) { _, data in
                if let width = icon.strokeWidth {
                    SVGShape(data: data)
                        .stroke(style: StrokeStyle(
                            lineWidth: width * size / 24,
                            lineCap: .round,
                            lineJoin: .round
                        ))
                } else {
                    SVGShape(data: data)
                }
            }
        }
        .frame(width: size, height: size)
    }
}
