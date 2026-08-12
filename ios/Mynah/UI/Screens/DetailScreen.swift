import SwiftUI

/// The one-tap verdict on the detail screen; the full form lives behind a link.
private struct VerdictChip: View {
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

/// A finished call: what it got, what it said, and what it cost.
struct DetailScreen: View {
    @ObservedObject var model: CallsViewModel
    let callId: String
    let onBack: () -> Void
    let onRedialled: (String) -> Void
    var onShare: () -> Void = {}
    var onFeedback: () -> Void = {}

    @State private var confirmingDelete = false

    var body: some View {
        Group {
            if let call = model.selected {
                content(call)
            } else {
                Spinner(colour: Ink.text, size: 26)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationBarBackButtonHidden()
        .onAppear { model.watch(callId) }
        .onDisappear { model.stopWatching() }
    }

    private func content(_ call: Call) -> some View {
        let presentation = call.presentation()
        let appIsChinese = (model.language.locale ?? Locale.current).language.languageCode?.identifier == "zh"
        let translate = appIsChinese != (call.language == "zh")

        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // Sharing only once there is a result to share — a call still on
                // the line has nothing to put on a card.
                HStack {
                    NavIcon(icon: Wise.arrowLeft, action: onBack)
                    Spacer()
                    if !call.isLive, call.outcome != nil {
                        NavIcon(icon: Wise.share, action: onShare, label: t("action_share"))
                    }
                }

                // The result leads, with the state beside it — the prototype's
                // wrap, so a long answer pushes the badge onto its own line
                // rather than squashing.
                Spacer().frame(height: 8)
                WrappingPair(spacing: 10) {
                    Text(call.headline())
                        .wise(Type.pushed)
                        .foregroundStyle(Ink.text)
                        .fixedSize(horizontal: false, vertical: true)
                } trailing: {
                    StatusBadge(presentation: presentation)
                }
                Spacer().frame(height: 4)
                Text("\(call.businessName) · \(call.phoneNumber)")
                    .wise(Type.caption)
                    .foregroundStyle(Ink.body)

                // The assistant asked for you and the call is still open.
                if presentation == .needsYou {
                    Spacer().frame(height: 16)
                    NeedsYouCard(
                        title: t("detail_needs_you"),
                        body_: t("subline_transfer"),
                        action: t("action_bridge_me"),
                        onAction: { model.takeOver(call.id) }
                    )
                }

                if !call.results.isEmpty {
                    Spacer().frame(height: 16)
                    WiseCard {
                        VStack(alignment: .leading, spacing: 10) {
                            SectionLabel(t("detail_outcome"))
                            let facts = call.results.sorted(by: { $0.key < $1.key })
                            ForEach(Array(facts.enumerated()), id: \.element.key) { index, fact in
                                HStack(alignment: .top, spacing: 16) {
                                    Text(fact.key.replacingOccurrences(of: "_", with: " ").capitalisedFirst)
                                        .wise(Type.body)
                                        .foregroundStyle(Ink.body)
                                    Text(fact.value)
                                        .wise(Type.value)
                                        .foregroundStyle(Ink.text)
                                        .multilineTextAlignment(.trailing)
                                        .frame(maxWidth: .infinity, alignment: .trailing)
                                }
                                if index != facts.count - 1 { Rule() }
                            }
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, 16)
                    }
                }

                if let summary = call.summary, summary.isNotBlank {
                    Spacer().frame(height: 10)
                    WiseCard {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionLabel(t("detail_summary"))
                            Text(summary)
                                .wise(Type.body)
                                .foregroundStyle(Ink.text)
                                .fixedSize(horizontal: false, vertical: true)
                            if translate, let translated = call.summaryTranslation, translated.isNotBlank {
                                Rule()
                                Text(translated)
                                    .wise(Type.caption)
                                    .foregroundStyle(Ink.body)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, 16)
                    }
                }

                // The recording row in the prototype; here the same shape
                // carries what the call actually cost, which is the number this
                // app can produce.
                Spacer().frame(height: 10)
                WiseCard {
                    HStack(spacing: 14) {
                        Icon(Wise.phone, size: 15)
                            .foregroundStyle(Ink.lime)
                            .frame(width: 38, height: 38)
                            .background(Ink.text, in: Circle())
                        VStack(alignment: .leading, spacing: 0) {
                            Text(t("detail_cost")).wise(Type.listItem).foregroundStyle(Ink.text)
                            // Says which part of the money bought nothing. Only
                            // when there was a queue — on a call that went
                            // straight through, a "0s queueing" line is noise.
                            if call.holdSeconds > 0 {
                                Text(t("detail_of_which_queued", durationLabel(call.holdSeconds)))
                                    .wise(Type.fine)
                                    .foregroundStyle(Ink.mute)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Text(call.cost.map(costLabel) ?? t("cost_calculating"))
                            .wise(Type.monoBody)
                            .foregroundStyle(call.cost != nil ? Ink.text : Ink.mute)
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 15)
                }

                // Asked once the call is over, and placed above the transcript
                // so it is not something you have to scroll past a conversation
                // to reach. One tap is the whole answer; the link is there for
                // anyone with more to say. Once answered it says thank you
                // rather than asking again.
                if !call.isLive {
                    Spacer().frame(height: 10)
                    WiseCard {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(t(call.feedback != nil ? "feedback_thanks" : "feedback_prompt"))
                                .wise(Type.listTitle)
                                .foregroundStyle(Ink.text)
                            HStack(spacing: 8) {
                                VerdictChip(
                                    label: t("feedback_good"),
                                    selected: call.feedback?.verdict == "good"
                                ) { model.sendFeedback(callId: call.id, verdict: "good") }
                                VerdictChip(
                                    label: t("feedback_bad"),
                                    selected: call.feedback?.verdict == "bad"
                                ) { model.sendFeedback(callId: call.id, verdict: "bad") }
                                Spacer(minLength: 8)
                                LinkText(t("feedback_detail"), style: Type.linkSmall, action: onFeedback)
                            }
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, 16)
                    }
                }

                if !call.transcript.isEmpty {
                    Spacer().frame(height: 20)
                    SectionLabel(t("detail_transcript")).padding(.leading, 6)
                    Spacer().frame(height: 8)
                    WiseCard {
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(call.transcript.enumerated()), id: \.element.at) { index, entry in
                                TranscriptLine(entry: entry, call: call, translate: translate)
                                if index != call.transcript.count - 1 { Rule(Ink.canvasSoft) }
                            }
                        }
                        .padding(.horizontal, 18)
                    }
                }

                if presentation == .noAnswer || presentation == .done {
                    Spacer().frame(height: 20)
                    OutlineButton(
                        label: t("action_redial_same"),
                        action: { model.redial(call) { id in onRedialled(id) } },
                        style: Type.buttonSmall,
                        leading: { Icon(Wise.rotate, size: 15) }
                    )
                }

                // Last, and quiet: this is the one thing on the screen that
                // cannot be undone, so it does not compete with the actions
                // above it. Only offered once the call is over — a record of a
                // conversation still happening is not one to delete.
                if !call.isLive {
                    Spacer().frame(height: 20)
                    Text(t("action_delete_call"))
                        .wise(Type.linkSmall)
                        .foregroundStyle(Ink.negativeDeep)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                        .onTapGesture { confirmingDelete = true }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 28)
        }
        .confirmsDeletingCall($confirmingDelete) {
            model.deleteCall(call.id, onDone: onBack)
        }
    }
}

private struct TranscriptLine: View {
    let entry: TranscriptEntry
    let call: Call
    let translate: Bool

    private var assistant: Bool { entry.speaker == Speaker.agent }

    private var who: String {
        switch entry.speaker {
        case Speaker.agent: t("speaker_assistant")
        case Speaker.caller: call.businessName.uppercased()
        case Speaker.owner: t("speaker_owner")
        default: t("speaker_system")
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(who)
                .wise(Type.speaker)
                .foregroundStyle(assistant ? Ink.positiveDeep : Ink.mute)
                .lineLimit(1)
            Text(entry.text)
                .wise(Type.body)
                .foregroundStyle(Ink.body)
                .fixedSize(horizontal: false, vertical: true)
            if translate, let translated = entry.translation, translated.isNotBlank {
                Text(translated)
                    .wise(Type.bubbleTranslation)
                    .foregroundStyle(Ink.mute)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 12)
    }
}

/// A headline with something small beside it, which drops to its own line when
/// the headline needs the width. Compose has `FlowRow`; this is the one place
/// the app needs it, so it is two children rather than a general layout.
struct WrappingPair<Leading: View, Trailing: View>: View {
    var spacing: CGFloat = 10
    @ViewBuilder var leading: Leading
    @ViewBuilder var trailing: Trailing

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .center, spacing: spacing) {
                leading
                trailing
            }
            VStack(alignment: .leading, spacing: 8) {
                leading
                trailing
            }
        }
    }
}
