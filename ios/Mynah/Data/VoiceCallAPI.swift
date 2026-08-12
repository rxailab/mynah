import Foundation

/// Thin client over the VoiceCall server. Every call takes the current
/// ``ServerSettings`` so a change of address or session takes effect
/// immediately without rebuilding anything.
struct VoiceCallAPI {

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.waitsForConnectivity = false
        return URLSession(configuration: config)
    }()

    private let decoder = JSONDecoder()

    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        // The server reads a missing key as "not set"; kotlinx does the same on
        // Android with explicitNulls = false. Swift's synthesised encoding
        // already omits a nil, so there is nothing to configure — this is only
        // here to keep the output stable and readable in a proxy.
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()

    // MARK: - accounts
    // These run before there is a session, so they take an address and no
    // token. Everything below them requires one.
    //
    // The server mounts them under /api/auth, not /auth — hitting the latter
    // gets a 404 that reads like the endpoint does not exist at all.

    func authMethods(_ settings: ServerSettings) async throws -> AuthMethods {
        try await execute(settings, "/api/auth/methods", "GET", needsToken: false)
    }

    func register(_ settings: ServerSettings, email: String, password: String, name: String?) async throws -> AuthResponse {
        try await open(settings, "/api/auth/register", RegisterRequest(email: email, password: password, name: name))
    }

    func login(_ settings: ServerSettings, email: String, password: String) async throws -> AuthResponse {
        try await open(settings, "/api/auth/login", LoginRequest(email: email, password: password))
    }

    func startPhoneSignIn(_ settings: ServerSettings, phone: String) async throws -> OkResponse {
        try await open(settings, "/api/auth/phone/start", PhoneStartRequest(phone: phone))
    }

    func checkPhoneCode(_ settings: ServerSettings, phone: String, code: String) async throws -> AuthResponse {
        try await open(settings, "/api/auth/phone/check", PhoneCheckRequest(phone: phone, code: code))
    }

    /// Trades a Google ID token for a session. The server checks the token with
    /// Google itself — this app is not a place to decide who someone is.
    func signInWithGoogle(_ settings: ServerSettings, idToken: String) async throws -> AuthResponse {
        try await open(settings, "/api/auth/google", GoogleSignInRequest(idToken: idToken))
    }

    /// Asks for a reset code. Answers the same way whether or not the address
    /// has an account — the server will not say, and neither should the screen.
    func forgotPassword(_ settings: ServerSettings, email: String) async throws -> OkResponse {
        try await open(settings, "/api/auth/password/forgot", ForgotPasswordRequest(email: email))
    }

    /// Spends the code, sets the password, and hands back a session.
    func resetPassword(_ settings: ServerSettings, email: String, code: String, password: String) async throws -> AuthResponse {
        try await open(settings, "/api/auth/password/reset",
                       ResetPasswordRequest(email: email, code: code, password: password))
    }

    /// From inside the app, where the current password is the proof.
    func changePassword(_ settings: ServerSettings, currentPassword: String, newPassword: String) async throws -> OkResponse {
        try await post(settings, "/api/auth/password",
                       ChangePasswordRequest(currentPassword: currentPassword, newPassword: newPassword))
    }

    func sendFeedback(_ settings: ServerSettings, id: String, request: FeedbackRequest) async throws -> Feedback {
        try await post(settings, "/api/calls/\(id)/feedback", request)
    }

    func me(_ settings: ServerSettings) async throws -> Account {
        try await execute(settings, "/api/auth/me", "GET", as: MeResponse.self).user
    }

    func logout(_ settings: ServerSettings) async throws -> OkResponse {
        try await post(settings, "/api/auth/logout", Empty())
    }

    /// Closes the account and erases everything belonging to it. Irreversible on
    /// the server — there is no soft delete to undo.
    func deleteAccount(_ settings: ServerSettings) async throws -> OkResponse {
        try await execute(settings, "/api/auth/me", "DELETE")
    }

    func usage(_ settings: ServerSettings) async throws -> Usage {
        try await execute(settings, "/api/usage", "GET")
    }

    /// A web address for paying by card, WeChat Pay or Alipay. Issued fresh each
    /// time and short-lived, so it is asked for when the button is pressed
    /// rather than held on to.
    func payLink(_ settings: ServerSettings) async throws -> PayLink {
        try await post(settings, "/api/billing/link", Empty())
    }

    func serverConfig(_ settings: ServerSettings) async throws -> ServerConfig {
        try await execute(settings, "/api/config", "GET")
    }

    func listCalls(_ settings: ServerSettings) async throws -> [Call] {
        try await execute(settings, "/api/calls", "GET", as: CallsResponse.self).calls
    }

    func getCall(_ settings: ServerSettings, id: String) async throws -> Call {
        try await execute(settings, "/api/calls/\(id)", "GET")
    }

    func createCall(_ settings: ServerSettings, request: NewCallRequest) async throws -> Call {
        try await post(settings, "/api/calls", request)
    }

    func parse(_ settings: ServerSettings, text: String) async throws -> Brief {
        try await post(settings, "/api/parse", ParseRequest(text: text))
    }

    func getProfile(_ settings: ServerSettings) async throws -> Profile {
        try await execute(settings, "/api/profile", "GET")
    }

    func saveProfile(_ settings: ServerSettings, profile: Profile) async throws -> Profile {
        try await send(settings, "/api/profile", "PUT", body: profile)
    }

    /// Caller ID: whether the business sees their number or ours. The server
    /// asks Twilio on every check rather than trusting its own copy, so this is
    /// also what the verify screen polls while waiting for the call to be
    /// answered.
    func callerId(_ settings: ServerSettings) async throws -> CallerId {
        try await execute(settings, "/api/caller-id", "GET")
    }

    /// - Parameter force: place a new call even if one is already ringing. Only
    ///   for "ring me again" — without it the server hands back the code from the
    ///   call already in flight rather than starting a second one.
    func startCallerIdVerification(_ settings: ServerSettings, force: Bool = false) async throws -> CallerIdVerification {
        try await post(settings, "/api/caller-id/verify", ForceRequest(force: force))
    }

    func releaseCallerId(_ settings: ServerSettings) async throws -> OkResponse {
        try await execute(settings, "/api/caller-id", "DELETE")
    }

    // MARK: - scheduled calls
    // None of these dial. The server marks a task ready when its time comes and
    // the app walks it through the same check step as any other call.

    func scheduled(_ settings: ServerSettings) async throws -> [ScheduledCall] {
        try await execute(settings, "/api/scheduled", "GET", as: ScheduledResponse.self).tasks
    }

    func createScheduled(_ settings: ServerSettings, request: NewScheduledRequest) async throws -> ScheduledCall {
        try await post(settings, "/api/scheduled", request)
    }

    func patchScheduled(_ settings: ServerSettings, id: String, patch: ScheduledPatch) async throws -> ScheduledCall {
        try await send(settings, "/api/scheduled/\(id)", "PATCH", body: patch)
    }

    func deleteScheduled(_ settings: ServerSettings, id: String) async throws -> OkResponse {
        try await execute(settings, "/api/scheduled/\(id)", "DELETE")
    }

    /// Forgets one call. Irreversible on the server — there is no bin to
    /// restore from, and a call still on the line is refused rather than queued.
    func deleteCall(_ settings: ServerSettings, id: String) async throws -> OkResponse {
        try await execute(settings, "/api/calls/\(id)", "DELETE")
    }

    func hangUp(_ settings: ServerSettings, id: String) async throws -> Call {
        try await post(settings, "/api/calls/\(id)/hangup", Empty())
    }

    func takeOver(_ settings: ServerSettings, id: String) async throws -> Call {
        try await post(settings, "/api/calls/\(id)/takeover", Empty())
    }

    /// A line typed mid-call, for the assistant to act on.
    func sendNote(_ settings: ServerSettings, id: String, text: String) async throws -> OkResponse {
        try await post(settings, "/api/calls/\(id)/note", NoteRequest(text: text))
    }

    /// Live transcript and status for one call. The stream ends when the socket
    /// closes; reconnection is the caller's business.
    func liveFeed(_ settings: ServerSettings, callId: String) throws -> AsyncStream<FeedEvent> {
        guard let base = settings.normalisedBase() else { throw APIError(message: t("error_need_https")) }
        // URLSession wants the ws:// scheme rather than upgrading an https://
        // request the way OkHttp does on Android.
        let socketBase = base
            .replacingOccurrences(of: "https://", with: "wss://")
            .replacingOccurrences(of: "http://", with: "ws://")
        guard var components = URLComponents(string: "\(socketBase)/app") else {
            throw APIError(message: t("error_bad_url"))
        }
        components.queryItems = [
            URLQueryItem(name: "ref", value: callId),
            URLQueryItem(name: "token", value: settings.apiToken),
        ]
        guard let url = components.url else { throw APIError(message: t("error_bad_url")) }

        let task = session.webSocketTask(with: url)
        let decoder = decoder
        return AsyncStream { continuation in
            task.resume()

            func receive() {
                task.receive { result in
                    switch result {
                    case let .success(message):
                        let text: String? = switch message {
                        case let .string(value): value
                        case let .data(data): String(data: data, encoding: .utf8)
                        @unknown default: nil
                        }
                        if let text, let data = text.data(using: .utf8),
                           let event = try? decoder.decode(FeedEvent.self, from: data) {
                            continuation.yield(event)
                        }
                        receive()
                    case .failure:
                        continuation.finish()
                    }
                }
            }
            receive()

            continuation.onTermination = { _ in
                task.cancel(with: .goingAway, reason: nil)
            }
        }
    }

    // MARK: - plumbing

    private struct Empty: Encodable {}

    private func post<Body: Encodable, T: Decodable>(
        _ settings: ServerSettings, _ path: String, _ body: Body
    ) async throws -> T {
        try await send(settings, path, "POST", body: body)
    }

    /// A POST made before anyone is signed in.
    private func open<Body: Encodable, T: Decodable>(
        _ settings: ServerSettings, _ path: String, _ body: Body
    ) async throws -> T {
        try await send(settings, path, "POST", body: body, needsToken: false)
    }

    private func send<Body: Encodable, T: Decodable>(
        _ settings: ServerSettings,
        _ path: String,
        _ method: String,
        body: Body,
        needsToken: Bool = true
    ) async throws -> T {
        try await execute(settings, path, method, body: try encoder.encode(body), needsToken: needsToken)
    }

    private func execute<T: Decodable>(
        _ settings: ServerSettings,
        _ path: String,
        _ method: String,
        body: Data? = nil,
        needsToken: Bool = true,
        as type: T.Type = T.self
    ) async throws -> T {
        guard let base = settings.normalisedBase() else { throw APIError(message: t("error_need_address")) }
        if needsToken, settings.apiToken.isBlank { throw APIError(message: t("error_need_token")) }
        guard let url = URL(string: base + path) else { throw APIError(message: t("error_bad_url")) }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        if body != nil {
            request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        }
        if !settings.apiToken.isBlank {
            request.setValue("Bearer \(settings.apiToken)", forHTTPHeaderField: "Authorization")
        }
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError(message: t("error_unreachable", error.localizedDescription))
        }

        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else { throw failure(code, data) }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError(message: t("error_unexpected_body", error.localizedDescription))
        }
    }

    private func failure(_ code: Int, _ body: Data) -> APIError {
        let parsed = try? decoder.decode(ApiErrorBody.self, from: body)
        // The server's own message wins when it has one: it knows why it
        // refused. Those come back in English — see the note in the README.
        let message: String
        if let served = parsed?.error, !served.isBlank {
            message = served
        } else if code == 401 {
            message = t("error_bad_token")
        } else if code == 404 {
            message = t("error_no_such_call")
        } else {
            message = t("error_http", code)
        }
        return APIError(message: message, status: code, needsCredits: parsed?.needsCredits == true)
    }
}
