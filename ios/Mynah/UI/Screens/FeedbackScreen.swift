import SwiftUI

/// The label for each reason the server will accept.
private func labelFor(_ reason: String) -> String {
    switch reason {
    case FeedbackReason.wrongDetails: t("feedback_reason_wrong_details")
    case FeedbackReason.misheard: t("feedback_reason_misheard")
    case FeedbackReason.tooWordy: t("feedback_reason_too_wordy")
    case FeedbackReason.queuedTooLong: t("feedback_reason_queued_too_long")
    default: t("feedback_reason_other")
    }
}

/// What the person made of the call.
///
/// Three layers, each of which can be skipped: did it work, what went wrong, and
/// anything else. Only the first is required — a form that demands reasons gets
/// fewer verdicts, and the verdict is the part worth having.
///
/// The line at the foot is not decoration. "Feedback" on a screen about a phone
/// call to a real business could reasonably be read as a complaint going to that
/// business, or as a request to try again; it does neither, and says so.
struct FeedbackScreen: View {
    @ObservedObject var model: CallsViewModel
    let callId: String
    let onBack: () -> Void
    let onSent: () -> Void

    @State private var verdict = ""
    @State private var reasons: Set<String> = []
    @State private var note = ""
    @State private var sending = false
    @State private var seeded = false

    private var call: Call? { model.calls.first { $0.id == callId } }

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(t("feedback_title"), onBack: onBack)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if let call {
                        Text(call.businessName.isBlank ? call.phoneNumber : call.businessName)
                            .wise(Type.caption)
                            .foregroundStyle(Ink.body)
                        Spacer().frame(height: 12)
                    }

                    WiseCard {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(t("feedback_verdict_label").uppercased())
                                .wise(Type.labelSmall)
                                .foregroundStyle(Ink.mute)
                            Spacer().frame(height: 10)
                            HStack(spacing: 8) {
                                Choice(label: t("feedback_good"), selected: verdict == "good") {
                                    verdict = "good"
                                }
                                Choice(label: t("feedback_bad"), selected: verdict == "bad") {
                                    verdict = "bad"
                                }
                            }

                            Spacer().frame(height: 16)
                            Rule()
                            Spacer().frame(height: 16)

                            Text(t("feedback_reasons_label").uppercased())
                                .wise(Type.labelSmall)
                                .foregroundStyle(Ink.mute)
                            Spacer().frame(height: 10)
                            FlowLayout {
                                ForEach(FeedbackReason.all, id: \.self) { reason in
                                    Choice(label: labelFor(reason), selected: reasons.contains(reason)) {
                                        if reasons.contains(reason) {
                                            reasons.remove(reason)
                                        } else {
                                            reasons.insert(reason)
                                        }
                                    }
                                }
                            }

                            Spacer().frame(height: 16)
                            ZStack(alignment: .topLeading) {
                                if note.isEmpty {
                                    Text(t("feedback_note_hint"))
                                        .wise(Type.body)
                                        .foregroundStyle(Ink.mute)
                                        .padding(.top, 8)
                                        .padding(.leading, 5)
                                }
                                TextEditor(text: $note)
                                    .wise(Type.body)
                                    .foregroundStyle(Ink.text)
                                    .tint(Ink.text)
                                    .scrollContentBackground(.hidden)
                                    .frame(minHeight: 110)
                                    .onChange(of: note) { _, value in
                                        if value.count > 2000 { note = String(value.prefix(2000)) }
                                    }
                            }
                            .padding(.horizontal, 15)
                            .padding(.vertical, 14)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .strokeBorder(Ink.outline, lineWidth: 1)
                            )
                        }
                        .padding(18)
                    }

                    Spacer().frame(height: 12)
                    Text(t("feedback_note"))
                        .wise(Type.fine)
                        .foregroundStyle(Ink.mute)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 6)
                    Spacer().frame(height: 24)
                }
                .padding(.horizontal, 20)
                .padding(.top, 14)
            }
            .scrollDismissesKeyboard(.interactively)

            PrimaryButton(t("feedback_send"), enabled: !verdict.isEmpty && !sending) {
                sending = true
                model.sendFeedback(
                    callId: callId,
                    verdict: verdict,
                    reasons: Array(reasons),
                    note: note,
                    onDone: onSent
                )
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }
        .navigationBarBackButtonHidden()
        .onAppear {
            // Whatever was said last time, so a second visit corrects rather
            // than starts again.
            guard !seeded, let feedback = call?.feedback else { return }
            verdict = feedback.verdict
            reasons = Set(feedback.reasons)
            note = feedback.note
            seeded = true
        }
    }
}

/// The design's small pill: ink when chosen, hairline outline when not.
private struct Choice: View {
    let label: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Text(label)
            .wise(Type.chip)
            .lineLimit(1)
            .foregroundStyle(selected ? Ink.lime : Ink.text)
            .padding(.horizontal, 13)
            .padding(.vertical, 8)
            .background(selected ? Ink.text : Ink.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(selected ? .clear : Ink.hairline, lineWidth: 1)
            )
            .contentShape(Rectangle())
            .onTapGesture(perform: action)
    }
}
