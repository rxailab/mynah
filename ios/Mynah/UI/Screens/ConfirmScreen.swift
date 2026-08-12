import SwiftUI

/// What the assistant understood, before anything is dialled. Every line is
/// editable, and blanks stay blank — the parser is told to leave gaps rather
/// than guess, so an empty row here is the system working.
///
/// The prototype's review step: back arrow top-left, everything in one white
/// card on the sage canvas, and a single lime action at the foot.
struct ConfirmScreen: View {
    @ObservedObject var model: CallsViewModel
    let onBack: () -> Void
    let onPlaced: (String) -> Void
    var onNeedsTopUp: () -> Void = {}
    var onCallLater: () -> Void = {}

    /// Once the language row is set by hand, a later phone edit stops
    /// overriding it.
    @State private var languageTouched = false
    @State private var pickingContact = false

    var body: some View {
        if let brief = model.parse.brief {
            content(brief)
        } else {
            // The brief is gone (a cleared parse) — go back rather than blank.
            Color.clear.onAppear(perform: onBack)
        }
    }

    private func content(_ brief: Brief) -> some View {
        let phone = brief.phoneNumber.orEmpty.trimmed
        let phoneValid = isE164(phone)
        let canDial = phoneValid && !model.loading

        return VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    StepHeader(
                        icon: Wise.arrowLeft,
                        onNavigate: onBack,
                        title: t("confirm_title"),
                        // Two steps, and this is the second: say it, then check
                        // it. Worth stating because the button below dials.
                        step: t("confirm_step")
                    )

                    Spacer().frame(height: 14)
                    WiseCard {
                        VStack(alignment: .leading, spacing: 16) {
                            LabelledBox(
                                label: t("field_who"),
                                bold: true,
                                text: field(brief, { $0.businessName.orEmpty }, set: { $0.businessName = $1.nilIfBlank })
                            )
                            LabelledBox(
                                label: t("field_when"),
                                text: field(brief, { $0.when.orEmpty }, set: { $0.when = $1.nilIfBlank })
                            )
                            LabelledBox(
                                label: t("field_notes"),
                                text: field(brief) { $0.constraints.joined(separator: " · ") } set: { current, text in
                                    current.constraints = text
                                        .split(whereSeparator: { $0 == "·" || $0 == "\n" })
                                        .map { $0.trimmingCharacters(in: .whitespaces) }
                                        .filter { !$0.isEmpty }
                                }
                            )

                            languageRow(brief)
                            phoneRow(brief, phone: phone, valid: phoneValid)
                        }
                        .padding(20)
                    }

                    Spacer().frame(height: 12)
                    Text(t("confirm_blanks_note"))
                        .wise(Type.fine)
                        .foregroundStyle(Ink.mute)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 6)

                    // Decided here because it cannot be decided later: the offer
                    // comes with a few seconds to press a key, and the assistant
                    // refuses by default rather than putting an unattended call
                    // on someone's phone.
                    Spacer().frame(height: 14)
                    WiseCard {
                        SettingRow(
                            title: t("callback_title"),
                            subtitle: t(brief.acceptCallback ? "callback_on" : "callback_off"),
                            trailing: {
                                PillSwitch(on: brief.acceptCallback) {
                                    var updated = brief
                                    updated.acceptCallback.toggle()
                                    model.editBrief(updated)
                                }
                            }
                        )
                    }

                    // The pale-green panel is the design's way of previewing
                    // what the assistant will actually say.
                    Spacer().frame(height: 14)
                    WiseCard(fill: Ink.limePale) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(t("opener_label")).wise(Type.labelSmall).foregroundStyle(Ink.deep)
                            Text("“\(brief.opening)”")
                                .wise(Type.body)
                                .foregroundStyle(Ink.deep)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(18)
                    }

                    if let error = model.error {
                        Spacer().frame(height: 14)
                        ErrorCard(message: error) { model.clearError() }
                    }

                    Spacer().frame(height: 20)
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
            }
            .scrollDismissesKeyboard(.interactively)

            VStack(spacing: 10) {
                PrimaryButton(
                    label: t(model.loading ? "action_dialling" : (phoneValid ? "action_dial" : "action_need_number")),
                    action: { model.createCall(brief.toRequest(), onPlaced: onPlaced, onNeedsTopUp: onNeedsTopUp) },
                    enabled: canDial,
                    leading: {
                        if model.loading {
                            Spinner(colour: Ink.onLime, size: 15)
                        } else {
                            Icon(Wise.phone, size: 16)
                        }
                    }
                )
                // The same brief, booked rather than dialled. Outlined so there
                // is still exactly one lime action on the screen.
                OutlineButton(
                    label: t("action_call_later"),
                    action: onCallLater,
                    enabled: canDial,
                    leading: { Icon(Wise.clock, size: 15) }
                )
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 20)
        }
        .sheet(isPresented: $pickingContact) {
            ContactPicker { number in
                pickingContact = false
                apply(number, to: brief)
            }
            .ignoresSafeArea()
        }
    }

    private func languageRow(_ brief: Brief) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .lastTextBaseline, spacing: 8) {
                Text(t("field_call_language").uppercased())
                    .wise(Type.labelSmall)
                    .foregroundStyle(Ink.mute)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(t("field_auto_language")).wise(Type.fine).foregroundStyle(Ink.mute)
            }
            HStack(spacing: 8) {
                ForEach([("en", "English"), ("zh", "中文")], id: \.0) { id, label in
                    WiseFilterChip(label: label, selected: brief.language == id) {
                        languageTouched = true
                        var updated = brief
                        updated.language = id
                        model.editBrief(updated)
                    }
                }
            }
        }
    }

    private func phoneRow(_ brief: Brief, phone: String, valid: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .lastTextBaseline, spacing: 8) {
                Text(t("field_phone").uppercased())
                    .wise(Type.labelSmall)
                    .foregroundStyle(Ink.mute)
                    .frame(maxWidth: .infinity, alignment: .leading)
                LinkText(t("action_from_contacts"), style: Type.fine) { pickingContact = true }
            }
            WiseTextField(
                placeholder: "",
                text: Binding(get: { phone }, set: { apply($0, to: brief) }),
                style: Type.monoBody,
                keyboard: .phonePad
            )
            .padding(.horizontal, 15)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .wiseField()
            HStack(spacing: 7) {
                Circle()
                    .fill(valid ? Ink.positive : Ink.warningDeep)
                    .frame(width: 6, height: 6)
                Text(t(valid ? "phone_ok" : "phone_needs_code"))
                    .wise(Type.fine)
                    .foregroundStyle(valid ? Ink.positiveDeep : Ink.warningDeep)
            }
        }
    }

    /// A number typed or picked. The call's language follows the country code
    /// until somebody sets it by hand.
    private func apply(_ number: String, to brief: Brief) {
        var updated = brief
        updated.phoneNumber = number.nilIfBlank
        if !languageTouched, let guessed = languageForNumber(number) {
            updated.language = guessed
        }
        model.editBrief(updated)
    }

    /// One editable line of the brief, read from it and written straight back.
    private func field(
        _ brief: Brief,
        _ get: @escaping (Brief) -> String,
        set: @escaping (inout Brief, String) -> Void
    ) -> Binding<String> {
        Binding(
            get: { get(brief) },
            set: { value in
                var updated = brief
                set(&updated, value)
                model.editBrief(updated)
            }
        )
    }
}

/// A labelled outlined box, the shape every editable line on this screen takes.
private struct LabelledBox: View {
    let label: String
    var bold = false
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label.uppercased()).wise(Type.labelSmall).foregroundStyle(Ink.mute)
            WiseTextField(placeholder: "", text: $text, style: bold ? Type.value : Type.bodyLarge)
                .padding(.horizontal, 15)
                .padding(.vertical, 14)
                .frame(maxWidth: .infinity)
                .wiseField()
        }
    }
}
