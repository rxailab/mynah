import SwiftUI

/// Home: a board of work, in three states.
///
/// The first home was the composer — a blank box asking you to think of
/// something. The second was a feed, which answered "what has happened" when the
/// question people actually arrive with is "what is happening". This one is
/// sorted by state rather than by time: what is on a call now, what is waiting
/// for a person, what closed today. Everything older is one tap away under
/// History and does not compete for the top of the screen.
///
/// The bar at the foot carries the two destinations and, between them, the only
/// way to start a call — a button rather than a tab, because starting something
/// is not a place you navigate to and come back from.
struct HomeScreen: View {
    @ObservedObject var model: CallsViewModel
    let onOpenCall: (String) -> Void
    let onOpenDetail: (String) -> Void
    let onCompose: () -> Void
    let onSearch: () -> Void
    let onUsage: () -> Void
    let onSettings: () -> Void
    let onHistory: () -> Void

    /// Only ticks while something is actually on a call — the elapsed time on
    /// the live card is the one thing here that changes on its own.
    @State private var now = Int(Date().timeIntervalSince1970 * 1000)

    private var live: Call? { model.calls.first(where: \.isLive) }

    /// Everything on a line right now. Plural on purpose — two calls can be
    /// running at once, and the old single-card top slot quietly hid the second.
    private var running: [Call] { model.calls.filter(\.isLive) }

    private var needsYou: [Call] {
        model.calls.filter { $0.status == CallStatus.transferring }
    }

    /// Closed since midnight. Older than that belongs to History: this section
    /// answers "did the thing I asked for this morning land", and a week of
    /// results underneath it makes that harder to see, not easier.
    private var doneToday: [Call] {
        let midnight = Calendar.current.startOfDay(for: Date()).timeIntervalSince1970 * 1000
        return model.calls.filter {
            !$0.isLive && $0.status != CallStatus.transferring && Double($0.createdAt) >= midnight
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

            if offline {
                Offline {
                    model.clearError()
                    model.refresh()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                board
            }

            // Offline is the one case where the middle button really is dead:
            // composing starts by asking the server to read the request, so
            // there is nothing behind it to reach.
            TaskTabBar(
                selected: .tasks,
                onSelect: { if $0 == .history { onHistory() } },
                onCompose: { if !offline { onCompose() } },
                composeEnabled: !offline
            )
        }
        .task {
            model.refresh(quiet: true)
            model.loadProfile()
            model.loadUsage()
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
        HStack(alignment: .top, spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                Text(greeting).wise(Type.title).foregroundStyle(Ink.text)
                Text(summary).wise(Type.caption).foregroundStyle(Ink.mute)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            // What is left to spend, where the eye already is. It used to be
            // three screens away under Settings, which is where people looked
            // for it only after a call failed to go out.
            if model.usage.balance > 0 {
                Text(t("board_calls_left", model.usage.balance))
                    .wise(Type.chip)
                    .foregroundStyle(Ink.deep)
                    .padding(.horizontal, 11)
                    .padding(.vertical, 6)
                    .background(Ink.limePale, in: Capsule())
                    .contentShape(Capsule())
                    .onTapGesture(perform: onUsage)
            }

            IconCircle(icon: Wise.search, action: onSearch, size: 36, iconSize: 18)
                .accessibilityLabel(t("nav_search"))
            IconCircle(icon: Wise.gear, action: onSettings, size: 36)
                .accessibilityLabel(t("nav_settings"))
        }
        .padding(.leading, 20)
        .padding(.trailing, 12)
        .padding(.top, 12)
        .padding(.bottom, 4)
    }

    private var greeting: String {
        switch Calendar.current.component(.hour, from: Date()) {
        case ..<12: t("greeting_morning")
        case ..<18: t("greeting_afternoon")
        default: t("greeting_evening")
        }
    }

    /// The one line under the greeting. Says what is outstanding, or says
    /// plainly that nothing is — a screen that only ever describes activity
    /// leaves someone guessing whether an empty board means idle or broken.
    private var summary: String {
        var parts: [String] = []
        if !running.isEmpty { parts.append(t("board_summary_running", running.count)) }
        if !needsYou.isEmpty { parts.append(t("board_summary_needs_you", needsYou.count)) }
        return parts.isEmpty ? t("board_summary_idle") : parts.joined(separator: " · ")
    }

    private var board: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let error = model.error {
                    ErrorCard(message: error) { model.clearError() }
                    Spacer().frame(height: 14)
                }

                if running.isEmpty && needsYou.isEmpty && doneToday.isEmpty {
                    Spacer().frame(height: 24)
                    EmptyBoard()
                }

                section(t("board_needs_you"), needsYou.isEmpty) {
                    ForEach(needsYou) { call in
                        NeedsYouRow(
                            call: call,
                            onTakeOver: { model.takeOver(call.id) },
                            onOpen: { onOpenCall(call.id) }
                        )
                        Spacer().frame(height: 10)
                    }
                }

                section(t("board_running"), running.isEmpty) {
                    ForEach(running) { call in
                        RunningCard(call: call, now: now) { onOpenCall(call.id) }
                        Spacer().frame(height: 10)
                    }
                }

                if !doneToday.isEmpty {
                    HStack(alignment: .firstTextBaseline) {
                        Text(t("board_done_today"))
                            .wise(Type.labelSmall)
                            .foregroundStyle(Ink.mute)
                        Spacer()
                        Text(t("board_all_history"))
                            .wise(Type.chip)
                            .foregroundStyle(Ink.deep)
                            .contentShape(Rectangle())
                            .onTapGesture(perform: onHistory)
                    }
                    .padding(.top, 18)
                    .padding(.bottom, 8)

                    GroupedCard {
                        ForEach(doneToday) { call in
                            FeedRow(
                                dot: call.presentation().dot,
                                title: call.headline(),
                                subtitle: call.subline(),
                                onTap: { onOpenDetail(call.id) },
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
                }

                Spacer().frame(height: 24)
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
        }
        .refreshable { model.refresh(quiet: true) }
    }

    /// A labelled band, drawn only when it has something in it. An empty
    /// heading is a promise the screen does not keep.
    @ViewBuilder
    private func section<Content: View>(
        _ label: String,
        _ empty: Bool,
        @ViewBuilder content: () -> Content
    ) -> some View {
        if !empty {
            Text(label)
                .wise(Type.labelSmall)
                .foregroundStyle(Ink.mute)
                .padding(.top, 18)
                .padding(.bottom, 8)
            content()
        }
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

/// Nothing running, nothing waiting, nothing closed today.
///
/// Says what to do rather than only that there is nothing — an empty board on
/// first run looks identical to an empty board because something broke, and the
/// difference has to come from the words.
private struct EmptyBoard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(t("board_empty_title")).wise(Type.section).foregroundStyle(Ink.text)
            Text(t("board_empty_body"))
                .wise(Type.caption)
                .foregroundStyle(Ink.mute)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
