import SwiftUI

/// What is left to configure once the server address is fixed at build time and
/// the session comes from signing in: the interface language, who the assistant
/// says it is calling for, and the way out.
struct SettingsScreen: View {
    @ObservedObject var model: CallsViewModel
    /// Android leaves this to the system back gesture and draws nothing. iOS has
    /// the swipe too, but a screen with no way off it but a gesture is a screen
    /// somebody gets stuck on — so the arrow the rest of the app uses is here.
    var onBack: () -> Void = {}
    var onVerifyNumber: () -> Void = {}
    var onTemplates: () -> Void = {}
    var onBusinesses: () -> Void = {}
    var onUsage: () -> Void = {}
    var onHelp: () -> Void = {}
    var onScheduled: () -> Void = {}
    var onWhoFor: () -> Void = {}
    var onChangePassword: () -> Void = {}

    @State private var confirmingDelete = false
    @State private var deleteError: String?
    @State private var pickingLanguage = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                NavIcon(icon: Wise.arrowLeft, action: onBack)
                Spacer().frame(height: 4)
                Text(t("settings_title")).wise(Type.title).foregroundStyle(Ink.text)

                if let account = model.account {
                    Spacer().frame(height: 18)
                    AccountCard(account: account, used: model.usage.used, onUsage: onUsage)
                }

                // --- calling ---
                // The prototype turns the middle of this screen into rows: the
                // things that used to be edited here now have screens of their
                // own, and what is left is a list of where to go.
                Spacer().frame(height: 24)
                SectionLabel(t("settings_calling")).padding(.leading, 6)
                Spacer().frame(height: 8)
                GroupedCard {
                    SettingRow(
                        title: t("settings_who"),
                        subtitle: t("settings_who_sub"),
                        value: model.profile?.ownerName.nilIfBlank,
                        onTap: onWhoFor
                    )
                    callerIdRow
                    SettingRow(
                        title: t("scheduled_title"),
                        subtitle: t("settings_scheduled_sub"),
                        value: model.scheduled.isEmpty ? nil : String(model.scheduled.count),
                        onTap: onScheduled
                    )
                    SettingRow(
                        title: t("templates_title"),
                        subtitle: t("settings_templates_sub"),
                        onTap: onTemplates
                    )
                    SettingRow(
                        title: t("businesses_title"),
                        subtitle: t("settings_businesses_sub"),
                        onTap: onBusinesses
                    )
                }

                // --- account ---
                // Its own group after the calling settings, holding one row for
                // now. Anything else about the account rather than about the
                // calls belongs here rather than being wedged in above.
                Spacer().frame(height: 24)
                SectionLabel(t("settings_account")).padding(.leading, 6)
                Spacer().frame(height: 8)
                GroupedCard {
                    SettingRow(
                        title: t("change_password_title"),
                        subtitle: t("settings_change_password_sub"),
                        onTap: onChangePassword
                    )
                }

                // --- interface ---
                Spacer().frame(height: 24)
                SectionLabel(t("settings_ui_language")).padding(.leading, 6)
                Spacer().frame(height: 8)
                GroupedCard {
                    SettingRow(
                        title: t("settings_ui_language"),
                        subtitle: t("settings_language_row_sub"),
                        value: label(for: model.language),
                        onTap: { pickingLanguage = true }
                    )
                }
                Spacer().frame(height: 10)
                WiseCard(fill: Ink.limePale, radius: 16) {
                    VStack(alignment: .leading, spacing: 9) {
                        Text(t("settings_language_note"))
                            .wise(Type.caption)
                            .foregroundStyle(Ink.deep)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(t("settings_translation_note"))
                            .wise(Type.fine)
                            .foregroundStyle(Ink.deep)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(16)
                }

                // --- notifications ---
                Spacer().frame(height: 24)
                SectionLabel(t("settings_notifications")).padding(.leading, 6)
                Spacer().frame(height: 8)
                WiseCard {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(t("settings_notif_title")).wise(Type.listTitle).foregroundStyle(Ink.text)
                        Text(t("settings_notif_sub"))
                            .wise(Type.caption)
                            .foregroundStyle(Ink.body)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 16)
                }
                Spacer().frame(height: 10)
                Text(t("settings_notif_local"))
                    .wise(Type.fine)
                    .foregroundStyle(Ink.mute)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 6)

                // --- the published documents ---
                Spacer().frame(height: 24)
                SectionLabel(t("legal_section")).padding(.leading, 6)
                Spacer().frame(height: 8)
                WiseCard {
                    // Help sits with the documents rather than with the calling
                    // rows: all three are "go and read something".
                    LegalRow(label: t("help_title"), action: onHelp)
                    Rule()
                    LegalRow(label: t("legal_terms")) { Legal.open(Legal.terms, language: model.language) }
                    Rule()
                    LegalRow(label: t("legal_privacy")) { Legal.open(Legal.privacy, language: model.language) }
                }

                // The two ways out, grouped: one ends the session, one ends
                // everything.
                Spacer().frame(height: 24)
                WiseCard {
                    Text(t("action_sign_out"))
                        .wise(Type.listTitle)
                        .foregroundStyle(Ink.negative)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .contentShape(Rectangle())
                        .onTapGesture { model.signOut() }
                    Rule()
                    Text(t("action_delete_account"))
                        .wise(Type.listItem)
                        .foregroundStyle(Ink.negative)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .contentShape(Rectangle())
                        .onTapGesture { confirmingDelete = true }
                }

                Spacer().frame(height: 16)
                Text("\(t("app_name")) \(Build.version) (\(Build.buildNumber))")
                    .wise(Type.fine)
                    .foregroundStyle(Ink.mute)
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 24)
        }
        .navigationBarBackButtonHidden()
        .onAppear {
            model.loadProfile()
            model.loadUsage()
            model.loadScheduled()
        }
        .sheet(isPresented: $pickingLanguage) {
            LanguageSheet(current: model.language) { choice in
                model.setLanguage(choice)
                pickingLanguage = false
            }
            .presentationDetents([.height(260)])
        }
        .sheet(isPresented: $confirmingDelete) {
            DeleteAccountSheet(
                error: deleteError,
                onDismiss: {
                    confirmingDelete = false
                    deleteError = nil
                },
                onConfirm: { model.deleteAccount { reason in deleteError = reason } }
            )
            .presentationDetents([.medium])
        }
    }

    private var callerIdRow: some View {
        let verified = model.profile?.callerIdVerified == true
        return SettingRow(
            title: t("callerid_title"),
            subtitle: model.profile?.ownerPhone.nilIfBlank ?? t("callerid_not_verified"),
            onTap: verified ? nil : onVerifyNumber,
            trailing: {
                if verified {
                    Text(t("callerid_verified_badge"))
                        .wise(Type.labelSmall)
                        .foregroundStyle(Ink.positiveDeep)
                }
            }
        )
    }

    private func label(for language: Language) -> String {
        switch language {
        case .system: t("language_system")
        case .english: t("language_english")
        case .chinese: t("language_chinese")
        }
    }
}

/// The one dark card the design allows per screen: who is signed in.
private struct AccountCard: View {
    let account: Account
    let used: Int
    let onUsage: () -> Void

    var body: some View {
        WiseCard(fill: Ink.text) {
            HStack(spacing: 0) {
                Text(account.initial)
                    .wise(Type.section)
                    .foregroundStyle(Ink.onLime)
                    .frame(width: 48, height: 48)
                    .background(Ink.lime, in: Circle())
                Spacer().frame(width: 14)
                VStack(alignment: .leading, spacing: 0) {
                    Text(account.displayName).wise(Type.listTitle).foregroundStyle(Ink.onDark)
                    if account.handle.isNotBlank {
                        Text(account.handle).wise(Type.caption).foregroundStyle(Ink.lime)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                // The month's usage rides on the account card rather than being
                // a row of its own: it is a fact about this account, and it is
                // the only number on the screen.
                Spacer().frame(width: 12)
                VStack(alignment: .trailing, spacing: 3) {
                    Text(t("settings_calls_this_month", used))
                        .wise(Type.mono)
                        .foregroundStyle(Ink.onDarkMute)
                    Text(t("usage_title"))
                        .wise(Type.labelSmall)
                        .foregroundStyle(Ink.lime)
                        .contentShape(Rectangle())
                        .onTapGesture(perform: onUsage)
                }
            }
            .padding(18)
        }
    }
}

/// The three interface languages. A sheet rather than the old inline radio
/// card: with the rest of the screen turned into rows, three permanently
/// expanded options was the one thing left shouting.
private struct LanguageSheet: View {
    let current: Language
    let onPick: (Language) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(t("settings_ui_language"))
                .wise(Type.section)
                .foregroundStyle(Ink.text)
                .padding(.horizontal, 22)
                .padding(.vertical, 12)
            ForEach(Language.allCases) { option in
                HStack(spacing: 14) {
                    // The design's radio: an ink ring that fills in, not a tick.
                    Circle()
                        .strokeBorder(
                            option == current ? Ink.outline : Ink.rimSoft,
                            lineWidth: option == current ? 6 : 2
                        )
                        .frame(width: 20, height: 20)
                    Text(label(for: option)).wise(Type.listItem).foregroundStyle(Ink.text)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 22)
                .padding(.vertical, 14)
                .contentShape(Rectangle())
                .onTapGesture { onPick(option) }
            }
            Spacer(minLength: 0)
        }
        .padding(.top, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Ink.card)
    }

    private func label(for language: Language) -> String {
        switch language {
        case .system: t("language_system")
        case .english: t("language_english")
        case .chinese: t("language_chinese")
        }
    }
}

private struct LegalRow: View {
    let label: String
    let action: () -> Void

    var body: some View {
        HStack {
            Text(label).wise(Type.listItem).foregroundStyle(Ink.text)
            Spacer()
            Icon(Wise.chevronRight, size: 15).foregroundStyle(Ink.mute)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 15)
        .contentShape(Rectangle())
        .onTapGesture(perform: action)
    }
}

/// Deleting is irreversible and takes the call history with it, so the
/// confirmation spells out what goes rather than asking "are you sure".
private struct DeleteAccountSheet: View {
    let error: String?
    let onDismiss: () -> Void
    let onConfirm: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(t("delete_account_title")).wise(Type.section).foregroundStyle(Ink.text)
            Spacer().frame(height: 10)
            Text(t("delete_account_body"))
                .wise(Type.caption)
                .foregroundStyle(Ink.body)
                .fixedSize(horizontal: false, vertical: true)

            if let error {
                Spacer().frame(height: 12)
                Text(error).wise(Type.caption).foregroundStyle(Ink.negativeDeep)
            }

            Spacer().frame(height: 20)
            PrimaryButton(
                t("action_delete_forever"),
                height: 48,
                container: Ink.negative,
                content: Ink.onDark,
                style: Type.buttonSmall,
                action: onConfirm
            )
            Spacer().frame(height: 10)
            Text(t("action_cancel"))
                .wise(Type.link)
                .foregroundStyle(Ink.text)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
                .onTapGesture(perform: onDismiss)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Ink.card)
    }
}
