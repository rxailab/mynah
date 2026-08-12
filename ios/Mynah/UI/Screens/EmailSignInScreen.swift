import SwiftUI

/// The server's own rule, checked here so the one button can mean two things.
private let minimumPassword = 8

/// One pair of fields for both signing up and signing in. The server cannot say
/// whether an address exists without leaking that it does, so the app does not
/// ask: it tries to register, and a rejected address means this is someone
/// coming back.
struct EmailSignInScreen: View {
    @ObservedObject var model: CallsViewModel
    let onBack: () -> Void
    var onForgot: () -> Void = {}

    @State private var email = ""
    @State private var password = ""
    @State private var visible = false

    private var emailValid: Bool { looksLikeEmail(email.trimmed) }
    private var passwordValid: Bool { password.count >= minimumPassword }
    private var busy: Bool { model.signIn.isRunning }
    private var canContinue: Bool { emailValid && passwordValid && !busy }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            NavIcon(icon: Wise.arrowLeft, action: onBack)

            Spacer().frame(height: 18)
            Text(t("email_title"))
                .wise(Type.heading)
                .foregroundStyle(Ink.text)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 10)
            Text(t("email_sub"))
                .wise(Type.body)
                .foregroundStyle(Ink.body)
                .fixedSize(horizontal: false, vertical: true)

            // One box, one rule between the two rows — the prototype's joined field.
            Spacer().frame(height: 26)
            VStack(spacing: 0) {
                WiseTextField(
                    placeholder: t("field_email"),
                    text: $email,
                    keyboard: .emailAddress,
                    content: .username,
                    autocapitalisation: .never,
                    submitLabel: .next,
                    onChange: edited
                )
                .padding(.horizontal, 16)
                .padding(.vertical, 15)

                Rule(Ink.hairline)

                PasswordField(
                    placeholder: t("field_password"),
                    text: $password,
                    visible: $visible,
                    onChange: edited
                )
                .padding(.horizontal, 16)
                .padding(.vertical, 15)
            }
            .wiseField()

            // The rule and the way out share a line. "Forgot password?" only
            // appears when the server can actually send a code — without a mail
            // provider it leads nowhere, and a dead end is worse than no link.
            Spacer().frame(height: 10)
            HStack(spacing: 12) {
                let bad = !email.isEmpty && !emailValid
                Text(t(bad ? "email_bad_address" : "email_password_rule"))
                    .wise(Type.fine)
                    .foregroundStyle(bad ? Ink.warningDeep : Ink.mute)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if model.authMethods?.passwordReset == true {
                    // Sends the code from here rather than on the next screen,
                    // so the address it goes to is the one on this form and
                    // nobody has to type it twice. Inert until that address is a
                    // real one — shown greyed rather than hidden, because a link
                    // that comes and goes as you type is worse than one that
                    // waits.
                    LinkText(
                        t("password_forgot"),
                        style: Type.linkSmall,
                        colour: emailValid ? Ink.deep : Ink.rim
                    ) {
                        if emailValid { model.sendResetCode(email, onSent: onForgot) }
                    }
                }
            }
            .padding(.horizontal, 4)

            if let reason = model.signIn.reason {
                Spacer().frame(height: 14)
                Text(reason)
                    .wise(Type.caption)
                    .foregroundStyle(Ink.negativeDeep)
                    .padding(.horizontal, 4)
            }

            Spacer()

            PrimaryButton(
                label: t(busy ? "action_signing_in" : "action_continue"),
                action: { model.signInWithEmail(email: email, password: password) },
                enabled: canContinue,
                leading: {
                    if busy { Spinner(colour: Ink.onLime, size: 15) }
                }
            )
        }
        .padding(.horizontal, 28)
        .padding(.top, 16)
        .padding(.bottom, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Ink.card)
    }

    private func edited() {
        if model.signIn.reason != nil { model.clearSignInError() }
    }
}
