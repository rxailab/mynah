import SwiftUI

/// Clearing their own number to be shown to the businesses the assistant calls.
///
/// Twilio will only present a number it has confirmed the account holds, and it
/// confirms it the only way a voice line can be proved: by ringing the number
/// and having whoever answers key a six-digit code in. That is an awkward thing
/// to ask of the people this app is for — an unannounced call from a US number
/// asking for digits is precisely the shape of a scam, and the ones most likely
/// to hang up are the ones most likely to need the app.
///
/// So the screen does the announcing. The code and the number that is about to
/// ring go up first, and the server holds the call back for a few seconds to
/// make room for that. The rest is saying plainly what will and will not happen.
///
/// Skippable only in the sense that you can go and look around the app first.
/// Calls go out under your own number or they do not go out, so nothing can be
/// dialled until this is done — the copy says so rather than letting someone
/// discover it at the end of writing a brief.
struct VerifyNumberScreen: View {
    @ObservedObject var model: CallsViewModel
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    switch model.callerId {
                    case let .waiting(code, _, callingFrom, resumed):
                        Waiting(code: code, callingFrom: callingFrom, resumed: resumed)
                    case .verified:
                        Verified(phone: model.profile?.ownerPhone ?? "")
                    case let .failed(reason, phone, _):
                        Intro(phone: phone, error: reason)
                    case let .ready(phone, _):
                        Intro(phone: phone, error: nil)
                    case .loading:
                        Intro(phone: "", error: nil, busy: true)
                    }
                    Spacer().frame(height: 20)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 28)
                .padding(.top, 44)
            }

            VStack(spacing: 16) {
                switch model.callerId {
                case .verified:
                    PrimaryButton(t("action_done"), action: onDone)

                case .waiting:
                    // No primary action while the call is in flight — pressing
                    // something here would only re-ring a phone that is already
                    // ringing. Retry lives under it for when it did not arrive.
                    HStack(spacing: 9) {
                        PulsingDot(colour: Ink.positive, size: 8)
                        Text(t("callerid_waiting_status")).wise(Type.caption).foregroundStyle(Ink.body)
                        Spacer(minLength: 0)
                    }
                    // The one place a second call is the right answer: they are
                    // telling us the first one never arrived.
                    LinkText(t("callerid_retry"), style: Type.linkSmall) {
                        model.startCallerIdVerification(force: true)
                    }

                default:
                    let busy = model.callerId == .loading
                    PrimaryButton(
                        label: t(busy ? "callerid_starting" : "callerid_start"),
                        action: { model.startCallerIdVerification() },
                        enabled: !busy && !phoneOf(model.callerId).isBlank,
                        leading: {
                            if busy { Spinner(colour: Ink.onLime, size: 15) }
                        }
                    )
                }

                if model.callerId != .verified {
                    LinkText(t("action_skip_for_now"), style: Type.linkSmall, action: onDone)
                }
            }
            .padding(.horizontal, 28)
            .padding(.bottom, 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Ink.card)
        .onAppear { model.loadCallerId() }
        // The verification carries on at Twilio's end either way; this only
        // stops the polling, which has nothing left to tell anyone once nobody
        // is here.
        .onDisappear { model.stopWatchingCallerId() }
    }

    private func phoneOf(_ state: CallerIdState) -> String {
        switch state {
        case let .ready(phone, _): phone
        case let .waiting(_, phone, _, _): phone
        case let .failed(_, phone, _): phone
        default: ""
        }
    }
}

private struct Intro: View {
    let phone: String
    let error: String?
    var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(t("callerid_step_label")).wise(Type.labelSmall).foregroundStyle(Ink.mute)
            Spacer().frame(height: 10)
            Text(t("callerid_title"))
                .wise(Type.heading)
                .foregroundStyle(Ink.text)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 10)
            Text(t("callerid_body"))
                .wise(Type.caption)
                .foregroundStyle(Ink.body)
                .fixedSize(horizontal: false, vertical: true)

            if phone.isNotBlank {
                Spacer().frame(height: 24)
                WiseCard(fill: Ink.cardSoft, radius: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        SectionLabel(t("callerid_your_number"))
                        Text(phone).wise(Type.monoBody).foregroundStyle(Ink.text)
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 16)
                }
            }

            Spacer().frame(height: 18)
            Text(t("callerid_heads_up"))
                .wise(Type.fine)
                .foregroundStyle(Ink.mute)
                .fixedSize(horizontal: false, vertical: true)

            if !busy, let error {
                Spacer().frame(height: 14)
                Text(error)
                    .wise(Type.caption)
                    .foregroundStyle(Ink.negativeDeep)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

private struct Waiting: View {
    let code: String
    let callingFrom: String
    let resumed: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(t("callerid_step_label")).wise(Type.labelSmall).foregroundStyle(Ink.mute)
            Spacer().frame(height: 10)
            Text(t(resumed ? "callerid_resumed_title" : "callerid_waiting_title"))
                .wise(Type.heading)
                .foregroundStyle(Ink.text)
                .fixedSize(horizontal: false, vertical: true)

            // Coming back to a phone that is already ringing, the first thing to
            // settle is that this is the same call and the same digits —
            // otherwise the obvious reading is that we rang them twice.
            if resumed {
                Spacer().frame(height: 10)
                Text(t("callerid_resumed_note"))
                    .wise(Type.caption)
                    .foregroundStyle(Ink.body)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer().frame(height: 26)

            // The number first, then the code: that is the order they are
            // needed in.
            WiseCard(fill: Ink.cardSoft, radius: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    SectionLabel(t("callerid_incoming_label"))
                    Text(callingFrom).wise(Type.monoBody).foregroundStyle(Ink.text)
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 16)
            }

            Spacer().frame(height: 12)

            WiseCard(fill: Ink.limePale, radius: 18) {
                VStack(spacing: 12) {
                    SectionLabel(t("callerid_code_label"), colour: Ink.deep)
                    HStack(spacing: 8) {
                        ForEach(Array(code.enumerated()), id: \.offset) { _, digit in
                            Text(String(digit))
                                .wise(Type.pushed)
                                .foregroundStyle(Ink.text)
                                .frame(width: 38, height: 50)
                                .background(Ink.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 18)
                .padding(.vertical, 20)
            }

            Spacer().frame(height: 18)
            Text(t("callerid_waiting_note"))
                .wise(Type.fine)
                .foregroundStyle(Ink.mute)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct Verified: View {
    let phone: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("✓")
                .wise(Type.section)
                .foregroundStyle(Ink.onLime)
                .frame(width: 44, height: 44)
                .background(Ink.lime, in: Circle())
            Spacer().frame(height: 18)
            Text(t("callerid_done_title"))
                .wise(Type.heading)
                .foregroundStyle(Ink.text)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 10)
            Text(t("callerid_done_body", phone))
                .wise(Type.caption)
                .foregroundStyle(Ink.body)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
