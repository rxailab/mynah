import SwiftUI

/// The chips across the top. One more than the feed's: history is where you go
/// looking for the one that failed.
private enum HistoryFilter: CaseIterable {
    case all, needsYou, done, noAnswer

    var label: String {
        switch self {
        case .all: t("filter_all")
        case .needsYou: t("status_needs_you")
        case .done: t("status_done")
        case .noAnswer: t("status_no_answer")
        }
    }

    func accepts(_ presentation: Presentation) -> Bool {
        switch self {
        case .all: true
        case .needsYou: presentation == .needsYou
        // Strictly the ones that got there. A call that rang out is not "done",
        // and it has its own chip now.
        case .done: presentation == .done
        case .noAnswer: presentation == .noAnswer
        }
    }
}

/// Everything the assistant has done, newest first, grouped by day.
///
/// A pushed screen in the redesign rather than a tab, so it opens with a back
/// arrow and a way into search. Each day carries its own count and cost, which
/// is the question this screen actually gets asked: not "what happened" — the
/// feed answers that — but "how much of this have I been doing".
struct HistoryScreen: View {
    @ObservedObject var model: CallsViewModel
    let onSearch: () -> Void
    let onOpen: (String, Bool) -> Void

    @State private var filter: HistoryFilter = .all
    /// Which row's confirmation is open. One at a time, and held by id so the
    /// dialog survives the list reordering under it.
    @State private var deleting: String?
    @State private var now = Int(Date().timeIntervalSince1970 * 1000)

    private var shown: [Call] { model.calls.filter { filter.accepts($0.presentation()) } }
    private var anyLive: Bool { model.calls.contains(where: \.isLive) }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 0) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(t("history_title")).wise(Type.title).foregroundStyle(Ink.text)
                    Text(t("history_this_month", model.usage.used))
                        .wise(Type.caption).foregroundStyle(Ink.mute)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                IconCircle(icon: Wise.search, action: onSearch, size: 36, iconSize: 18)
                    .accessibilityLabel(t("nav_search"))
            }
            .padding(.leading, 20)
            .padding(.trailing, 12)
            .padding(.top, 12)
            .padding(.bottom, 4)

            HStack(spacing: 8) {
                ForEach(Array(HistoryFilter.allCases.enumerated()), id: \.offset) { _, option in
                    StateChip(label: option.label, selected: option == filter) { filter = option }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.top, 12)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if let error = model.error {
                        ErrorCard(message: error) { model.clearError() }
                        Spacer().frame(height: 12)
                    }

                    if shown.isEmpty {
                        Spacer().frame(height: 30)
                        Text(t("history_empty")).wise(Type.section).foregroundStyle(Ink.text)
                        Spacer().frame(height: 6)
                        Text(t("history_empty_body"))
                            .wise(Type.caption)
                            .foregroundStyle(Ink.mute)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    ForEach(days, id: \.day) { group in
                        GroupLabel(group.day, trailing: dayTotals(group.calls))
                            .padding(.vertical, 8)
                        GroupedCard {
                            ForEach(group.calls) { call in
                                FeedRow(
                                    dot: call.presentation().dot,
                                    title: call.headline(),
                                    subtitle: call.subline(),
                                    onTap: { onOpen(call.id, call.isLive) },
                                    pulsing: call.isLive,
                                    right: {
                                        Text(call.isLive
                                             ? elapsedOf(call, now: now)
                                             : formatClock(call.endedAt ?? call.createdAt))
                                            .wise(Type.mono)
                                            .foregroundStyle(call.isLive ? Ink.deep : Ink.mute)
                                        if let cost = call.cost {
                                            Text(costLabel(cost)).wise(Type.mono).foregroundStyle(Ink.mute)
                                        }
                                    }
                                )
                                // Long press rather than a swipe: these rows sit
                                // in the design's own card, not a List, and a
                                // second swipe gesture here would be competing
                                // with the scroll and with the edge swipe back.
                                .contextMenu {
                                    if !call.isLive {
                                        Button(t("action_delete_call"), role: .destructive) {
                                            deleting = call.id
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .refreshable { model.refresh(quiet: true) }
        }
        .confirmsDeletingCall(
            Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })
        ) {
            if let id = deleting { model.deleteCall(id) }
            deleting = nil
        }
        .onAppear {
            model.refresh()
            model.loadUsage()
        }
        .task(id: anyLive) {
            while anyLive, !Task.isCancelled {
                now = Int(Date().timeIntervalSince1970 * 1000)
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                model.refresh(quiet: true)
            }
        }
    }

    private var days: [(day: String, calls: [Call])] {
        var order: [String] = []
        var grouped: [String: [Call]] = [:]
        for call in shown {
            let day = dayLabel(call.createdAt, now: now, language: model.language)
            if grouped[day] == nil { order.append(day) }
            grouped[day, default: []].append(call)
        }
        return order.map { ($0, grouped[$0] ?? []) }
    }

    /// "3 calls · £0.14" beside the day. Money only appears once something has
    /// been rated — a day that shows £0.00 because Twilio has not caught up yet
    /// would be telling a small lie every morning.
    private func dayTotals(_ calls: [Call]) -> String {
        let count = t("businesses_call_count", calls.count)
        let priced = calls.compactMap(\.cost)
        guard let first = priced.first else { return "· \(count)" }
        let total = priced.reduce(0.0) { $0 + (Double($1.price) ?? 0) }
        let symbol: String
        switch first.unit.uppercased() {
        case "GBP": symbol = "£"
        case "USD": symbol = "$"
        case "EUR": symbol = "€"
        default: symbol = ""
        }
        return "· \(count) · \(symbol)\(String(format: "%.2f", total))"
    }
}
