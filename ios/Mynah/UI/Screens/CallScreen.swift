import SwiftUI

/// The call as it happens. This is the one screen the design takes into the
/// dark: near-black canvas, lime for whatever the assistant says, and the two
/// things you can do about it sitting side by side at the bottom.
struct CallScreen: View {
    @ObservedObject var model: CallsViewModel
    let callId: String
    let onFinished: (String) -> Void
    let onClose: () -> Void

    @State private var now = Int(Date().timeIntervalSince1970 * 1000)

    private var call: Call? { model.selected }

    var body: some View {
        ZStack {
            Ink.text.ignoresSafeArea()

            if let call {
                content(call)

                if call.status == CallStatus.transferring {
                    TakeoverDialog { model.hangUp(call.id) }
                }

                if !call.isLive {
                    ResultSheet(
                        call: call,
                        onViewRecord: { onFinished(call.id) },
                        onDone: onClose
                    )
                }
            } else {
                Spinner(colour: Ink.lime, size: 26)
            }
        }
        // The result sheet is white, so the bars only flip while the dark screen
        // is the thing being looked at.
        .toolbarColorScheme(call?.isLive == false ? .light : .dark, for: .navigationBar)
        .statusBarHidden(false)
        .preferredColorScheme(call == nil || call?.isLive == true ? .dark : .light)
        .navigationBarBackButtonHidden()
        .onAppear { model.watch(callId) }
        .onDisappear { model.stopWatching() }
        .task(id: call?.isLive) {
            while call?.isLive == true, !Task.isCancelled {
                now = Int(Date().timeIntervalSince1970 * 1000)
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }
    }

    private func content(_ call: Call) -> some View {
        let dialling = call.status == CallStatus.queued || call.status == CallStatus.dialing

        return VStack(spacing: 0) {
            LiveHeader(call: call, now: now)

            if dialling {
                Ringing(call: call)
            } else {
                Conversation(call: call, language: model.language)
            }

            if !dialling {
                Spacer().frame(height: 12)
                InterjectBar { text in model.sendNote(callId: call.id, text: text) }
            }

            Spacer().frame(height: 14)
            HStack(spacing: 10) {
                if !dialling {
                    DarkButton(label: t("action_take_over")) { model.takeOver(call.id) }
                }
                PrimaryButton(
                    t("action_hangup"),
                    height: 50,
                    container: Ink.negative,
                    content: Ink.onDark,
                    style: Type.buttonSmall
                ) {
                    model.hangUp(call.id)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .padding(.bottom, 20)
    }
}

/// Who is being called, and the status capsule that says where the call is up to.
private struct LiveHeader: View {
    let call: Call
    let now: Int

    private var connecting: Bool {
        call.status == CallStatus.queued || call.status == CallStatus.dialing
    }

    private var holding: Bool { call.onHold && call.isLive }

    private var status: String {
        switch call.status {
        case CallStatus.queued: return t("status_dialing_now")
        case CallStatus.dialing: return t("status_ringing")
        case CallStatus.transferring: return t("status_needs_you")
        default:
            // Said in the main capsule rather than only in the amber strip
            // below, because a silent transcript and "On the call" together read
            // as a stall — which is the one thing this is not.
            return holding ? t("status_on_hold") : t("status_on_the_call")
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            Text(call.businessName)
                .wise(Type.amount)
                .foregroundStyle(Ink.onDark)
                .lineLimit(1)
                .multilineTextAlignment(.center)
            Spacer().frame(height: 2)
            Text(call.phoneNumber).wise(Type.monoBody).foregroundStyle(Ink.onDarkMute)
            Spacer().frame(height: 12)
            HStack(spacing: 7) {
                PulsingDot(colour: connecting || holding ? Ink.warning : Ink.lime, size: 7)
                Text(status).wise(Type.chip).foregroundStyle(Ink.onDark)
                Text(elapsedOf(call, now: now)).wise(Type.monoBody).foregroundStyle(Ink.onDarkMute)
            }
            .padding(.horizontal, 15)
            .padding(.vertical, 7)
            .background(Ink.onDarkWash, in: Capsule())

            if holding {
                Spacer().frame(height: 10)
                HoldStrip(call: call, now: now)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

/// The queue, given its own strip rather than a word in the capsule above.
///
/// It carries the one number that decides anything — how long this has been
/// waiting, ticking locally between server pushes — and says out loud that the
/// meter is running, because the honest answer to a long queue is often to hang
/// up, and nothing else on this screen would tell them that.
private struct HoldStrip: View {
    let call: Call
    let now: Int

    var body: some View {
        VStack(spacing: 5) {
            HStack(spacing: 9) {
                Text(t("hold_queueing").uppercased())
                    .wise(Type.labelSmall)
                    .foregroundStyle(Ink.warning)
                Text(holdElapsedOf(call, now: now)).wise(Type.monoBody).foregroundStyle(Ink.onDark)
            }
            Text(t("hold_note"))
                .wise(Type.fine)
                .foregroundStyle(Ink.onDarkMute)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Ink.warning.opacity(0.16), in: cardShape)
    }
}

/// Nobody has picked up yet: the callee's initial, with rings going out.
private struct Ringing: View {
    let call: Call

    private var initial: String {
        let first = call.businessName.trimmed.prefix(1).uppercased()
        return first.isEmpty ? "?" : first
    }

    var body: some View {
        VStack(spacing: 20) {
            ZStack {
                PulseRings(colour: Ink.lime).frame(width: 126, height: 126)
                Text(initial)
                    .wise(Type.title)
                    .foregroundStyle(Ink.lime)
                    .frame(width: 96, height: 96)
                    .background(Ink.onDarkWash, in: Circle())
            }
            .frame(width: 126, height: 126)
            Text(t("transcript_waiting"))
                .wise(Type.body)
                .foregroundStyle(Ink.onDarkMute)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// The checklist and the conversation, which is most of the screen.
private struct Conversation: View {
    let call: Call
    let language: Language

    var body: some View {
        VStack(spacing: 0) {
            if !call.steps.isEmpty {
                Spacer().frame(height: 16)
                VStack(alignment: .leading, spacing: 0) {
                    Text(t("call_goals").uppercased())
                        .wise(Type.labelSmall)
                        .foregroundStyle(Ink.onDarkMute)
                    Spacer().frame(height: 11)
                    VStack(alignment: .leading, spacing: 9) {
                        ForEach(Array(call.steps.enumerated()), id: \.offset) { index, step in
                            // The first step not yet done is the one being
                            // worked on.
                            ChecklistRow(
                                step: step,
                                active: !step.done && call.steps.prefix(index).allSatisfy(\.done)
                            )
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 18)
                .padding(.vertical, 16)
                .background(Ink.onDarkWash, in: cardShape)
            }

            Transcript(call: call, language: language)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct ChecklistRow: View {
    let step: Step
    let active: Bool

    var body: some View {
        HStack(spacing: 11) {
            ZStack {
                if step.done {
                    Circle().fill(Ink.lime)
                    Icon(Wise.check, size: 11).foregroundStyle(Ink.onLime)
                } else if active {
                    Circle().strokeBorder(Ink.lime, lineWidth: 1.5)
                    PulsingDot(colour: Ink.lime, size: 8)
                } else {
                    Circle().strokeBorder(Ink.onDarkRim, lineWidth: 1.5)
                }
            }
            .frame(width: 20, height: 20)

            Text(step.label)
                .wise(active ? Type.value : Type.body)
                .foregroundStyle(active ? Ink.onDark : Ink.onDarkMute)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct Transcript: View {
    let call: Call
    let language: Language

    /// The line in the other language is only worth room when the app is being
    /// read in a different one from the one being spoken.
    private var translate: Bool {
        let appIsChinese = (language.locale ?? Locale.current).language.languageCode?.identifier == "zh"
        return appIsChinese != (call.language == "zh")
    }

    var body: some View {
        if call.transcript.isEmpty {
            Text(t("transcript_waiting"))
                .wise(Type.body)
                .foregroundStyle(Ink.onDarkMute)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(call.transcript, id: \.at) { entry in
                            Bubble(entry: entry, call: call, translate: translate).id(entry.at)
                        }
                    }
                    .padding(.top, 16)
                }
                .onChange(of: call.transcript.count) { _, _ in
                    guard let last = call.transcript.last else { return }
                    withAnimation { proxy.scrollTo(last.at, anchor: .bottom) }
                }
            }
        }
    }
}

/// Lime on the right is the assistant, charcoal on the left is the other party —
/// the design's own pairing. Facts you type in are neither: they were never
/// spoken aloud, so they sit centred in a plain capsule.
private struct Bubble: View {
    let entry: TranscriptEntry
    let call: Call
    let translate: Bool

    private var translated: String? {
        guard translate, let translation = entry.translation, translation.isNotBlank else { return nil }
        return translation
    }

    private var assistant: Bool { entry.speaker == Speaker.agent }

    private var who: String {
        switch entry.speaker {
        case Speaker.agent: t("speaker_assistant")
        case Speaker.caller: call.businessName.uppercased()
        default: t("speaker_system")
        }
    }

    var body: some View {
        if entry.speaker == Speaker.owner {
            HStack(spacing: 7) {
                Icon(Wise.arrowUp, size: 11).foregroundStyle(Ink.lime)
                Text("\(t("bubble_noted")): \(entry.text)")
                    .wise(Type.fine)
                    .foregroundStyle(Ink.onDark)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(Ink.onDarkWash, in: Capsule())
            .frame(maxWidth: .infinity)
        } else {
            VStack(alignment: assistant ? .trailing : .leading, spacing: 3) {
                Text(who)
                    .wise(Type.speaker)
                    .foregroundStyle(Ink.onDarkMute)
                    .lineLimit(1)
                    .padding(.horizontal, 8)
                VStack(alignment: .leading, spacing: 5) {
                    Text(entry.text)
                        .wise(Type.bubble)
                        .foregroundStyle(assistant ? Ink.onLime : Ink.onDark)
                        .fixedSize(horizontal: false, vertical: true)
                    if let translated {
                        Rule(assistant ? Ink.onLime.opacity(0.15) : Ink.onDarkRim)
                        Text(translated)
                            .wise(Type.bubbleTranslation)
                            .foregroundStyle(assistant ? Ink.deep : Ink.onDarkMute)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.horizontal, 15)
                .padding(.vertical, 11)
                .frame(maxWidth: 300, alignment: .leading)
                .background(
                    assistant ? Ink.lime : Ink.onDarkBubble,
                    in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                )
            }
            .frame(maxWidth: .infinity, alignment: assistant ? .trailing : .leading)
        }
    }
}

/// Type a fact; the assistant weaves it into what it says next.
private struct InterjectBar: View {
    let onSend: (String) -> Void

    @State private var draft = ""

    private var canSend: Bool { draft.isNotBlank }

    var body: some View {
        HStack(spacing: 8) {
            WiseTextField(
                placeholder: t("interject_placeholder"),
                text: $draft,
                style: Type.caption,
                submitLabel: .send,
                onSubmit: send
            )
            .foregroundStyle(Ink.onDark)
            .tint(Ink.lime)
            .frame(maxWidth: .infinity)

            Icon(Wise.arrowUp, size: 16)
                .foregroundStyle(canSend ? Ink.onLime : Ink.onDarkMute)
                .frame(width: 38, height: 38)
                .background(canSend ? Ink.lime : Ink.onDarkWash, in: Circle())
                .contentShape(Circle())
                .onTapGesture(perform: send)
                .accessibilityLabel(t("coach_send"))
        }
        .padding(.leading, 18)
        .padding(.trailing, 5)
        .padding(.vertical, 5)
        .background(Ink.onDarkWash, in: Capsule())
        // The placeholder inside the pill has to read on ink, not on paper.
        .environment(\.colorScheme, .dark)
    }

    private func send() {
        guard canSend else { return }
        onSend(draft)
        draft = ""
    }
}

/// The secondary action on the dark screen: an outline in white, not ink.
private struct DarkButton: View {
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .wise(Type.buttonSmall)
                .foregroundStyle(Ink.onDark)
                .lineLimit(1)
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .overlay(buttonShape.strokeBorder(Ink.onDarkRim, lineWidth: 1))
        }
        .buttonStyle(Pressable())
    }
}

/// The assistant has handed over: your phone is ringing.
private struct TakeoverDialog: View {
    let onHangUp: () -> Void

    var body: some View {
        ZStack {
            Ink.text.opacity(0.72).ignoresSafeArea()
            WiseCard {
                VStack(alignment: .leading, spacing: 0) {
                    Text(t("takeover_calling")).wise(Type.section).foregroundStyle(Ink.text)
                    Spacer().frame(height: 8)
                    Text(t("takeover_calling_sub"))
                        .wise(Type.caption)
                        .foregroundStyle(Ink.body)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer().frame(height: 18)
                    HStack {
                        Spinner(colour: Ink.text, size: 20)
                        Spacer()
                        LinkText(t("action_hangup"), colour: Ink.negative, action: onHangUp)
                    }
                }
                .padding(.horizontal, 22)
                .padding(.vertical, 24)
            }
            .padding(28)
        }
        .contentShape(Rectangle())
        .onTapGesture {}
    }
}

/// The call is over. The design gives the result its own white screen: a lime
/// disc, the answer in one heavy line, the details in a sage card underneath.
private struct ResultSheet: View {
    let call: Call
    let onViewRecord: () -> Void
    let onDone: () -> Void

    private var failed: Bool { call.status == CallStatus.failed }

    /// What was agreed, and what it cost, in one card.
    private var hasCard: Bool { !call.results.isEmpty || call.cost != nil || call.holdSeconds > 0 }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                Icon(failed ? Wise.close : Wise.check, size: failed ? 24 : 28)
                    .foregroundStyle(failed ? Ink.onDark : Ink.onLime)
                    .frame(width: 62, height: 62)
                    .background(failed ? Ink.negative : Ink.lime, in: Circle())
                Spacer().frame(height: 18)
                Text(call.summary ?? call.error ?? call.goal)
                    .wise(Type.result)
                    .foregroundStyle(Ink.text)
                    .multilineTextAlignment(.center)
                Spacer().frame(height: 8)
                Text(call.businessName)
                    .wise(Type.body)
                    .foregroundStyle(Ink.body)
                    .multilineTextAlignment(.center)

                // The cost belongs with the facts rather than in a footnote: it
                // is the last line of the same answer, and the design puts it
                // there.
                if hasCard {
                    Spacer().frame(height: 26)
                    WiseCard(fill: Ink.canvasSoft, radius: 16) {
                        ForEach(call.results.sorted(by: { $0.key < $1.key }), id: \.key) { key, value in
                            ResultRow(
                                label: key.replacingOccurrences(of: "_", with: " ").capitalisedFirst,
                                value: value
                            )
                            Rule(Ink.hairline)
                        }
                        // Queue time earns its own line rather than hiding inside
                        // the duration: it is the part of the bill that bought
                        // nothing, and seeing it is what makes redialling at a
                        // quieter hour an obvious thing to do.
                        if call.holdSeconds > 0 {
                            ResultRow(
                                label: t("detail_queued"),
                                value: durationLabel(call.holdSeconds),
                                mono: true
                            )
                            if call.cost != nil { Rule(Ink.hairline) }
                        }
                        if let cost = call.cost {
                            ResultRow(
                                label: t("detail_cost"),
                                value: "\(durationLabel(cost.durationSeconds)) · \(costLabel(cost))",
                                mono: true
                            )
                        }
                    }
                }

                // Twilio rates a call minutes after it ends, so the money is
                // genuinely not known yet — say so rather than showing a figure
                // that will change.
                if call.cost == nil {
                    Spacer().frame(height: 14)
                    Text(t("cost_pending"))
                        .wise(Type.fine)
                        .foregroundStyle(Ink.mute)
                        .multilineTextAlignment(.center)
                }

                Spacer().frame(height: 28)
                OutlineButton(t("action_view_record"), action: onViewRecord)
                Spacer().frame(height: 10)
                PrimaryButton(t("action_finish"), action: onDone)
            }
            .padding(.horizontal, 28)
            .padding(.top, 52)
            .padding(.bottom, 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Ink.card)
    }
}

/// One agreed fact, label left and value right, as the result card lists them.
private struct ResultRow: View {
    let label: String
    let value: String
    var mono = false

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            Text(label).wise(Type.sub).foregroundStyle(Ink.body)
            Text(value)
                .wise(mono ? Type.monoBody : Type.value)
                .foregroundStyle(Ink.text)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
    }
}

extension String {
    /// "table_time" -> "Table time". Only the first letter, so a name in the
    /// middle of a label keeps whatever case the server gave it.
    var capitalisedFirst: String {
        guard let first else { return self }
        return first.uppercased() + dropFirst()
    }
}
