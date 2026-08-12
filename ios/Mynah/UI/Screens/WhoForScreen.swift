import SwiftUI

/// The name the assistant gives when a booking needs one, and the number a
/// hand-over rings.
///
/// Its own screen in the redesign. These two fields carry more weight than
/// anything else in Settings — one of them is spoken aloud to strangers and the
/// other is where the phone rings when the assistant will not go on alone — and
/// they were previously buried between a language picker and a sign-out button.
struct WhoForScreen: View {
    @ObservedObject var model: CallsViewModel
    let onBack: () -> Void
    let onVerifyNumber: () -> Void

    @State private var ownerName = ""
    @State private var ownerPhone = ""
    @State private var seeded = false
    @State private var saving = false
    @State private var saved = false
    @State private var saveError: String?

    private var phoneValid: Bool { ownerPhone.isBlank || isE164(ownerPhone.trimmed) }
    private var canSave: Bool { ownerName.trimmed.count >= 2 && isE164(ownerPhone.trimmed) && !saving }
    private var verified: Bool { model.profile?.callerIdVerified == true }

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(t("settings_who"), onBack: onBack)

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
                                support: t("support_your_name"),
                                content: .name,
                                autocapitalisation: .words,
                                onChange: edited
                            )
                            LabelledField(
                                label: t("field_your_phone"),
                                text: $ownerPhone,
                                support: t(phoneValid ? "support_your_phone_ok" : "support_your_phone_bad"),
                                supportWarning: !phoneValid,
                                mono: true,
                                keyboard: .phonePad,
                                content: .telephoneNumber,
                                onChange: edited
                            )
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
                        ) { model.releaseCallerId() }
                            .frame(maxWidth: .infinity)
                    }

                    if let notice {
                        Spacer().frame(height: 14)
                        HStack(spacing: 12) {
                            RoundedRectangle(cornerRadius: 2, style: .continuous)
                                .fill(notice.1)
                                .frame(width: 3, height: 38)
                            Text(notice.0)
                                .wise(Type.caption)
                                .foregroundStyle(Ink.body)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.horizontal, 6)
                    }

                    Spacer().frame(height: 24)
                }
                .padding(.horizontal, 20)
                .padding(.top, 14)
            }
            .scrollDismissesKeyboard(.interactively)

            PrimaryButton(t(saving ? "action_saving" : "action_save"), enabled: canSave) {
                saving = true
                saveError = nil
                model.saveProfile(
                    ownerName: ownerName,
                    ownerPhone: ownerPhone,
                    onDone: {
                        saving = false
                        saved = true
                    },
                    onError: { reason in
                        saving = false
                        saveError = reason
                    }
                )
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .navigationBarBackButtonHidden()
        .onAppear {
            model.loadProfile()
            seed()
        }
        .onChange(of: model.profile) { _, _ in seed() }
    }

    private var callerIdRow: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                Text(t("callerid_title")).wise(Type.rowTitle).foregroundStyle(Ink.text)
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

    private var notice: (String, Color)? {
        if let saveError { return (saveError, Ink.negative) }
        if saved { return (t("settings_saved"), Ink.positive) }
        return nil
    }

    private func seed() {
        guard !seeded, let profile = model.profile else { return }
        ownerName = profile.ownerName
        ownerPhone = profile.ownerPhone
        seeded = true
    }

    private func edited() {
        saveError = nil
        saved = false
    }
}
