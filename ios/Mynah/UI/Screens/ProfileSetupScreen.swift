import SwiftUI

/// The last step of signing up: the name the assistant gives when a booking
/// needs one, and the number a hand-over rings.
///
/// Skippable on purpose. Neither field is needed to look around the app, and the
/// server refuses to dial without them anyway — so the choice is between asking
/// now and blocking, or asking now and letting them get on with it.
///
/// ``onDone`` is told whether a number was actually saved. The step after this
/// one verifies that number, and there is nothing to verify for someone who
/// skipped.
struct ProfileSetupScreen: View {
    @ObservedObject var model: CallsViewModel
    let onDone: (_ savedNumber: Bool) -> Void

    @State private var name = ""
    @State private var phone = ""
    @State private var seeded = false
    @State private var saving = false
    @State private var error: String?

    private var phoneValid: Bool { phone.isBlank || isE164(phone.trimmed) }
    private var complete: Bool { name.trimmed.count >= 2 && isE164(phone.trimmed) }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(t("profile_step_label")).wise(Type.labelSmall).foregroundStyle(Ink.mute)
                    Spacer().frame(height: 10)
                    Text(t("settings_who"))
                        .wise(Type.heading)
                        .foregroundStyle(Ink.text)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer().frame(height: 10)
                    Text(t("settings_who_note"))
                        .wise(Type.caption)
                        .foregroundStyle(Ink.body)
                        .fixedSize(horizontal: false, vertical: true)

                    Spacer().frame(height: 26)
                    LabelledField(
                        label: t("field_your_name"),
                        text: $name,
                        support: t("support_your_name"),
                        content: .name,
                        autocapitalisation: .words,
                        onChange: { error = nil }
                    )

                    Spacer().frame(height: 16)
                    LabelledField(
                        label: t("field_your_phone"),
                        text: $phone,
                        support: t(phoneValid ? "support_your_phone_ok" : "support_your_phone_bad"),
                        supportWarning: !phoneValid,
                        mono: true,
                        keyboard: .phonePad,
                        content: .telephoneNumber,
                        onChange: { error = nil }
                    )

                    if let error {
                        Spacer().frame(height: 14)
                        Text(error).wise(Type.caption).foregroundStyle(Ink.negativeDeep)
                    }

                    Spacer().frame(height: 20)
                }
                .padding(.horizontal, 28)
                .padding(.top, 44)
            }
            .scrollDismissesKeyboard(.interactively)

            VStack(spacing: 16) {
                PrimaryButton(
                    label: t(saving ? "action_saving" : "action_save_and_start"),
                    action: save,
                    enabled: complete && !saving,
                    leading: {
                        if saving { Spinner(colour: Ink.onLime, size: 15) }
                    }
                )
                // Nothing was saved, so there is no number to verify next — even
                // if one was already typed into the field above.
                LinkText(t("action_fill_in_later"), style: Type.linkSmall) { onDone(false) }
            }
            .padding(.horizontal, 28)
            .padding(.bottom, 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Ink.card)
        .onAppear {
            model.loadProfile()
            seed()
        }
        // Prefill from whatever is already known — the server seeded a name from
        // the pre-accounts profile, or sign-up carried one. Retyping it would be
        // a strange thing to ask on the step that exists to save a step.
        .onChange(of: model.profile) { _, _ in seed() }
        .onChange(of: model.account) { _, _ in seed() }
    }

    private func seed() {
        guard !seeded else { return }
        let known = model.profile?.ownerName.nilIfBlank ?? model.account?.name?.nilIfBlank
        let knownPhone = model.profile?.ownerPhone.nilIfBlank
        guard known != nil || knownPhone != nil else { return }
        name = known ?? ""
        phone = knownPhone ?? ""
        seeded = true
    }

    private func save() {
        saving = true
        error = nil
        model.saveProfile(
            ownerName: name,
            ownerPhone: phone,
            onDone: {
                saving = false
                onDone(true)
            },
            onError: { reason in
                saving = false
                error = reason
            }
        )
    }
}

/// A labelled box with a line of support text under it — the shape every
/// one-field question in the app uses.
struct LabelledField: View {
    let label: String
    @Binding var text: String
    var support: String
    var supportWarning = false
    var mono = false
    var keyboard: UIKeyboardType = .default
    var content: UITextContentType?
    var autocapitalisation: TextInputAutocapitalization = .sentences
    var onChange: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label.uppercased()).wise(Type.labelSmall).foregroundStyle(Ink.mute)
            WiseTextField(
                placeholder: "",
                text: $text,
                style: mono ? Type.monoBody : Type.bodyLarge,
                keyboard: keyboard,
                content: content,
                autocapitalisation: autocapitalisation,
                onChange: onChange
            )
            .padding(.horizontal, 15)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .wiseField()
            Text(support)
                .wise(Type.fine)
                .foregroundStyle(supportWarning ? Ink.warningDeep : Ink.mute)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
