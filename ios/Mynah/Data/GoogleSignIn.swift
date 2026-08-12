import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

/// Signing in with Google, without Google's SDK.
///
/// This is the OAuth flow Google publishes for native apps: open the consent
/// page in the system browser, get an authorization code back on a custom
/// scheme, and trade it for an ID token. PKCE stands in for the client secret
/// that a public client cannot keep — the code is worthless without the verifier
/// that only this process holds.
///
/// Done by hand rather than with `GoogleSignIn-iOS` for two reasons. The app has
/// no third-party dependencies and adding one for a single button is a poor
/// trade; and `ASWebAuthenticationSession` intercepts the callback itself, so
/// the redirect scheme never has to be registered in Info.plist — which is what
/// lets the client id arrive from the server at runtime, the way the Android app
/// already reads it from `/api/auth/methods`.
///
/// The ID token that comes back is handed to our own server, which checks it
/// with Google before it means anything. This app is not a place to decide who
/// somebody is.
@MainActor
enum GoogleSignIn {

    enum Failure: Error {
        /// The person backed out of the sheet. A decision, not an error.
        case cancelled
        case badClientId
        case noToken(String)
    }

    /// - Parameter clientId: the iOS OAuth client id, as served by the server.
    /// - Returns: a Google ID token to trade for a session.
    static func idToken(clientId: String) async throws -> String {
        // Google's iOS clients redirect to the client id reversed, which is
        // also a scheme nobody else can claim.
        guard let suffix = clientId.split(separator: ".").first, !suffix.isEmpty else {
            throw Failure.badClientId
        }
        let scheme = "com.googleusercontent.apps.\(suffix)"
        let redirect = "\(scheme):/oauth2redirect"

        let verifier = randomVerifier()
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncoded
        let state = randomVerifier()

        var authorise = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        authorise.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirect),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
        ]
        guard let url = authorise.url else { throw Failure.badClientId }

        let callback = try await present(url, scheme: scheme)

        let returned = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        // A mismatched state means the answer is not to the question we asked.
        guard returned.first(where: { $0.name == "state" })?.value == state else {
            throw Failure.noToken(t("auth_google_failed"))
        }
        if let error = returned.first(where: { $0.name == "error" })?.value {
            throw error == "access_denied" ? Failure.cancelled : Failure.noToken(error)
        }
        guard let code = returned.first(where: { $0.name == "code" })?.value else {
            throw Failure.noToken(t("auth_google_failed"))
        }

        return try await exchange(code: code, verifier: verifier, clientId: clientId, redirect: redirect)
    }

    /// The consent page, in the system browser. `ASWebAuthenticationSession` is
    /// what Google asks native apps to use: the app never sees the password, and
    /// the browser's own session is what makes a second sign-in one tap.
    private static func present(_ url: URL, scheme: String) async throws -> URL {
        let anchor = PresentationAnchor()
        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { callback, error in
                if let callback {
                    continuation.resume(returning: callback)
                } else if let error = error as? ASWebAuthenticationSessionError,
                          error.code == .canceledLogin {
                    continuation.resume(throwing: Failure.cancelled)
                } else {
                    continuation.resume(throwing: Failure.noToken(error?.localizedDescription ?? t("auth_google_failed")))
                }
            }
            session.presentationContextProvider = anchor
            // Ask for a fresh choice of account rather than silently reusing the
            // browser's: on a shared phone the useful answer is "which of these
            // is you", not "the one Safari happens to be signed in as".
            session.prefersEphemeralWebBrowserSession = false
            anchor.retain(session)
            if !session.start() {
                continuation.resume(throwing: Failure.noToken(t("auth_google_failed")))
            }
        }
    }

    /// The code, spent once, for the ID token. No client secret: an app cannot
    /// keep one, so Google issues iOS clients without one and takes the PKCE
    /// verifier as the proof instead.
    private static func exchange(
        code: String,
        verifier: String,
        clientId: String,
        redirect: String
    ) async throws -> String {
        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        var body = URLComponents()
        body.queryItems = [
            URLQueryItem(name: "code", value: code),
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirect),
            URLQueryItem(name: "grant_type", value: "authorization_code"),
            URLQueryItem(name: "code_verifier", value: verifier),
        ]
        request.httpBody = body.percentEncodedQuery.map { Data($0.utf8) }

        let (data, response) = try await URLSession.shared.data(for: request)
        let answer = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let token = answer?["id_token"] as? String, !token.isEmpty
        else {
            let described = (answer?["error_description"] as? String)
                ?? (answer?["error"] as? String)
                ?? t("auth_google_failed")
            throw Failure.noToken(described)
        }
        return token
    }

    private static func randomVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64URLEncoded
    }
}

/// Where the sheet is anchored, and what keeps the session alive while it is
/// open — `ASWebAuthenticationSession` is not retained by the system.
private final class PresentationAnchor: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    func retain(_ session: ASWebAuthenticationSession) { self.session = session }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}

private extension Data {
    /// base64url, the encoding every OAuth field on this page is written in.
    var base64URLEncoded: String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
