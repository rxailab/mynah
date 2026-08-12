import SwiftUI

private let faq = [
    ("faq_q_guessing", "faq_a_guessing"),
    ("faq_q_caller_id", "faq_a_caller_id"),
    ("faq_q_recordings", "faq_a_recordings"),
    ("faq_q_handover", "faq_a_handover"),
    ("faq_q_cost", "faq_a_cost"),
]

/// The five questions the app raises by existing.
///
/// Answered here rather than linked out: every one of them is about what the
/// assistant will and will not do on a live call, and someone asking has a phone
/// in their hand, not a browser.
struct HelpScreen: View {
    let onBack: () -> Void
    let onContact: () -> Void

    /// One open at a time, the first by default — the answer to "does it make
    /// things up" is the one worth putting in front of everybody.
    @State private var open = 0

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(t("help_title"), onBack: onBack)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    GroupedCard {
                        ForEach(Array(faq.enumerated()), id: \.offset) { index, entry in
                            VStack(alignment: .leading, spacing: 0) {
                                HStack(spacing: 10) {
                                    Text(t(entry.0))
                                        .wise(Type.rowTitle)
                                        .foregroundStyle(Ink.text)
                                        .fixedSize(horizontal: false, vertical: true)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    Icon(Wise.chevronRight, size: 14)
                                        .foregroundStyle(Ink.mute)
                                        .rotationEffect(.degrees(open == index ? 90 : 0))
                                }
                                if open == index {
                                    Spacer().frame(height: 8)
                                    Text(t(entry.1))
                                        .wise(Type.caption)
                                        .foregroundStyle(Ink.body)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                withAnimation(.easeOut(duration: 0.18)) {
                                    open = open == index ? -1 : index
                                }
                            }
                        }
                    }

                    Spacer().frame(height: 14)
                    WiseCard(radius: 16) {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 0) {
                                Text(t("help_contact_title")).wise(Type.rowTitle).foregroundStyle(Ink.text)
                                Text(t("help_contact_body"))
                                    .wise(Type.rowSub)
                                    .foregroundStyle(Ink.mute)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Text(t("help_contact_action"))
                                .wise(Type.chip)
                                .foregroundStyle(Ink.deep)
                                .contentShape(Rectangle())
                                .onTapGesture(perform: onContact)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 14)
                .padding(.bottom, 24)
            }
        }
        .navigationBarBackButtonHidden()
    }
}
