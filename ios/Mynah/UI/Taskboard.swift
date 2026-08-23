import SwiftUI

// The pieces the taskboard home is built from. Kept together because they only
// mean anything next to each other: a ring that counts steps, a card that is
// dark because something is happening in it, and a bar whose middle button is
// the only way to start anything.

/// Steps done out of steps noted, drawn as a ring.
///
/// The count comes from the same list the assistant keeps with note_step during
/// the call, so this is the assistant's own account of how far it has got —
/// not a guess made from elapsed time.
struct StepRing: View {
    let done: Int
    let total: Int
    var size: CGFloat = 52

    private var fraction: Double {
        total > 0 ? min(1, Double(done) / Double(total)) : 0
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.white.opacity(0.15), lineWidth: 4)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(Ink.lime, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.35), value: fraction)
            Text(total > 0 ? "\(done)/\(total)" : "—")
                .wise(Type.mono)
                .foregroundStyle(.white)
        }
        .frame(width: size, height: size)
    }
}

/// Three bars that rise and fall while a call is connected.
///
/// Decoration with a job: it is the one thing on a still screen that says the
/// line is open right now, which is the difference between a card about a call
/// and a card about a call that is happening.
struct LiveBars: View {
    var colour: Color = Ink.lime
    @State private var up = false

    var body: some View {
        HStack(spacing: 2.5) {
            ForEach(0..<3, id: \.self) { i in
                Capsule()
                    .fill(colour)
                    .frame(width: 2.5, height: up ? 13 : 5)
                    .animation(
                        .easeInOut(duration: 0.45).repeatForever().delay(Double(i) * 0.13),
                        value: up
                    )
            }
        }
        .frame(height: 13)
        .onAppear { up = true }
    }
}

/// A call that is on the line now. Ink, because everything else on this screen
/// is white on sage and the eye has to land here first.
struct RunningCard: View {
    let call: Call
    let now: Int
    let onOpen: () -> Void

    private var doneSteps: Int { call.steps.filter(\.done).count }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                StepRing(done: doneSteps, total: call.steps.count)

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 7) {
                        Circle().fill(Ink.lime).frame(width: 6, height: 6)
                        Text("\(call.presentation().label) · \(elapsedOf(call, now: now))")
                            .wise(Type.labelSmall)
                            .foregroundStyle(Ink.lime)
                    }
                    Text(call.businessName)
                        .wise(Type.rowTitle)
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    // The step in flight, which is the honest answer to "what is
                    // it doing" — not the goal, which never changes.
                    Text(currentStep)
                        .wise(Type.rowSub)
                        .foregroundStyle(Ink.onDarkMute)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Icon(Wise.chevronRight, size: 16).foregroundStyle(Ink.onDarkMute)
            }

            HStack(spacing: 9) {
                LiveBars()
                Text(call.goal)
                    .wise(Type.rowSub)
                    .foregroundStyle(Ink.onDarkBody)
                    .lineLimit(1)
            }
            .padding(.horizontal, 11)
            .padding(.vertical, 9)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.06),
                        in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .padding(16)
        .background(Ink.text, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .contentShape(Rectangle())
        .onTapGesture(perform: onOpen)
    }

    private var currentStep: String {
        call.steps.first(where: { !$0.done })?.label ?? call.subline()
    }
}

/// A call waiting for a person, as the board draws it.
///
/// Distinct from ``NeedsYouCard`` in Components, which is the panel the call's
/// own screen shows: that one explains the situation at length to somebody who
/// has already opened the call. This one is a row in a list of several, so it
/// leads with which business is waiting and carries the action itself.
struct NeedsYouRow: View {
    let call: Call
    let onTakeOver: () -> Void
    let onOpen: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 8) {
                Circle().fill(Ink.warningDeep).frame(width: 7, height: 7)
                Text(t("headline_needs_you", call.businessName))
                    .wise(Type.rowTitle)
                    .foregroundStyle(Ink.warningInk)
                Spacer(minLength: 8)
                Text(formatClock(call.createdAt))
                    .wise(Type.mono)
                    .foregroundStyle(Ink.warningInk.opacity(0.7))
            }
            Text(t("subline_transfer"))
                .wise(Type.rowSub)
                .foregroundStyle(Ink.warningInk)
                .fixedSize(horizontal: false, vertical: true)

            Spacer().frame(height: 6)
            Button(action: onTakeOver) {
                Text(t("action_take_the_call"))
                    .wise(Type.buttonSmall)
                    .foregroundStyle(Ink.warning)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .background(Ink.warningInk,
                                in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 15)
        .background(Ink.warning, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .contentShape(Rectangle())
        .onTapGesture(perform: onOpen)
    }
}


/// The squash-and-stretch a tab icon does when it is tapped.
///
/// Six keyframes lifted from the design, with its timings and its curves: dip,
/// launch, land flat, rebound, settle. The numbers are in the icon's own 24-unit
/// grid — the same space the path data is written in — so ``lift`` is scaled to
/// whatever size the icon is finally drawn at rather than being a point value
/// that only looks right at one size.
///
/// The whole thing lasts 640ms and is anchored at the bottom, because a house
/// that squashes around its middle looks like it is being crushed rather than
/// landing on something.
private struct TapBounce: Equatable {
    var lift: CGFloat = 0
    var wide: CGFloat = 1
    var tall: CGFloat = 1
}

private extension View {
    /// - Parameter size: the drawn size of the icon, used to put the design's
    ///   24-grid offsets into points.
    func tapBounce(trigger: Int, size: CGFloat) -> some View {
        keyframeAnimator(initialValue: TapBounce(), trigger: trigger) { view, v in
            view
                .scaleEffect(x: v.wide, y: v.tall, anchor: .bottom)
                .offset(y: v.lift * size / 24)
        } keyframes: { _ in
            // CSS puts the easing on the keyframe that starts a segment; SwiftUI
            // puts it on the one that ends it. Every curve below is therefore
            // shifted one keyframe later than in the source.
            KeyframeTrack(\.lift) {
                LinearKeyframe(0.9, duration: 0.102, timingCurve: .bezier(
                    startControlPoint: UnitPoint(x: 0.55, y: 0), endControlPoint: UnitPoint(x: 0.7, y: 1)))
                LinearKeyframe(-4.4, duration: 0.179, timingCurve: .bezier(
                    startControlPoint: UnitPoint(x: 0.2, y: 0.7), endControlPoint: UnitPoint(x: 0.3, y: 1)))
                LinearKeyframe(0.5, duration: 0.115, timingCurve: .bezier(
                    startControlPoint: UnitPoint(x: 0.55, y: 0), endControlPoint: UnitPoint(x: 0.75, y: 1)))
                LinearKeyframe(-1.1, duration: 0.115, timingCurve: .bezier(
                    startControlPoint: UnitPoint(x: 0.2, y: 0.7), endControlPoint: UnitPoint(x: 0.3, y: 1)))
                LinearKeyframe(0, duration: 0.128, timingCurve: .easeOut)
            }
            KeyframeTrack(\.wide) {
                LinearKeyframe(1.13, duration: 0.102, timingCurve: .bezier(
                    startControlPoint: UnitPoint(x: 0.55, y: 0), endControlPoint: UnitPoint(x: 0.7, y: 1)))
                LinearKeyframe(0.93, duration: 0.179, timingCurve: .bezier(
                    startControlPoint: UnitPoint(x: 0.2, y: 0.7), endControlPoint: UnitPoint(x: 0.3, y: 1)))
                LinearKeyframe(1.11, duration: 0.115, timingCurve: .bezier(
                    startControlPoint: UnitPoint(x: 0.55, y: 0), endControlPoint: UnitPoint(x: 0.75, y: 1)))
                LinearKeyframe(0.99, duration: 0.115, timingCurve: .bezier(
                    startControlPoint: UnitPoint(x: 0.2, y: 0.7), endControlPoint: UnitPoint(x: 0.3, y: 1)))
                LinearKeyframe(1, duration: 0.128, timingCurve: .easeOut)
            }
            KeyframeTrack(\.tall) {
                LinearKeyframe(0.84, duration: 0.102, timingCurve: .bezier(
                    startControlPoint: UnitPoint(x: 0.55, y: 0), endControlPoint: UnitPoint(x: 0.7, y: 1)))
                LinearKeyframe(1.08, duration: 0.179, timingCurve: .bezier(
                    startControlPoint: UnitPoint(x: 0.2, y: 0.7), endControlPoint: UnitPoint(x: 0.3, y: 1)))
                LinearKeyframe(0.87, duration: 0.115, timingCurve: .bezier(
                    startControlPoint: UnitPoint(x: 0.55, y: 0), endControlPoint: UnitPoint(x: 0.75, y: 1)))
                LinearKeyframe(1.02, duration: 0.115, timingCurve: .bezier(
                    startControlPoint: UnitPoint(x: 0.2, y: 0.7), endControlPoint: UnitPoint(x: 0.3, y: 1)))
                LinearKeyframe(1, duration: 0.128, timingCurve: .easeOut)
            }
        }
    }
}

/// The bar at the foot: two destinations and, between them, the only way to
/// start a call. The middle is a button rather than a third tab because it does
/// not take you somewhere you can come back from — it begins something.
struct TaskTabBar: View {
    enum Tab { case tasks, history }

    let selected: Tab
    let onSelect: (Tab) -> Void
    let onCompose: () -> Void
    /// Greyed when the account cannot place calls yet; still tappable, because
    /// the route it opens is where the missing thing gets fixed.
    var composeEnabled = true

    /// One counter per tab, bumped on every tap. Re-tapping the tab you are
    /// already on replays it — the bounce answers the finger, it does not
    /// report that the screen changed.
    @State private var taps: [Tab: Int] = [:]

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            tab(.tasks, Wise.home, t("tab_tasks"))

            Button(action: onCompose) {
                Icon(Wise.plus, size: 22)
                    .foregroundStyle(composeEnabled ? Ink.onLime : Ink.mute)
                    .frame(width: 56, height: 56)
                    .background(composeEnabled ? Ink.lime : Ink.canvasSoft, in: Circle())
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity)

            tab(.history, Wise.clock, t("tab_history"))
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 4)
        .background(Ink.card)
    }

    private func tab(_ which: Tab, _ icon: VectorIcon, _ label: String) -> some View {
        let on = selected == which
        return Button {
            taps[which, default: 0] += 1
            onSelect(which)
        } label: {
            VStack(spacing: 4) {
                Icon(icon, size: 21)
                    .foregroundStyle(on ? Ink.text : Ink.mute)
                    .tapBounce(trigger: taps[which] ?? 0, size: 21)
                Text(label)
                    .wise(Type.fine)
                    .foregroundStyle(on ? Ink.text : Ink.mute)
            }
            // Both lines matter. maxWidth spreads the column across its share of
            // the bar, but layout is not hit testing: without a content shape the
            // only things that answer a finger are the glyph's own strokes and
            // the letters — so a tap inside the house outline, in the gap above
            // the label, or anywhere in the surrounding space lands on nothing.
            // 44 is the smallest target iOS considers reachable; the column's
            // natural height is about 39.
            .frame(maxWidth: .infinity, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
