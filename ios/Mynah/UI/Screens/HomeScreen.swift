import SwiftUI

/// The three feed filters.
private enum FeedFilter: CaseIterable {
    case all, needsYou, done

    var label: String {
        switch self {
        case .all: t("filter_all")
        case .needsYou: t("status_needs_you")
        case .done: t("status_done")
        }
    }
}

/// Home: what the assistant has been doing.
///
/// The old home was the composer — you arrived at a blank box and were asked to
/// think of something. This one opens on the work instead: whatever is on a call
/// right now at the top, then everything else grouped by day. Composing has
/// moved behind the bar at the foot, which is where it belongs once the app has
/// any history to show.
///
/// There is no tab bar. Search, notifications and settings are top-bar icons,
/// and everything else is reached from a row.
struct HomeScreen: View {
    @ObservedObject var model: CallsViewModel
    let onOpenCall: (String) -> Void
    let onOpenDetail: (String) -> Void
    let onCompose: () -> Void
    let onSearch: () -> Void
    let onNotifications: () -> Void
    let onSettings: () -> Void
    let onHistory: () -> Void

    @State private var filter: FeedFilter = .all
    /// Only ticks while something is actually on a call — the elapsed time on
    /// the live card is the one thing here that changes on its own.
    @State private var now = Int(Date().timeIntervalSince1970 * 1000)

    private var live: Call? { model.calls.first(where: \.isLive) }

    /// The live call has its own card at the top, so it is not repeated in the
    /// list below it.
    private var rest: [Call] {
        model.calls.filter { $0.id != live?.id }.filter { call in
            switch filter {
            case .all: true
            case .needsYou: call.status == CallStatus.transferring
            case .done: call.status == CallStatus.completed
            }
        }
    }

    /// Nothing to show and no way to fetch any: the whole page says so rather
    /// than an error card floating above an empty feed. Only when there is
    /// genuinely nothing — with calls already in hand, the error card over real
    /// history is more useful than blanking the screen.
    private var offline: Bool { model.error != nil && model.calls.isEmpty && !model.loading }

    var body: some View {
        VStack(spacing: 0) {
            topBar

            ZStack(alignment: .bottom) {
                if offline {
                    Offline {
                        model.clearError()
                        model.refresh()
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    feed
                }

                // Still tappable when unverified — it leads to the composer,
                // which explains why and offers the way through. A dead bar
                // would leave someone staring at a hint with nothing to press.
                //
                // Offline is the one case where it really is dead: the
                // composer's first step is asking the server to read the
                // request, so there is nothing behind the bar to reach.
                ComposerBar(blocked: model.profile?.canCall == false) {
                    if !offline { onCompose() }
                }
                .opacity(offline ? 0.55 : 1)
            }
        }
        .task {
            model.refresh(quiet: true)
            model.loadProfile()
            CallWatch.shared.requestPermission()
        }
        .task(id: live?.id) {
            while live != nil, !Task.isCancelled {
                now = Int(Date().timeIntervalSince1970 * 1000)
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }
    }

    private var topBar: some View {
        HStack(spacing: 0) {
            HStack(spacing: 8) {
                Wordmark()
                Text(t("app_name")).wise(Type.wordmark).foregroundStyle(Ink.text)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            IconCircle(icon: Wise.search, action: onSearch, size: 38, iconSize: 19)
                .accessibilityLabel(t("nav_search"))
            IconCircle(
                icon: Wise.bell,
                action: onNotifications,
                size: 38,
                badge: model.calls.contains { $0.status == CallStatus.transferring }
            )
            .accessibilityLabel(t("nav_notifications"))
            IconCircle(icon: Wise.gear, action: onSettings, size: 38)
                .accessibilityLabel(t("nav_settings"))
        }
        .padding(.leading, 20)
        .padding(.trailing, 12)
        .padding(.top, 12)
    }

    private var feed: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let error = model.error {
                    ErrorCard(message: error) { model.clearError() }
                    Spacer().frame(height: 14)
                }

                if let live {
                    LiveCallCard(call: live, now: now) { onOpenCall(live.id) }
                    Spacer().frame(height: 18)
                }

                HStack(spacing: 8) {
                    ForEach(Array(FeedFilter.allCases.enumerated()), id: \.offset) { _, option in
                        StateChip(label: option.label, selected: filter == option) { filter = option }
                    }
                }
                Spacer().frame(height: 12)

                if rest.isEmpty {
                    EmptyFeed()
                } else {
                    // Grouped by the day they were placed, newest day first, in
                    // the order the server already returned them.
                    ForEach(days, id: \.day) { group in
                        GroupLabel(group.day)
                            .padding(.top, 4)
                            .padding(.bottom, 8)
                        GroupedCard {
                            ForEach(group.calls) { call in
                                FeedRow(
                                    dot: call.presentation().dot,
                                    title: call.headline(),
                                    subtitle: call.subline(),
                                    onTap: { call.isLive ? onOpenCall(call.id) : onOpenDetail(call.id) },
                                    pulsing: call.isLive,
                                    right: {
                                        Text(formatClock(call.endedAt ?? call.createdAt))
                                            .wise(Type.mono)
                                            .foregroundStyle(Ink.mute)
                                        if let cost = call.cost {
                                            Text(costLabel(cost)).wise(Type.mono).foregroundStyle(Ink.mute)
                                        }
                                    }
                                )
                            }
                        }
                        Spacer().frame(height: 16)
                    }

                    Text(t("feed_view_all"))
                        .wise(Type.chip)
                        .foregroundStyle(Ink.deep)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity)
                        .contentShape(Rectangle())
                        .onTapGesture(perform: onHistory)
                }

                // Room for the composer bar to float over without covering the
                // last row.
                Spacer().frame(height: 84)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
        }
        .refreshable { model.refresh(quiet: true) }
    }

    /// The feed's calls, in the order the server returned them, cut into days.
    private var days: [(day: String, calls: [Call])] {
        var order: [String] = []
        var grouped: [String: [Call]] = [:]
        for call in rest {
            let day = dayLabel(call.createdAt, now: now, language: model.language)
            if grouped[day] == nil { order.append(day) }
            grouped[day, default: []].append(call)
        }
        return order.map { ($0, grouped[$0] ?? []) }
    }
}

/// The three lime bars. Small enough to draw rather than ship as an asset.
private struct Wordmark: View {
    var body: some View {
        HStack(alignment: .center, spacing: 1) {
            ForEach([8.0, 16.0, 10.0], id: \.self) { height in
                Capsule().fill(Ink.lime).frame(width: 4, height: height)
            }
        }
    }
}

/// The call happening right now. Black, so it reads as the one live thing on a
/// page of finished ones, and tapping anywhere on it goes to the call.
private struct LiveCallCard: View {
    let call: Call
    let now: Int
    let onTap: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                PulsingDot(colour: Ink.lime, size: 7)
                Text(t("status_on_the_call")).wise(Type.labelSmall).foregroundStyle(Ink.lime)
                Spacer(minLength: 8)
                Text(elapsedOf(call, now: now)).wise(Type.monoBody).foregroundStyle(Ink.onDarkMute)
            }
            Spacer().frame(height: 10)
            Text(call.businessName.isBlank ? t("status_dialing_now") : call.businessName)
                .wise(Type.listTitle)
                .foregroundStyle(Ink.onDark)
                .lineLimit(1)
            Text(call.goal).wise(Type.rowSub).foregroundStyle(Ink.onDarkMute).lineLimit(1)
            Spacer().frame(height: 14)
            HStack(spacing: 0) {
                Waveform(barCount: 4, period: 0.9, stagger: 0.15).frame(height: 18)
                Spacer().frame(width: 10)
                Text(call.transcript.last?.text ?? "")
                    .wise(Type.rowSub)
                    .foregroundStyle(Ink.onDarkBody)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Spacer().frame(width: 8)
                Text(t("feed_enter_call")).wise(Type.chip).foregroundStyle(Ink.lime)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Ink.text, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
    }
}

/// The way to start a call, floating over the foot of the feed. The gradient
/// behind it fades the list out rather than cutting it, so it reads as the page
/// continuing underneath.
private struct ComposerBar: View {
    let blocked: Bool
    let onTap: () -> Void

    var body: some View {
        HStack(spacing: 11) {
            Text(t(blocked ? "feed_composer_blocked" : "feed_composer_hint"))
                .wise(Type.body)
                .foregroundStyle(blocked ? Ink.warningDeep : Ink.mute)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            Icon(blocked ? Wise.person : Wise.mic, size: 18)
                .foregroundStyle(blocked ? Ink.warningInk : Ink.onLime)
                .frame(width: 40, height: 40)
                .background(
                    blocked ? Ink.warning : Ink.lime,
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                )
        }
        .padding(.leading, 16)
        .padding(.trailing, 8)
        .padding(.vertical, 8)
        .background(Ink.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Ink.hairline, lineWidth: 1)
        )
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
        .padding(.horizontal, 16)
        .padding(.top, 20)
        .padding(.bottom, 14)
        .background(
            LinearGradient(
                colors: [.clear, Ink.canvas, Ink.canvas],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }
}

/// The whole page, when there is nothing to show and no way to fetch any.
///
/// Borrows the empty state's shape — grey ring, title, a line of explanation —
/// and adds the one thing an empty feed does not need: something to press. The
/// body says calls already running carry on, because that is the first worry of
/// anyone who loses signal while the assistant is mid-call, and it is true: the
/// call is between the server and the phone network, and this app is only
/// watching it.
private struct Offline: View {
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Icon(Wise.wifiOff, size: 22)
                .foregroundStyle(Ink.rim)
                .frame(width: 52, height: 52)
                .background(Ink.canvasSoft, in: Circle())
            Spacer().frame(height: 14)
            Text(t("offline_title")).wise(Type.section).foregroundStyle(Ink.text)
            Spacer().frame(height: 6)
            Text(t("offline_body"))
                .wise(Type.caption)
                .foregroundStyle(Ink.mute)
                .multilineTextAlignment(.center)
            Spacer().frame(height: 18)
            OutlineButton(
                label: t("action_retry"),
                action: onRetry,
                height: 46,
                style: Type.buttonSmall,
                leading: { Icon(Wise.rotate, size: 15) }
            )
            .fixedSize()
        }
        .padding(.horizontal, 40)
    }
}

private struct EmptyFeed: View {
    var body: some View {
        VStack(spacing: 0) {
            Icon(Wise.phone, size: 22)
                .foregroundStyle(Ink.rim)
                .frame(width: 52, height: 52)
                .background(Ink.canvasSoft, in: Circle())
            Spacer().frame(height: 14)
            Text(t("feed_empty_title")).wise(Type.section).foregroundStyle(Ink.text)
            Spacer().frame(height: 6)
            Text(t("feed_empty_body"))
                .wise(Type.caption)
                .foregroundStyle(Ink.mute)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 40)
    }
}
