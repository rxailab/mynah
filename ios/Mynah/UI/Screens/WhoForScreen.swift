import SwiftUI

/// The name the assistant gives when a booking needs one, and the number a
/// hand-over rings.
///
/// Its own screen in the redesign. These two fields carry more weight than
/// anything else in Settings — one of them is spoken aloud to strangers and the
/// other is where the phone rings when the assistant will not go on alone — and
/// they were previously buried between a language picker and a sign-out button.
///
/// The weight is why saving here is not an ordinary save. Changing the number
/// clears the caller ID the server had verified against the old one, which stops
/// the assistant being able to place calls at all. That used to be signalled by a
/// single row losing its green tint, several hundred points down a scroll view,
/// while the person was looking at a keyboard. Now the receipt says it, says what
/// it costs, and offers the way out on the spot.
struct WhoForScreen: View {
    @ObservedObject var model: CallsViewModel
    let onBack: () -> Void
    let onVerifyNumber: () -> Void

    @State private var ownerName = ""
    @State private var ownerPhone = ""
    /// Per field, not one flag for the screen. A profile that arrives late must
    /// not overwrite something already being typed — see ``seed``.
    @State private var nameTouched = false
    @State private var phoneTouched = false
    @State private var saving = false
    @State private var outcome: Outcome?
    @State private var confirmingRelease = false
    @State private var confirmingLeave = false
    @FocusState private var focused: Bool

    /// What the fixed strip above the button is currently saying.
    private enum Outcome: Equatable {
        case savedVerified
        case savedUnverified(String)
        case released
        case failed(String)
    }

    private var tidiedPhone: String { tidyPhone(ownerPhone) }
    private var nameValid: Bool { ownerName.trimmed.count >= 2 }
    private var phoneValid: Bool { isE164(tidiedPhone) }
    private var verified: Bool { model.profile?.callerIdVerified == true }

    /// Whether anything on screen differs from what the server holds. Saving an
    /// identical profile costs a round trip and, on this screen, can cost the
    /// caller ID as well, so an unchanged form has nothing to submit.
    private var dirty: Bool {
        guard let profile = model.profile else { return nameValid || phoneValid }
        return ownerName.trimmed != profile.ownerName || tidiedPhone != profile.ownerPhone
    }

    private var canSave: Bool { nameValid && phoneValid && dirty && !saving }

    /// Said under the button when it is grey, because a disabled button that
    /// does not say why is a dead end.
    private var blockedReason: String? {
        if saving || canSave { return nil }
        if !nameValid { return t("save_blocked_name") }
        if tidiedPhone.isBlank { return t("save_blocked_phone") }
        if !phoneValid { return t("save_blocked_phone_bad") }
        return t("save_nothing_to_do")
    }

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(t("settings_who"), onBack: leave)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(t("settings_who_note"))
                        .wise(Type.caption)
                        .foregroundStyle(Ink.body)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer().frame(height: 20)

                    WiseCard(radius: 16) {
                        VStack(alignment: .leading, spacing: 16) {
                            LabelledField(
                                label: t("field_your_name"),
                                text: $ownerName,
                                support: t(nameValid || ownerName.isBlank
                                           ? "support_your_name" : "support_your_name_bad"),
                                supportWarning: !nameValid && !ownerName.isBlank,
                                content: .name,
                                autocapitalisation: .words,
                                onChange: { nameTouched = true; edited() }
                            )
                            LabelledField(
                                label: t("field_your_phone"),
                                text: $ownerPhone,
                                support: t(phoneValid || ownerPhone.isBlank
                                           ? "support_your_phone_ok" : "support_your_phone_bad"),
                                supportWarning: !phoneValid && !ownerPhone.isBlank,
                                mono: true,
                                keyboard: .phonePad,
                                content: .telephoneNumber,
                                onChange: { phoneTouched = true; edited() }
                            )
                            .focused($focused)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 18)
                    }

                    // The caller ID sits with the number it belongs to, not
                    // three sections away in a list of unrelated switches.
                    Spacer().frame(height: 12)
                    callerIdRow

                    if verified {
                        // Spelled out because it is not obvious: this is not a
                        // display preference, it is the thing that lets the app
                        // call at all.
                        Spacer().frame(height: 10)
                        Text(t("callerid_remove_warning"))
                            .wise(Type.fine)
                            .foregroundStyle(Ink.mute)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, 4)
                        Spacer().frame(height: 8)
                        LinkText(
                            t("callerid_remove"),
                            style: Type.linkSmall,
                            colour: Ink.negativeDeep
                        ) { confirmingRelease = true }
                            .frame(maxWidth: .infinity)
                    }

                    Spacer().frame(height: 24)
                }
                .padding(.horizontal, 20)
                .padding(.top, 14)
            }
            .scrollDismissesKeyboard(.interactively)

            // Everything below is pinned. The receipt used to live at the end of
            // the scroll view while the button sat outside it, so on a screen
            // with the keyboard up it was reliably below the fold: you pressed
            // Save and nothing appeared to happen.
            VStack(spacing: 12) {
                if let outcome { receipt(outcome) }

                if let blockedReason {
                    Text(blockedReason)
                        .wise(Type.fine)
                        .foregroundStyle(Ink.mute)
                        .frame(maxWidth: .infinity)
                        .fixedSize(horizontal: false, vertical: true)
                }

                PrimaryButton(
                    label: t(saving ? "action_saving" : "action_save"),
                    action: save,
                    enabled: canSave,
                    // Saving keeps the lime and adds a spinner rather than
                    // switching to the disabled palette, which reads as "this
                    // button is off" at the exact moment it is working.
                    container: saving ? Ink.lime : Ink.lime,
                    disabledContainer: saving ? Ink.lime : Ink.canvasSoft,
                    disabledContent: saving ? Ink.onLime : Ink.mute,
                    leading: { if saving { Spinner(colour: Ink.onLime, size: 15) } }
                )
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 24)
            .background(Ink.canvas)
        }
        .navigationBarBackButtonHidden()
        .confirmationDialog(
            t("callerid_release_title"),
            isPresented: $confirmingRelease,
            titleVisibility: .visible
        ) {
            Button(t("callerid_release_confirm"), role: .destructive) {
                model.releaseCallerId { outcome = .released }
            }
            Button(t("action_cancel"), role: .cancel) {}
        } message: {
            Text(t("callerid_release_body"))
        }
        .confirmationDialog(
            t("leave_unsaved_title"),
            isPresented: $confirmingLeave,
            titleVisibility: .visible
        ) {
            Button(t("action_discard"), role: .destructive, action: onBack)
            Button(t("action_keep_editing"), role: .cancel) {}
        } message: {
            Text(t("leave_unsaved_body"))
        }
        .onAppear {
            model.loadProfile()
            seed()
        }
        .onChange(of: model.profile) { _, _ in seed() }
    }

    /// The strip above the button. Four things it can say, and the one that
    /// matters carries an action: a number saved but unverified means the
    /// assistant cannot call, and the fix is one tap from here.
    @ViewBuilder
    private func receipt(_ outcome: Outcome) -> some View {
        switch outcome {
        case .savedUnverified(let phone):
            VStack(alignment: .leading, spacing: 8) {
                Text(t("saved_unverified_title"))
                    .wise(Type.rowTitle).foregroundStyle(Ink.warningInk)
                Text(t("saved_unverified_body"))
                    .wise(Type.fine).foregroundStyle(Ink.body)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 10) {
                    OutlineButton(
                        label: t("action_verify_now", phone),
                        action: onVerifyNumber,
                        height: 44,
                        style: Type.buttonSmall,
                        leading: { EmptyView() }
                    )
                    LinkText(t("action_later"), style: Type.linkSmall, colour: Ink.mute) {
                        self.outcome = nil
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Ink.warning.opacity(0.16),
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous))

        case .savedVerified:
            strip(t("saved_all_done"), Ink.positive)
        case .released:
            strip(t("callerid_released"), Ink.warningDeep)
        case .failed(let reason):
            strip(reason, Ink.negative)
        }
    }

    private func strip(_ text: String, _ colour: Color) -> some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(colour)
                .frame(width: 3, height: 34)
            Text(text)
                .wise(Type.caption)
                .foregroundStyle(Ink.body)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
    }

    private var callerIdRow: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                Text(t("callerid_title")).wise(Type.rowTitle).foregroundStyle(Ink.text)
                // Only a verified number gets to be named here. Rendering
                // ownerPhone either way let an unverified number wear the
                // sentence that says calls now go out as that number.
                Text(verified
                     ? t("callerid_done_body", model.profile?.ownerPhone ?? "")
                     : t("callerid_not_verified"))
                    .wise(Type.rowSub)
                    .foregroundStyle(Ink.body)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(t(verified ? "callerid_verified_badge" : "callerid_start"))
                .wise(Type.labelSmall)
                .foregroundStyle(verified ? Ink.positiveDeep : Ink.deep)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .background(
            verified ? Ink.limePale : Ink.cardSoft,
            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
        .contentShape(Rectangle())
        // Verified is a state, not a button; there is only something to tap when
        // it is not.
        .onTapGesture { if !verified { onVerifyNumber() } }
    }

    private func save() {
        focused = false
        saving = true
        outcome = nil
        let phone = tidiedPhone
        // Normalised before it is sent, so what the server stores is what the
        // next dirty check compares against.
        ownerPhone = phone
        model.saveProfile(
            ownerName: ownerName,
            ownerPhone: phone,
            onDone: {
                saving = false
                outcome = model.profile?.callerIdVerified == true
                    ? .savedVerified
                    : .savedUnverified(phone)
            },
            onError: { reason in
                saving = false
                outcome = .failed(reason)
            }
        )
    }

    private func leave() {
        if dirty { confirmingLeave = true } else { onBack() }
    }

    /// Fills only what nobody has typed into yet.
    ///
    /// The old version gated on the whole screen having been seeded once, which
    /// meant a profile arriving on a slow connection replaced whatever was being
    /// typed at the time — silently, and with the value the person was in the
    /// middle of correcting.
    private func seed() {
        guard let profile = model.profile else { return }
        if !nameTouched { ownerName = profile.ownerName }
        if !phoneTouched { ownerPhone = profile.ownerPhone }
    }

    private func edited() {
        // A receipt describes a save that has happened. Once the fields move on
        // from it, it is describing something that is no longer on screen.
        outcome = nil
    }
}
