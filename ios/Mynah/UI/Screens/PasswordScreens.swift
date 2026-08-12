import SwiftUI

/// The server's own rule, checked here so the button can be honest about it.
private let minimumPassword = 8
private let codeLength = 6

// Getting back in without the password, and changing it once you are.
//
// The three screens live together because they are one flow wearing different
// hats — enter a code, set a password, and the in-app version of the same
// thing — and because they share the field styling with the email sign-in
// screen next door rather than with anything else in the app.

/// The code from the email.
///
/// Nothing is checked here. There is no endpoint that validates a code on its
/// own, deliberately: one would be a way to grind through six-digit guesses
/// without ever committing to a password. The code is carried forward and spent
/// once, on the next screen, together with the new password — so a wrong code
/// is reported there.
struct ResetCodeScreen: View {
    @ObservedObject var model: CallsViewModel
    let onBack: () -> Void
    let onEntered: () -> Void

    @State private var code = ""
    @State private var resent = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            NavIcon(icon: Wise.arrowLeft, action: onBack)

            Spacer().frame(height: 18)
            Text(t("reset_code_title"))
                .wise(Type.heading)
                .foregroundStyle(Ink.text)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 10)
            Text(t("reset_code_sub", model.resetEmail))
                .wise(Type.body)
                .foregroundStyle(Ink.body)
                .fixedSize(horizontal: false, vertical: true)

            Spacer().frame(height: 26)
            CodeField(code: $code) { resent = false }

            Spacer().frame(height: 16)
            HStack(spacing: 8) {
                Text(t(resent ? "reset_code_sent_again" : "reset_code_none"))
                    .wise(Type.caption)
                    .foregroundStyle(resent ? Ink.positiveDeep : Ink.mute)
                if !resent {
                    LinkText(t("reset_code_resend"), style: Type.linkSmall) {
                        model.sendResetCode(model.resetEmail) { resent = true }
                    }
                }
            }
            .padding(.horizontal, 4)

            if let reason = model.signIn.reason {
                Spacer().frame(height: 14)
                Text(reason).wise(Type.caption).foregroundStyle(Ink.negativeDeep).padding(.horizontal, 4)
            }

            Spacer()

            PrimaryButton(t("action_continue"), enabled: code.count == codeLength) {
                model.holdResetCode(code)
                onEntered()
            }
        }
        .padding(.horizontal, 28)
        .padding(.top, 16)
        .padding(.bottom, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Ink.card)
    }
}

/// Six boxes that are really one field.
///
/// A single invisible text field behind six drawn cells, rather than six fields
/// wired together: it gets keyboard handling, paste of a whole code, and
/// backspace for free, none of which is worth reimplementing.
private struct CodeField: View {
    @Binding var code: String
    var onChange: () -> Void = {}

    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            TextField("", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .foregroundStyle(.clear)
                .tint(.clear)
                .focused($focused)
                .frame(maxWidth: .infinity)
                .frame(height: 56)
                .onChange(of: code) { _, value in
                    let digits = String(value.filter(\.isNumber).prefix(codeLength))
                    if digits != value { code = digits }
                    onChange()
                }

            HStack(spacing: 8) {
                ForEach(0..<codeLength, id: \.self) { index in
                    let filled = index < code.count
                    let here = index == code.count
                    ZStack {
                        if filled {
                            let digit = code[code.index(code.startIndex, offsetBy: index)]
                            Text(String(digit)).wise(Type.title).foregroundStyle(Ink.text)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 56)
                    // The cell being typed into takes the heavier line, an empty
                    // one the pale ring — so the caret's position is visible
                    // without drawing a caret.
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(
                                filled || here ? Ink.outline : Ink.rim,
                                lineWidth: here ? 2 : 1
                            )
                    )
                }
            }
            .allowsHitTesting(false)
        }
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
        .onAppear { focused = true }
    }
}

/// The new password, which also signs them in — no trip back to the sign-in screen.
struct NewPasswordScreen: View {
    @ObservedObject var model: CallsViewModel
    let onBack: () -> Void
    let onDone: () -> Void

    @State private var password = ""
    @State private var visible = false

    private var busy: Bool { model.signIn.isRunning }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            NavIcon(icon: Wise.arrowLeft, action: onBack)

            Spacer().frame(height: 18)
            Text(t("reset_new_title"))
                .wise(Type.heading)
                .foregroundStyle(Ink.text)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 10)
            Text(t("reset_new_sub", model.resetEmail))
                .wise(Type.body)
                .foregroundStyle(Ink.body)
                .fixedSize(horizontal: false, vertical: true)

            Spacer().frame(height: 26)
            PasswordField(
                placeholder: t("field_password"),
                text: $password,
                visible: $visible,
                content: .newPassword,
                onChange: { if model.signIn.reason != nil { model.clearSignInError() } }
            )
            .padding(.horizontal, 16)
            .padding(.vertical, 15)
            .wiseField()

            Spacer().frame(height: 10)
            Text(t("email_password_rule")).wise(Type.fine).foregroundStyle(Ink.mute).padding(.horizontal, 4)

            if let reason = model.signIn.reason {
                Spacer().frame(height: 14)
                Text(reason).wise(Type.caption).foregroundStyle(Ink.negativeDeep).padding(.horizontal, 4)
            }

            Spacer()

            PrimaryButton(
                label: t(busy ? "action_signing_in" : "reset_save"),
                action: { model.resetPassword(password, onDone: onDone) },
                enabled: password.count >= minimumPassword && !busy,
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
}

/// Changing it from inside the app. Two rows in one box, the way the sign-in
/// screen joins its address and password.
///
/// - Parameter onForgot: the way out for somebody who opened this and then
///   realised they do not know the current one. It leaves for the emailed-code
///   flow rather than leaving them stuck on a form they cannot fill in.
struct ChangePasswordScreen: View {
    @ObservedObject var model: CallsViewModel
    let onBack: () -> Void
    let onForgot: () -> Void

    @State private var current = ""
    @State private var fresh = ""
    @State private var visible = false
    @State private var saving = false
    @State private var done = false
    @State private var error: String?

    private var canSave: Bool { !current.isEmpty && fresh.count >= minimumPassword && !saving }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            NavIcon(icon: Wise.arrowLeft, action: onBack)

            Spacer().frame(height: 18)
            Text(t("change_password_title"))
                .wise(Type.heading)
                .foregroundStyle(Ink.text)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 10)
            Text(t("change_password_sub"))
                .wise(Type.body)
                .foregroundStyle(Ink.body)
                .fixedSize(horizontal: false, vertical: true)

            Spacer().frame(height: 26)
            VStack(spacing: 0) {
                PasswordField(
                    placeholder: t("change_password_current"),
                    text: $current,
                    visible: $visible,
                    onChange: edited
                )
                .padding(.horizontal, 16)
                .padding(.vertical, 15)

                Rule(Ink.hairline)

                PasswordField(
                    placeholder: t("change_password_new"),
                    text: $fresh,
                    visible: $visible,
                    content: .newPassword,
                    onChange: edited
                )
                .padding(.horizontal, 16)
                .padding(.vertical, 15)
            }
            .wiseField()

            Spacer().frame(height: 10)
            HStack(spacing: 12) {
                Text(t("change_password_rule"))
                    .wise(Type.fine)
                    .foregroundStyle(Ink.mute)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if model.authMethods?.passwordReset == true {
                    LinkText(t("change_password_forgot"), style: Type.linkSmall, action: onForgot)
                }
            }
            .padding(.horizontal, 4)

            if let notice {
                Spacer().frame(height: 14)
                Text(notice.0).wise(Type.caption).foregroundStyle(notice.1).padding(.horizontal, 4)
            }

            Spacer()

            PrimaryButton(t(saving ? "action_saving" : "action_save"), enabled: canSave) {
                saving = true
                error = nil
                model.changePassword(
                    current: current,
                    new: fresh,
                    onDone: {
                        saving = false
                        done = true
                        current = ""
                        fresh = ""
                    },
                    onError: { reason in
                        saving = false
                        error = reason
                    }
                )
            }
        }
        .padding(.horizontal, 28)
        .padding(.top, 16)
        .padding(.bottom, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Ink.card)
    }

    private var notice: (String, Color)? {
        if let error { return (error, Ink.negativeDeep) }
        if done { return (t("change_password_done"), Ink.positiveDeep) }
        return nil
    }

    private func edited() {
        error = nil
        done = false
    }
}
