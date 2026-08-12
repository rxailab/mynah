import SwiftUI

/// Search across everything the assistant has done.
///
/// Entirely local: the call list is already on the device, and it is small
/// enough that filtering it here is both instant and one fewer endpoint to get
/// wrong. What is searched is what a person would remember — who was called,
/// what was asked for, and what came back — rather than the full transcript,
/// which would match half the list on any common word.
struct SearchScreen: View {
    @ObservedObject var model: CallsViewModel
    let onBack: () -> Void
    let onOpenCall: (String) -> Void
    let onOpenDetail: (String) -> Void

    @State private var query = ""
    @FocusState private var focused: Bool

    private var needle: String { query.trimmed }
    private var results: [Call] {
        needle.isBlank ? [] : model.calls.filter { $0.matches(needle) }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                IconCircle(icon: Wise.arrowLeft, action: onBack)
                    .accessibilityLabel(t("action_back"))
                HStack(spacing: 9) {
                    Icon(Wise.search, size: 16).foregroundStyle(Ink.mute)
                    WiseTextField(
                        placeholder: t("search_hint"),
                        text: $query,
                        style: Type.sub,
                        submitLabel: .search,
                        onSubmit: { model.rememberSearch(needle) }
                    )
                    .focused($focused)
                }
                .padding(.horizontal, 13)
                .padding(.vertical, 10)
                .wiseField()
            }
            .padding(.leading, 12)
            .padding(.trailing, 20)
            .padding(.top, 10)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if needle.isNotBlank {
                        GroupLabel(t("search_results", results.count)).padding(.bottom, 8)
                        if results.isEmpty {
                            Text(t("search_none")).wise(Type.caption).foregroundStyle(Ink.mute)
                        } else {
                            GroupedCard {
                                ForEach(results) { call in
                                    FeedRow(
                                        dot: dot(for: call),
                                        title: call.summary?.nilIfBlank ?? call.goal,
                                        subtitle: call.businessName,
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
                        }
                        Spacer().frame(height: 20)
                    }

                    if !model.recentSearches.isEmpty {
                        GroupLabel(t("search_recent")).padding(.bottom, 8)
                        FlowLayout(spacing: 7, lineSpacing: 7) {
                            ForEach(model.recentSearches, id: \.self) { term in
                                OutlineChip(label: term) { query = term }
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 14)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .navigationBarBackButtonHidden()
        .onAppear {
            model.refresh(quiet: true)
            focused = true
        }
    }

    private func dot(for call: Call) -> Color {
        if call.isLive { return Ink.lime }
        return call.status == CallStatus.failed ? Ink.negative : Ink.positive
    }
}

extension Call {
    /// The fields worth matching on. Deliberately not the transcript: searching
    /// every spoken word turns "the" into a hit on everything, and the useful
    /// memory of a call is who it was to and how it came out.
    func matches(_ needle: String) -> Bool {
        let query = needle.lowercased()
        return businessName.lowercased().contains(query)
            || goal.lowercased().contains(query)
            || phoneNumber.contains(query)
            || (summary ?? "").lowercased().contains(query)
            || results.values.contains { $0.lowercased().contains(query) }
    }
}
