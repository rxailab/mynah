import SwiftUI

/// Where the first-run tour points. Measured on the composer in screen
/// coordinates and handed up, because the overlay is drawn above everything and
/// so cannot live inside the screen it is describing.
///
/// `.zero` means "not on screen" — the mic is absent on a phone that cannot
/// transcribe the interface language, and a tour step pointing at nothing is
/// worse than one fewer step.
struct CoachTargets: Equatable {
    var composer: CGRect = .zero
    var mic: CGRect = .zero
    var action: CGRect = .zero
}

private struct CoachStep {
    let target: CGRect
    let corner: CGFloat
    let title: String
    let body: String
}

/// The three coach marks over the composer: say it in one sentence, hold to
/// speak, nothing dials until you confirm.
///
/// A 62% ink scrim with the target punched out of it and ringed in lime. The
/// hole is cut with a blend mode rather than by painting four rectangles around
/// the target: that would leave seams at the corners, and cannot round them.
struct HomeCoach: View {
    let targets: CoachTargets
    let onFinished: () -> Void

    @State private var index = 0

    private var steps: [CoachStep] {
        var steps: [CoachStep] = []
        if !targets.composer.isEmpty {
            steps.append(CoachStep(target: targets.composer, corner: 30,
                                   title: t("coach_title_1"), body: t("coach_body_1")))
        }
        if !targets.mic.isEmpty {
            steps.append(CoachStep(target: targets.mic, corner: targets.mic.height / 2,
                                   title: t("coach_title_2"), body: t("coach_body_2")))
        }
        if !targets.action.isEmpty {
            steps.append(CoachStep(target: targets.action, corner: 34,
                                   title: t("coach_title_3"), body: t("coach_body_3")))
        }
        return steps
    }

    var body: some View {
        // Nothing measured yet: the first frame of the composer has no bounds
        // to point at.
        if steps.isEmpty {
            EmptyView()
        } else {
            let step = steps[min(index, steps.count - 1)]
            let hole = step.target.insetBy(dx: -6, dy: -6)
            let last = index >= steps.count - 1

            GeometryReader { geometry in
                ZStack(alignment: .topLeading) {
                    Ink.text.opacity(0.62)
                        .ignoresSafeArea()
                        .compositingGroup()
                        .overlay(alignment: .topLeading) {
                            RoundedRectangle(cornerRadius: step.corner, style: .continuous)
                                .frame(width: hole.width, height: hole.height)
                                .position(x: hole.midX, y: hole.midY)
                                .blendMode(.destinationOut)
                                .ignoresSafeArea()
                        }
                        .compositingGroup()

                    // The ring, drawn after the hole so the punch cannot erase it.
                    RoundedRectangle(cornerRadius: step.corner, style: .continuous)
                        .strokeBorder(Ink.lime, lineWidth: 2.5)
                        .frame(width: hole.width, height: hole.height)
                        .position(x: hole.midX, y: hole.midY)
                        .ignoresSafeArea()

                    CoachCard(
                        hole: hole,
                        available: geometry.size.height,
                        index: index,
                        total: steps.count,
                        title: step.title,
                        body: step.body,
                        last: last,
                        onSkip: onFinished,
                        onNext: { if last { onFinished() } else { index += 1 } }
                    )
                }
                // Swallows everything: during the tour the screen underneath is
                // an illustration, not something to poke at.
                .contentShape(Rectangle())
                .onTapGesture {}
            }
            .ignoresSafeArea()
        }
    }
}

private struct CoachCard: View {
    let hole: CGRect
    let available: CGFloat
    let index: Int
    let total: Int
    let title: String
    let body_: String
    let last: Bool
    let onSkip: () -> Void
    let onNext: () -> Void

    init(
        hole: CGRect, available: CGFloat, index: Int, total: Int,
        title: String, body: String, last: Bool,
        onSkip: @escaping () -> Void, onNext: @escaping () -> Void
    ) {
        self.hole = hole
        self.available = available
        self.index = index
        self.total = total
        self.title = title
        self.body_ = body
        self.last = last
        self.onSkip = onSkip
        self.onNext = onNext
    }

    @State private var height: CGFloat = 0

    private let margin: CGFloat = 24
    private let gap: CGFloat = 20

    /// Below the hole when there is room under it, above when there is not —
    /// the card must never cover what it points at.
    private var offset: CGFloat {
        let below = hole.maxY + gap
        let fitsBelow = below + height <= available - margin
        return max(margin, fitsBelow ? below : hole.minY - gap - height)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(index + 1) / \(total)").wise(Type.labelSmall).foregroundStyle(Ink.mute)
            Spacer().frame(height: 6)
            Text(title).wise(Type.section).foregroundStyle(Ink.text)
            Spacer().frame(height: 6)
            Text(body_)
                .wise(Type.caption)
                .foregroundStyle(Ink.body)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 14)
            HStack(spacing: 0) {
                // The way out is only offered while there is something left to
                // skip.
                if !last {
                    LinkText(t("action_skip_tour"), style: Type.linkSmall, action: onSkip)
                }
                Spacer(minLength: 12)
                PrimaryButton(
                    t(last ? "action_got_it" : "action_next"),
                    height: 40,
                    style: Type.buttonSmall,
                    action: onNext
                )
                .fixedSize()
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Ink.card, in: cardShape)
        .background(
            GeometryReader { geometry in
                Color.clear.onAppear { height = geometry.size.height }
                    .onChange(of: geometry.size.height) { _, value in height = value }
            }
        )
        .padding(.horizontal, 24)
        .offset(y: offset)
    }
}
