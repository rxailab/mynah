import SwiftUI

// MARK: - the shapes the whole design is cut from

/// 24pt everywhere: cards, the lime capsule, the dark panels.
let cardRadius: CGFloat = 24
let buttonRadius: CGFloat = 24
let fieldRadius: CGFloat = 12

let cardShape = RoundedRectangle(cornerRadius: cardRadius, style: .continuous)
let buttonShape = RoundedRectangle(cornerRadius: buttonRadius, style: .continuous)
let fieldShape = RoundedRectangle(cornerRadius: fieldRadius, style: .continuous)

// MARK: - how a call presents itself

/// - Parameter dot: the bead in a list row — the whole state, read before any words.
enum Presentation {
    case needsYou, live, dialling, done, noAnswer

    var label: String {
        switch self {
        case .needsYou: t("status_needs_you")
        case .live: t("status_on_the_call")
        case .dialling: t("status_dialling")
        case .done: t("status_done")
        case .noAnswer: t("status_no_answer")
        }
    }

    var ink: Color {
        switch self {
        case .needsYou: Ink.warningInk
        case .live: Ink.lime
        case .dialling: Ink.warning
        case .done: Ink.positiveDeep
        case .noAnswer: Ink.negativeDeep
        }
    }

    /// Live and dialling borrow the dark panel: on a page of white cards, ink is
    /// the loudest surface there is, and lime on it is the same pairing the call
    /// screen itself uses.
    var wash: Color {
        switch self {
        case .needsYou: Ink.warning
        case .live, .dialling: Ink.text
        case .done: Ink.limePale
        case .noAnswer: Ink.negativeWash
        }
    }

    var dot: Color {
        switch self {
        case .needsYou: Ink.warningDeep
        case .live: Ink.lime
        case .dialling: Ink.warning
        case .done: Ink.positive
        case .noAnswer: Ink.negative
        }
    }

    var isMoving: Bool { self == .live || self == .dialling }
}

extension Call {
    func presentation() -> Presentation {
        switch status {
        case CallStatus.transferring: .needsYou
        case CallStatus.inProgress: .live
        case CallStatus.queued, CallStatus.dialing: .dialling
        case CallStatus.failed: .noAnswer
        default: .done
        }
    }

    /// A finished card leads with the answer, not with who was called — that is
    /// the whole point of the history. Fall back down the chain when there is
    /// nothing better to lead with.
    func headline() -> String {
        switch presentation() {
        case .done:
            // A Swift dictionary has no order, so the server's is gone by the
            // time this runs and "the first fact" has to be defined here. By key,
            // the same way the detail and result cards list them, so the headline
            // is the row the eye lands on first rather than a different one.
            if let answer = results.sorted(by: { $0.key < $1.key })
                .first(where: { $0.value.isNotBlank })?.value { return answer }
            if let summary, summary.isNotBlank { return summary }
            return businessName
        case .noAnswer: return t("status_no_answer")
        case .needsYou: return t("headline_needs_you", businessName)
        default: return goal
        }
    }

    func subline() -> String {
        switch presentation() {
        case .done:
            if let summary, summary.isNotBlank, summary != headline() { return summary }
            return businessName
        case .noAnswer: return error ?? t("subline_did_not_connect")
        case .needsYou: return t("subline_transfer")
        case .dialling: return t("subline_ringing")
        case .live: return goal
        }
    }
}

private let clockFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "HH:mm"
    return formatter
}()

func formatClock(_ epochMillis: Int) -> String {
    clockFormatter.string(from: Date(timeIntervalSince1970: Double(epochMillis) / 1000))
}

func elapsedOf(_ call: Call, now: Int) -> String {
    let until = call.endedAt ?? now
    let seconds = max(0, (until - call.createdAt) / 1000)
    return String(format: "%02d:%02d", seconds / 60, seconds % 60)
}

/// How long this call has been queueing, in the same mm:ss the call's own timer
/// uses — two clocks side by side only read as a comparison if they are written
/// the same way.
func holdElapsedOf(_ call: Call, now: Int) -> String {
    let seconds = call.holdSoFarSeconds(now: now)
    return String(format: "%02d:%02d", seconds / 60, seconds % 60)
}

/// "2m 06s" — the shape the design writes finished durations in.
func durationLabel(_ seconds: Int) -> String {
    seconds >= 60 ? String(format: "%dm %02ds", seconds / 60, seconds % 60) : "\(seconds)s"
}

/// "Today" / "Yesterday" / "14 May" — the headers history groups under.
func dayLabel(_ epochMillis: Int, now: Int, language: Language) -> String {
    let calendar = Calendar.current
    let startOfToday = calendar.startOfDay(for: Date(timeIntervalSince1970: Double(now) / 1000))
    let moment = Date(timeIntervalSince1970: Double(epochMillis) / 1000)
    if moment >= startOfToday { return t("day_today") }
    if moment >= startOfToday.addingTimeInterval(-24 * 60 * 60) { return t("day_yesterday") }

    let locale = language.locale ?? Locale.current
    let formatter = DateFormatter()
    formatter.locale = locale
    formatter.dateFormat = locale.language.languageCode?.identifier == "zh" ? "M月d日" : "d MMMM"
    return formatter.string(from: moment)
}

/// "£0.14 · 2m 06s" — what Twilio charged, once it has rated the call.
func costLabel(_ cost: Cost) -> String {
    let symbol: String
    switch cost.unit.uppercased() {
    case "GBP": symbol = "£"
    case "USD": symbol = "$"
    case "EUR": symbol = "€"
    default: symbol = ""
    }
    var amount = cost.price
    if amount.contains(".") {
        while amount.hasSuffix("0") { amount.removeLast() }
        if amount.hasSuffix(".") { amount.removeLast() }
    }
    if amount.isEmpty { amount = "0" }
    let money = symbol.isEmpty ? "\(amount) \(cost.unit)" : "\(symbol)\(amount)"
    let seconds = cost.durationSeconds
    return "\(money) · \(seconds / 60)m \(String(format: "%02d", seconds % 60))s"
}

// MARK: - the surface

/// The page. Sage, flat, and completely plain: in this design the hierarchy is
/// carried by the contrast between the canvas and the white cards sitting on it,
/// so there is nothing to blur, tint or shade behind them.
struct AppBackdrop<Content: View>: View {
    var colour: Color = Ink.canvas
    @ViewBuilder var content: Content

    var body: some View {
        ZStack {
            colour.ignoresSafeArea()
            content
        }
    }
}

/// The one repeated surface: white, 24pt, no shadow and no rim.
struct WiseCard<Content: View>: View {
    var fill: Color = Ink.card
    var radius: CGFloat = cardRadius
    var onTap: (() -> Void)?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(fill, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .tappable(onTap)
    }
}

/// A row inside a card, with the rule the design puts between rows.
struct CardRow<Content: View>: View {
    var divider = true
    var onTap: (() -> Void)?
    var padding = EdgeInsets(top: 14, leading: 18, bottom: 14, trailing: 18)
    var dividerColour: Color = Ink.divider
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) { content }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(padding)
                .tappable(onTap)
            if divider { Rule(dividerColour) }
        }
    }
}

struct Rule: View {
    var colour: Color = Ink.divider

    init(_ colour: Color = Ink.divider) { self.colour = colour }

    var body: some View {
        colour.frame(height: 1).frame(maxWidth: .infinity)
    }
}

extension View {
    /// The Wise input: white, an ink hairline, and a 12pt corner. Never filled.
    func wiseField(radius: CGFloat = fieldRadius) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        return background(Ink.card, in: shape)
            .overlay(shape.strokeBorder(Ink.outline, lineWidth: 1))
    }

    /// Taps with no ripple, for rows and cards that shouldn't move under a finger.
    @ViewBuilder
    func tappable(_ action: (() -> Void)?) -> some View {
        if let action {
            contentShape(Rectangle()).onTapGesture(perform: action)
        } else {
            self
        }
    }
}

/// The design presses its buttons by shrinking them slightly. A highlight would
/// be the wrong idiom on a flat lime capsule, so the scale carries the feedback
/// instead.
struct Pressable: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

// MARK: - actions

/// The lime capsule. There is at most one of these on a screen — it is what the
/// screen is for. Disabled it goes flat sage with muted text rather than fading,
/// because a translucent lime still reads as the thing to press.
struct PrimaryButton<Leading: View>: View {
    let label: String
    let action: () -> Void
    var enabled = true
    var height: CGFloat = 52
    var container: Color = Ink.lime
    var content: Color = Ink.onLime
    var disabledContainer: Color = Ink.canvasSoft
    var disabledContent: Color = Ink.mute
    var style: TypeStyle = Type.button
    @ViewBuilder var leading: Leading

    var body: some View {
        Button(action: action) {
            HStack(spacing: 9) {
                leading
                Text(label)
                    .wise(style)
                    .lineLimit(1)
            }
            .foregroundStyle(enabled ? content : disabledContent)
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .padding(.horizontal, 22)
            .background(enabled ? container : disabledContainer, in: buttonShape)
        }
        .buttonStyle(Pressable())
        .disabled(!enabled)
    }
}

extension PrimaryButton where Leading == EmptyView {
    init(
        _ label: String,
        enabled: Bool = true,
        height: CGFloat = 52,
        container: Color = Ink.lime,
        content: Color = Ink.onLime,
        disabledContainer: Color = Ink.canvasSoft,
        disabledContent: Color = Ink.mute,
        style: TypeStyle = Type.button,
        action: @escaping () -> Void
    ) {
        self.init(
            label: label, action: action, enabled: enabled, height: height,
            container: container, content: content,
            disabledContainer: disabledContainer, disabledContent: disabledContent,
            style: style, leading: { EmptyView() }
        )
    }
}

/// White with an ink outline — the secondary action. "Call again", "Manage".
struct OutlineButton<Leading: View>: View {
    let label: String
    let action: () -> Void
    var enabled = true
    var height: CGFloat = 50
    var colour: Color = Ink.text
    var fill: Color = Ink.card
    var border: Color = Ink.outline
    var style: TypeStyle = Type.button
    @ViewBuilder var leading: Leading

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                leading
                Text(label).wise(style).lineLimit(1)
            }
            .foregroundStyle(colour)
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .padding(.horizontal, 20)
            .background(fill, in: buttonShape)
            .overlay(buttonShape.strokeBorder(border, lineWidth: 1))
            .opacity(enabled ? 1 : 0.4)
        }
        .buttonStyle(Pressable())
        .disabled(!enabled)
    }
}

extension OutlineButton where Leading == EmptyView {
    init(
        _ label: String,
        enabled: Bool = true,
        height: CGFloat = 50,
        colour: Color = Ink.text,
        fill: Color = Ink.card,
        border: Color = Ink.outline,
        style: TypeStyle = Type.button,
        action: @escaping () -> Void
    ) {
        self.init(
            label: label, action: action, enabled: enabled, height: height,
            colour: colour, fill: fill, border: border, style: style,
            leading: { EmptyView() }
        )
    }
}

/// An underlined link in the deep green. The design's third level of action.
struct LinkText: View {
    let text: String
    let action: () -> Void
    var style: TypeStyle = Type.link
    var colour: Color = Ink.deep

    init(_ text: String, style: TypeStyle = Type.link, colour: Color = Ink.deep, action: @escaping () -> Void) {
        self.text = text
        self.style = style
        self.colour = colour
        self.action = action
    }

    var body: some View {
        Text(text)
            .wise(style)
            .underline()
            .foregroundStyle(colour)
            .contentShape(Rectangle())
            .onTapGesture(perform: action)
    }
}

/// A white pill that fills something in for you — an example, a template.
struct SuggestionChip: View {
    let label: String
    var fill: Color = Ink.card
    var colour: Color = Ink.text
    let action: () -> Void

    var body: some View {
        Text(label)
            .wise(Type.chip)
            .lineLimit(1)
            .foregroundStyle(colour)
            .padding(.horizontal, 15)
            .padding(.vertical, 9)
            .background(fill, in: Capsule())
            .contentShape(Capsule())
            .onTapGesture(perform: action)
    }
}

/// The filter chip, in Wise's clothes: the live one goes ink with lime text,
/// which is the same "dark card" move the account and usage panels make.
struct WiseFilterChip: View {
    let label: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Text(label)
            .wise(Type.chipStrong)
            .lineLimit(1)
            .foregroundStyle(selected ? Ink.lime : Ink.text)
            .padding(.horizontal, 15)
            .padding(.vertical, 8)
            .background(selected ? Ink.text : Ink.card, in: Capsule())
            .contentShape(Capsule())
            .onTapGesture(perform: action)
    }
}

/// DONE / NEEDS YOU / ON THE CALL, as the design's rounded badge.
struct StatusBadge: View {
    let presentation: Presentation

    var body: some View {
        Text(presentation.label)
            .wise(Type.badge)
            .foregroundStyle(presentation.ink)
            .padding(.horizontal, 11)
            .padding(.vertical, 5)
            .background(presentation.wash, in: Capsule())
    }
}

/// The bead at the head of a list row. It breathes while the call is running.
struct StatusDot: View {
    let presentation: Presentation
    var size: CGFloat = 8

    var body: some View {
        if presentation.isMoving {
            PulsingDot(colour: presentation.dot, size: size)
        } else {
            Circle().fill(presentation.dot).frame(width: size, height: size)
        }
    }
}

/// The wide-tracked uppercase label that titles a group.
struct SectionLabel: View {
    let text: String
    var colour: Color = Ink.mute

    init(_ text: String, colour: Color = Ink.mute) {
        self.text = text
        self.colour = colour
    }

    var body: some View {
        Text(text.uppercased()).wise(Type.label).foregroundStyle(colour)
    }
}

/// Back, or ✕ on a full-screen sheet. The negative inset lines the glyph up
/// with the text below rather than the 40pt target.
struct NavIcon: View {
    let icon: VectorIcon
    let action: () -> Void
    /// What VoiceOver reads. Back by default, since that is what all but one of
    /// these are.
    var label: String = t("action_back")
    var tint: Color = Ink.text
    var size: CGFloat = 21

    var body: some View {
        Button(action: action) {
            Icon(icon, size: size)
                .foregroundStyle(tint)
                .frame(width: 40, height: 40)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .offset(x: -8)
    }
}

/// The header on a step of the new-call flow: ✕ or ←, a title, and "2 / 3".
struct StepHeader: View {
    let icon: VectorIcon
    let onNavigate: () -> Void
    let title: String
    var step: String?

    var body: some View {
        HStack(spacing: 0) {
            NavIcon(icon: icon, action: onNavigate)
            Spacer().frame(width: 4)
            Text(title)
                .wise(Type.section)
                .foregroundStyle(Ink.text)
                .lineLimit(1)
            if let step {
                Spacer(minLength: 8)
                Text(step).wise(Type.linkSmall).foregroundStyle(Ink.mute)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - motion

/// Bars that rise and fall: the one thing that says a call is happening now.
/// The staggered lime bars are the prototype's welcome animation, reused
/// wherever the app is listening or on a line.
struct Waveform: View {
    var barCount = 3
    var barWidth: CGFloat = 3
    var gap: CGFloat = 2.5
    var period = 1.0
    var stagger = 0.2
    var colour: Color = Ink.lime

    @State private var running = false

    var body: some View {
        HStack(spacing: gap) {
            ForEach(0..<barCount, id: \.self) { index in
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .fill(colour)
                    .frame(width: barWidth)
                    .scaleEffect(y: running ? 1 : 0.3, anchor: .center)
                    .animation(
                        .easeInOut(duration: period)
                            .repeatForever(autoreverses: true)
                            .delay(Double(index) * stagger),
                        value: running
                    )
            }
        }
        .onAppear { running = true }
    }
}

/// A dot that breathes, for anything waiting on someone.
struct PulsingDot: View {
    var colour: Color
    var size: CGFloat = 7

    @State private var faded = false

    var body: some View {
        Circle()
            .fill(colour)
            .frame(width: size, height: size)
            .opacity(faded ? 0.3 : 1)
            .animation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true), value: faded)
            .onAppear { faded = true }
    }
}

/// Rings expanding outward — dialling, and the mic while it listens.
struct PulseRings: View {
    var colour: Color = Ink.lime
    var period = 1.8

    @State private var running = false

    var body: some View {
        ZStack {
            ForEach(0..<2, id: \.self) { index in
                Circle()
                    .strokeBorder(colour, lineWidth: 2)
                    .scaleEffect(running ? 1.5 : 0.9)
                    .opacity(running ? 0 : 0.6)
                    .animation(
                        .linear(duration: period)
                            .repeatForever(autoreverses: false)
                            .delay(Double(index) * period / 3),
                        value: running
                    )
            }
        }
        .onAppear { running = true }
    }
}

// MARK: - plumbing

/// Something went wrong. A white card with red text rather than a red card: in
/// this palette the semantic colours only ever carry state, never a surface.
struct ErrorCard: View {
    let message: String
    let onDismiss: () -> Void

    var body: some View {
        WiseCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 9) {
                    Circle().fill(Ink.negative).frame(width: 8, height: 8).padding(.top, 5)
                    Text(message)
                        .wise(Type.caption)
                        .foregroundStyle(Ink.body)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                LinkText(t("action_dismiss"), style: Type.linkSmall, action: onDismiss)
                    .padding(.leading, 17)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
        }
    }
}

/// The amber panel: the assistant has stopped and is waiting on you.
struct NeedsYouCard: View {
    let title: String
    let body_: String
    let action: String
    let onAction: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).wise(Type.section).foregroundStyle(Ink.warningInk)
            Spacer().frame(height: 6)
            Text(body_)
                .wise(Type.caption)
                .foregroundStyle(Ink.warningInk)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 14)
            OutlineButton(
                label: action,
                action: onAction,
                height: 46,
                colour: Ink.warningInk,
                fill: .clear,
                border: Ink.warningInk,
                style: Type.buttonSmall,
                leading: { Icon(Wise.phone, size: 15) }
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Ink.warning, in: cardShape)
    }
}

// MARK: - the redesign's shared furniture
// Every screen pushed over the feed opens the same way, and the feed itself is
// three shapes repeated: an icon button, a filter chip, and a row in a grouped
// white card. They live here so the twenty screens that use them cannot drift.

/// Back arrow, title, and optionally something on the right.
struct ScreenHeader<Trailing: View>: View {
    let title: String
    let onBack: () -> Void
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 0) {
            IconCircle(icon: Wise.arrowLeft, action: onBack)
                .accessibilityLabel(t("action_back"))
            Spacer().frame(width: 4)
            Text(title)
                .wise(Type.screenTitle)
                .foregroundStyle(Ink.text)
                .frame(maxWidth: .infinity, alignment: .leading)
            trailing
        }
        .padding(.leading, 12)
        .padding(.trailing, 12)
        .padding(.top, 10)
    }
}

extension ScreenHeader where Trailing == EmptyView {
    init(_ title: String, onBack: @escaping () -> Void) {
        self.init(title: title, onBack: onBack, trailing: { EmptyView() })
    }
}

/// A 40pt tap target with no chrome until you touch it.
struct IconCircle: View {
    let icon: VectorIcon
    let action: () -> Void
    var size: CGFloat = 40
    var iconSize: CGFloat = 20
    var tint: Color = Ink.text
    var badge = false

    var body: some View {
        Button(action: action) {
            ZStack {
                Icon(icon, size: iconSize).foregroundStyle(tint)
                if badge {
                    // Offset rather than aligned to a corner: the dot belongs to
                    // the bell's shoulder, not to the tap target's edge.
                    Circle()
                        .fill(Ink.negative)
                        .frame(width: 7, height: 7)
                        .padding(.top, 7)
                        .padding(.trailing, 8)
                        .frame(width: size, height: size, alignment: .topTrailing)
                }
            }
            .frame(width: size, height: size)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// A pill that seeds something rather than filtering it.
struct OutlineChip: View {
    let label: String
    let action: () -> Void

    var body: some View {
        Text(label)
            .wise(Type.chip)
            .foregroundStyle(Ink.text)
            .padding(.horizontal, 13)
            .padding(.vertical, 8)
            .background(Ink.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(Ink.hairline, lineWidth: 1)
            )
            .contentShape(Rectangle())
            .onTapGesture(perform: action)
    }
}

/// One of the feed's 全部 / 需要你 / 已完成 chips. Selected goes solid ink.
struct StateChip: View {
    let label: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Text(label)
            .wise(selected ? Type.chipStrong : Type.chip)
            .foregroundStyle(selected ? Ink.onDark : Ink.text)
            .padding(.horizontal, 13)
            .padding(.vertical, 7)
            .background(selected ? Ink.text : Ink.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(selected ? .clear : Ink.hairline, lineWidth: 1)
            )
            .contentShape(Rectangle())
            .onTapGesture(perform: action)
    }
}

/// The uppercase group label above a card — "今天", "本月明细".
struct GroupLabel: View {
    let text: String
    var trailing: String?

    init(_ text: String, trailing: String? = nil) {
        self.text = text
        self.trailing = trailing
    }

    var body: some View {
        HStack(alignment: .lastTextBaseline, spacing: 6) {
            Text(text).wise(Type.label).foregroundStyle(Ink.mute)
            if let trailing {
                Text(trailing).wise(Type.mono).foregroundStyle(Ink.rim)
            }
        }
    }
}

/// Collects the rows of a ``GroupedCard`` so the card can place the hairlines
/// itself — every caller otherwise gets the last one subtly wrong.
@resultBuilder
enum RowsBuilder {
    static func buildExpression(_ view: some View) -> [AnyView] { [AnyView(view)] }
    static func buildBlock(_ parts: [AnyView]...) -> [AnyView] { parts.flatMap { $0 } }
    static func buildOptional(_ part: [AnyView]?) -> [AnyView] { part ?? [] }
    static func buildEither(first: [AnyView]) -> [AnyView] { first }
    static func buildEither(second: [AnyView]) -> [AnyView] { second }
    static func buildArray(_ parts: [[AnyView]]) -> [AnyView] { parts.flatMap { $0 } }
}

/// A white card that groups rows, with hairlines between them and none at the
/// ends.
struct GroupedCard: View {
    let rows: [AnyView]

    init(@RowsBuilder rows: () -> [AnyView]) { self.rows = rows() }

    var body: some View {
        WiseCard(radius: 16) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                if index > 0 {
                    Ink.divider.frame(height: 1).padding(.horizontal, 16)
                }
                row
            }
        }
    }
}

/// A row in the activity feed: status dot, two lines, and a right-hand column.
struct FeedRow<Right: View>: View {
    let dot: Color
    let title: String
    let subtitle: String
    let onTap: () -> Void
    var pulsing = false
    @ViewBuilder var right: Right

    var body: some View {
        HStack(spacing: 0) {
            if pulsing {
                PulsingDot(colour: dot, size: 8)
            } else {
                Circle().fill(dot).frame(width: 8, height: 8)
            }
            Spacer().frame(width: 12)
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .wise(Type.rowTitle)
                    .foregroundStyle(Ink.text)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if subtitle.isNotBlank {
                    Text(subtitle)
                        .wise(Type.rowSub)
                        .foregroundStyle(Ink.mute)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 0) { right }
                .padding(.leading, 10)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
    }
}

extension FeedRow where Right == EmptyView {
    init(dot: Color, title: String, subtitle: String, pulsing: Bool = false, onTap: @escaping () -> Void) {
        self.init(dot: dot, title: title, subtitle: subtitle, onTap: onTap, pulsing: pulsing, right: { EmptyView() })
    }
}

/// A settings-style row: label over a hint, a value, and a chevron.
struct SettingRow<Trailing: View>: View {
    let title: String
    var subtitle: String?
    var value: String?
    var onTap: (() -> Void)?
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Text(title).wise(Type.listItem).foregroundStyle(Ink.text)
                if let subtitle {
                    Text(subtitle)
                        .wise(Type.fine)
                        .foregroundStyle(Ink.mute)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let value {
                Text(value)
                    .wise(Type.caption)
                    .foregroundStyle(Ink.body)
                    .padding(.leading, 10)
            }
            trailing
            if onTap != nil, Trailing.self == EmptyView.self {
                Icon(Wise.chevronRight, size: 14)
                    .foregroundStyle(Ink.mute)
                    .padding(.leading, 8)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .contentShape(Rectangle())
        .tappable(onTap)
    }
}

extension SettingRow where Trailing == EmptyView {
    init(title: String, subtitle: String? = nil, value: String? = nil, onTap: (() -> Void)? = nil) {
        self.init(title: title, subtitle: subtitle, value: value, onTap: onTap, trailing: { EmptyView() })
    }
}

/// The prototype's pill switch: ink when on, stone when off.
struct PillSwitch: View {
    let on: Bool
    let action: () -> Void

    var body: some View {
        ZStack(alignment: .leading) {
            Capsule().fill(on ? Ink.text : Ink.rim)
            Circle()
                .fill(on ? Ink.lime : Ink.card)
                .frame(width: 18, height: 18)
                .padding(.leading, on ? 19 : 3)
        }
        .frame(width: 40, height: 24)
        .animation(.easeOut(duration: 0.16), value: on)
        .contentShape(Rectangle())
        .onTapGesture(perform: action)
    }
}

/// Chips that wrap onto as many lines as they need — Compose's `FlowRow`.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.replacingUnspecifiedDimensions().width
        let rows = arrange(subviews, in: width)
        let height = rows.reduce(0) { $0 + $1.height } + lineSpacing * CGFloat(max(0, rows.count - 1))
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(subviews, in: bounds.width) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(
                    at: CGPoint(x: x, y: y + (row.height - size.height) / 2),
                    proposal: ProposedViewSize(size)
                )
                x += size.width + spacing
            }
            y += row.height + lineSpacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var height: CGFloat = 0
    }

    private func arrange(_ subviews: Subviews, in width: CGFloat) -> [Row] {
        var rows: [Row] = []
        var row = Row()
        var x: CGFloat = 0
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            if !row.indices.isEmpty, x + size.width > width {
                rows.append(row)
                row = Row()
                x = 0
            }
            row.indices.append(index)
            row.height = max(row.height, size.height)
            x += size.width + spacing
        }
        if !row.indices.isEmpty { rows.append(row) }
        return rows
    }
}

/// Asks before forgetting one call, and says what goes with it.
///
/// The same words wherever it is asked from — a row in the history and the
/// screen for that one call are the same decision, and answering it in two
/// different tones would read as two different actions.
extension View {
    func confirmsDeletingCall(
        _ presented: Binding<Bool>,
        delete: @escaping () -> Void
    ) -> some View {
        confirmationDialog(
            t("delete_call_title"),
            isPresented: presented,
            titleVisibility: .visible
        ) {
            Button(t("action_delete"), role: .destructive, action: delete)
            Button(t("action_cancel"), role: .cancel) {}
        } message: {
            Text(t("delete_call_body"))
        }
    }
}

/// One line, clipped rather than wrapped.
struct OneLine: View {
    let text: String
    let style: TypeStyle
    let colour: Color

    init(_ text: String, style: TypeStyle, colour: Color) {
        self.text = text
        self.style = style
        self.colour = colour
    }

    var body: some View {
        Text(text).wise(style).foregroundStyle(colour).lineLimit(1).truncationMode(.tail)
    }
}
