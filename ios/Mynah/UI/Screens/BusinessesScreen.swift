import SwiftUI

/// A place that has been called, and how often.
private struct Business: Identifiable {
    let name: String
    let number: String
    let calls: Int
    let lastAt: Int
    let lastGoal: String

    var id: String { number }
}

/// The places you call.
///
/// Nothing is saved to build this — it is the call history grouped by number.
/// That matches what the design promises ("numbers you have called end up here")
/// and means there is no second list to keep in step with the first, and nothing
/// to clean up when an account is deleted.
///
/// Picking one seeds the composer with what was asked for last time, which is
/// usually most of what you want to ask for again.
struct BusinessesScreen: View {
    @ObservedObject var model: CallsViewModel
    let onBack: () -> Void
    let onCompose: () -> Void

    @State private var now = Int(Date().timeIntervalSince1970 * 1000)

    private var businesses: [Business] {
        Dictionary(grouping: model.calls.filter { $0.phoneNumber.isNotBlank }, by: \.phoneNumber)
            .compactMap { number, calls -> Business? in
                guard let newest = calls.max(by: { $0.createdAt < $1.createdAt }) else { return nil }
                return Business(
                    // The most recent name wins: businesses get renamed in the
                    // brief more often than they change number.
                    name: newest.businessName.isBlank ? number : newest.businessName,
                    number: number,
                    calls: calls.count,
                    lastAt: newest.createdAt,
                    lastGoal: newest.goal
                )
            }
            .sorted { $0.lastAt > $1.lastAt }
    }

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(t("businesses_title"), onBack: onBack)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(t("businesses_intro"))
                        .wise(Type.caption)
                        .foregroundStyle(Ink.body)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer().frame(height: 12)

                    if businesses.isEmpty {
                        Text(t("businesses_empty"))
                            .wise(Type.caption)
                            .foregroundStyle(Ink.mute)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        GroupedCard {
                            ForEach(businesses) { business in
                                row(business)
                            }
                        }
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

    private func row(_ business: Business) -> some View {
        HStack(spacing: 0) {
            Text(business.name.trimmed.prefix(1).uppercased())
                .wise(Type.listTitle)
                .foregroundStyle(Ink.deep)
                .frame(width: 38, height: 38)
                .background(Ink.limePale, in: Circle())
            Spacer().frame(width: 13)
            VStack(alignment: .leading, spacing: 0) {
                Text(business.name).wise(Type.rowTitle).foregroundStyle(Ink.text).lineLimit(1)
                Text(business.number).wise(Type.mono).foregroundStyle(Ink.mute)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Spacer().frame(width: 10)
            VStack(alignment: .trailing, spacing: 0) {
                Text(t("businesses_call_count", business.calls))
                    .wise(Type.tiny)
                    .foregroundStyle(Ink.mute)
                Text(dayLabel(business.lastAt, now: now, language: model.language))
                    .wise(Type.tiny)
                    .foregroundStyle(Ink.rim)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .contentShape(Rectangle())
        .onTapGesture {
            model.seedComposer(business.lastGoal)
            onCompose()
        }
    }
}
