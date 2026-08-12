import SwiftUI

/// What the assistant wants you to know.
///
/// Derived from the calls rather than stored: every notification the prototype
/// shows — started, finished, nobody answered, needs you — is a transition this
/// app can already see in the call list, so there is nothing here the server has
/// to remember on our behalf.
///
/// The one thing that genuinely needs storage is read state, and rather than
/// fake it this screen leaves it out: the hand-over banner stays at the top for
/// as long as the call is actually waiting, which is the only "unread" that
/// matters.
struct NotificationsScreen: View {
    @ObservedObject var model: CallsViewModel
    let onBack: () -> Void
    let onOpenCall: (String) -> Void
    let onOpenDetail: (String) -> Void

    @State private var now = Int(Date().timeIntervalSince1970 * 1000)

    private var waiting: [Call] { model.calls.filter { $0.status == CallStatus.transferring } }
    private var rest: [Call] { model.calls.filter { $0.status != CallStatus.transferring } }

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(t("nav_notifications"), onBack: onBack)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // A call holding the line for you is not a list item. It is
                    // the reason the app has a notification screen at all.
                    ForEach(waiting) { call in
                        HandoverBanner(call: call) { onOpenCall(call.id) }
                        Spacer().frame(height: 12)
                    }

                    if rest.isEmpty, waiting.isEmpty {
                        Text(t("notifs_empty")).wise(Type.caption).foregroundStyle(Ink.mute)
                    }

                    ForEach(days, id: \.day) { group in
                        GroupLabel(group.day)
                            .padding(.top, 6)
                            .padding(.bottom, 8)
                        GroupedCard {
                            ForEach(group.calls) { call in
                                FeedRow(
                                    dot: dot(for: call),
                                    title: headline(for: call),
                                    subtitle: call.summary?.nilIfBlank ?? call.goal,
                                    onTap: { call.isLive ? onOpenCall(call.id) : onOpenDetail(call.id) },
                                    pulsing: call.isLive,
                                    right: {
                                        Text(formatClock(call.endedAt ?? call.createdAt))
                                            .wise(Type.mono)
                                            .foregroundStyle(Ink.rim)
                                    }
                                )
                            }
                        }
                        Spacer().frame(height: 16)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 14)
                .padding(.bottom, 24)
            }
        }
        .navigationBarBackButtonHidden()
        .onAppear { model.refresh(quiet: true) }
    }

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

    private func dot(for call: Call) -> Color {
        if call.isLive { return Ink.lime }
        if call.status == CallStatus.failed || call.outcome == "failed" { return Ink.negative }
        if call.status == CallStatus.completed { return Ink.positive }
        return Ink.rim
    }

    private func headline(for call: Call) -> String {
        if call.isLive { return t("notifs_started", call.businessName) }
        if call.status == CallStatus.failed { return t("notifs_no_answer", call.businessName) }
        return t("notifs_finished", call.businessName)
    }
}

/// Amber, loud, and the only thing on the screen with a button in it.
private struct HandoverBanner: View {
    let call: Call
    let onOpen: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(Ink.warningDeep)
                .frame(width: 8, height: 8)
                .padding(.top, 6)
            VStack(alignment: .leading, spacing: 0) {
                Text(t("headline_needs_you", call.businessName))
                    .wise(Type.rowTitle)
                    .foregroundStyle(Ink.warningInk)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer().frame(height: 3)
                Text(t("subline_transfer"))
                    .wise(Type.rowSub)
                    .foregroundStyle(Ink.warningInk)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer().frame(height: 10)
                HStack(spacing: 7) {
                    Icon(Wise.phone, size: 13).foregroundStyle(Ink.warningInk)
                    Text(t("action_bridge_me")).wise(Type.chipStrong).foregroundStyle(Ink.warningInk)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(Ink.warningInk, lineWidth: 1.5)
                )
                .contentShape(Rectangle())
                .onTapGesture(perform: onOpen)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Ink.warning, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
