import SwiftUI

/// The way in. Google first — it is one tap and no password to invent — with
/// email underneath it as the route that always works.
///
/// The Google button is drawn only when the server has an iOS client id
/// configured and says so: a button that cannot possibly succeed is worse than
/// no button.
struct SignInScreen: View {
    @ObservedObject var model: CallsViewModel
    let onUseEmail: () -> Void

    private var busy: Bool { model.signIn.isRunning }
    private var googleUsable: Bool { model.authMethods?.googleUsable == true }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Carries the brand across from the welcome slides, so signing in
            // reads as the next step rather than a different app.
            BrandMark()

            Spacer().frame(height: 22)
            Text(t("auth_title"))
                .wise(Type.heading)
                .foregroundStyle(Ink.text)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 10)
            Text(t("auth_sub"))
                .wise(Type.body)
                .foregroundStyle(Ink.body)
                .fixedSize(horizontal: false, vertical: true)

            Spacer().frame(height: 30)

            if googleUsable {
                OutlineButton(
                    label: t("auth_google"),
                    action: model.signInWithGoogle,
                    enabled: !busy,
                    height: 52,
                    leading: { GoogleG() }
                )

                HStack(spacing: 12) {
                    Rule(Ink.hairline)
                    Text(t("auth_or_email")).wise(Type.fine).foregroundStyle(Ink.mute).fixedSize()
                    Rule(Ink.hairline)
                }
                .padding(.vertical, 22)
            }

            PrimaryButton(t("auth_email_button"), enabled: !busy, action: onUseEmail)

            if busy {
                Spacer().frame(height: 20)
                Spinner().frame(maxWidth: .infinity)
            }

            if let reason = model.signIn.reason {
                Spacer().frame(height: 20)
                Text(reason)
                    .wise(Type.caption)
                    .foregroundStyle(Ink.negativeDeep)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }

            Spacer()

            // Consent sits on the button that gives it, not buried in Settings.
            VStack(spacing: 6) {
                Text(t("auth_consent"))
                    .wise(Type.fine)
                    .foregroundStyle(Ink.mute)
                    .multilineTextAlignment(.center)
                HStack(spacing: 0) {
                    LinkText(t("legal_terms"), style: Type.fine) {
                        Legal.open(Legal.terms, language: model.language)
                    }
                    Text(" · ").wise(Type.fine).foregroundStyle(Ink.mute)
                    LinkText(t("legal_privacy"), style: Type.fine) {
                        Legal.open(Legal.privacy, language: model.language)
                    }
                }
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 28)
        .padding(.top, 56)
        .padding(.bottom, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Ink.card)
        .onAppear { model.loadAuthMethods() }
    }
}

/// Google's own letter, in their blue — the one mark that has to be theirs.
private struct GoogleG: View {
    var body: some View {
        Text("G")
            .font(.custom(Fonts.bold, size: Type.amount.size))
            .foregroundStyle(Ink.google)
            .frame(width: 20, height: 20)
    }
}
