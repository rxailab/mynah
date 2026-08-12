import Foundation
import SwiftUI

/// Turning one sentence into a brief the person can correct.
enum ParseState: Equatable {
    case idle
    case running
    case ready(Brief)
    case failed(String)

    var brief: Brief? {
        if case let .ready(brief) = self { return brief }
        return nil
    }
}

/// Signing in, by either route. ``failed`` is shown on the sign-in screen itself.
enum SignInState: Equatable {
    case idle
    case running
    case failed(String)

    var isRunning: Bool { self == .running }

    var reason: String? {
        if case let .failed(reason) = self { return reason }
        return nil
    }
}

/// Getting their own number cleared to show to the businesses they call.
///
/// ``waiting`` is the whole point of the screen: the code has to be on display
/// before the phone rings, because an unannounced call from a foreign number
/// asking for digits is the shape of a scam and gets hung up on.
enum CallerIdState: Equatable {
    case loading
    case ready(phone: String, callingFrom: String)

    /// - Parameter resumed: true when this is a call that was already ringing
    ///   before the screen opened. Worth distinguishing: someone who has just
    ///   pressed the button is waiting for a phone to ring, whereas someone
    ///   coming back to this has a phone ringing at them now and needs to know
    ///   the digits are the same ones, not a second set.
    case waiting(code: String, phone: String, callingFrom: String, resumed: Bool)
    case verified
    case failed(reason: String, phone: String, callingFrom: String)
}

@MainActor
final class CallsViewModel: ObservableObject {

    private let store = SettingsStore()
    private let api = VoiceCallAPI()

    // MARK: - what the app remembers between launches

    @Published private(set) var settings: ServerSettings
    @Published private(set) var language: Language
    @Published private(set) var firstRun: FirstRun

    // MARK: - what is on screen

    @Published private(set) var calls: [Call] = []
    @Published private(set) var loading = false
    @Published var error: String?

    @Published private(set) var selected: Call?
    @Published private(set) var profile: Profile?
    @Published private(set) var parse: ParseState = .idle
    @Published private(set) var scheduled: [ScheduledCall] = []
    @Published private(set) var usage = Usage()
    @Published private(set) var callerId: CallerIdState = .loading
    @Published private(set) var account: Account?
    @Published private(set) var authMethods: AuthMethods?
    @Published private(set) var signIn: SignInState = .idle

    /// The address a reset is running for, carried between the three screens.
    @Published private(set) var resetEmail = ""

    /// Text for the composer to open with, put here by a template or a saved
    /// business. Held on the view model rather than passed through the route so
    /// a whole sentence does not have to survive URL encoding.
    @Published private(set) var composerSeed: String?

    /// What has been searched for this session. Kept in memory on purpose for
    /// now: it is a convenience, not a record, and persisting someone's search
    /// history is a decision worth making deliberately rather than by default.
    @Published private(set) var recentSearches: [String] = []

    /// Held only until the new password is set; never written to disk.
    private var resetCode = ""

    private var feedTask: Task<Void, Never>?
    private var callerIdPoll: Task<Void, Never>?
    private var balanceWatch: Task<Void, Never>?

    init() {
        settings = store.settings()
        language = store.language()
        firstRun = store.firstRun()
        Localizer.use(language)
    }

    func setLanguage(_ choice: Language) {
        store.saveLanguage(choice)
        Localizer.use(choice)
        language = choice
    }

    func finishWelcome() {
        store.markOnboarded()
        firstRun.welcomeSeen = true
    }

    func finishProfilePrompt() {
        store.markProfilePrompted()
        firstRun.profilePrompted = true
    }

    func finishCoach() {
        store.markCoachSeen()
        firstRun.coachSeen = true
    }

    // MARK: - scheduled calls

    func loadScheduled() {
        guard settings.isSignedIn else { return }
        Task {
            do { scheduled = try await api.scheduled(settings) } catch { report(error) }
        }
    }

    func setScheduledEnabled(_ id: String, _ enabled: Bool) {
        patchScheduled(id, ScheduledPatch(enabled: enabled))
    }

    /// The person has acted on a task that came due — a one-off retires, a
    /// repeat rolls forward to its next slot.
    func dismissScheduled(_ id: String) {
        patchScheduled(id, ScheduledPatch(dismiss: true))
    }

    private func patchScheduled(_ id: String, _ patch: ScheduledPatch) {
        guard settings.isSignedIn else { return }
        Task {
            do {
                let updated = try await api.patchScheduled(settings, id: id, patch: patch)
                scheduled = scheduled.map { $0.id == id ? updated : $0 }
            } catch { report(error) }
        }
    }

    /// Books the brief on the confirm screen for later instead of dialling it.
    ///
    /// One moment, never a repeat — see ``NewScheduledRequest``. The server also
    /// refuses a second pending call for a number that already has one, which
    /// arrives here as an ordinary error with a sentence worth showing.
    func scheduleCall(
        _ request: NewScheduledRequest,
        onDone: @escaping () -> Void,
        onError: @escaping (String) -> Void
    ) {
        Task {
            do {
                let task = try await api.createScheduled(settings, request: request)
                scheduled.insert(task, at: 0)
                onDone()
            } catch {
                if expired(error) { return }
                onError(readable(error))
            }
        }
    }

    func deleteScheduled(_ id: String) {
        guard settings.isSignedIn else { return }
        Task {
            do {
                _ = try await api.deleteScheduled(settings, id: id)
                scheduled.removeAll { $0.id == id }
            } catch { report(error) }
        }
    }

    // MARK: - what the month has cost

    func loadUsage() {
        Task { _ = await fetchUsage() }
    }

    @discardableResult
    private func fetchUsage() async -> Usage? {
        guard settings.isSignedIn else { return nil }
        do {
            let fresh = try await api.usage(settings)
            usage = fresh
            return fresh
        } catch {
            // A missing allowance figure is not worth an error on a screen
            // whose other numbers are all present.
            _ = expired(error)
            return nil
        }
    }

    /// The way to pay: a web page taking cards, WeChat Pay and Alipay.
    ///
    /// The link is fetched on the press rather than kept, because it lasts half
    /// an hour — and handed to the caller rather than opened here, since the two
    /// things to do with it are opening it and sending it to whoever is paying.
    ///
    /// Android also sells packs through Play's billing library. There is no
    /// counterpart here yet: the server verifies a purchase with Google, and an
    /// App Store receipt would need an endpoint of its own to be checked with
    /// Apple. Until that exists this is the only route, and it is the one that
    /// costs no store fee.
    func topUpLink(onReady: @escaping (String) -> Void) {
        Task {
            do { onReady(try await api.payLink(settings).url) } catch { report(error) }
        }
    }

    /// Watches the balance for a few minutes after a top-up link goes out.
    ///
    /// Paying happens in a browser — or on somebody else's phone entirely — and
    /// the credits land on a webhook from Stripe, so there is no result to await
    /// and nothing to bring the app back. Polling only while it could plausibly
    /// arrive is the honest version of a push nobody sends: it stops on the
    /// first change, and gives up rather than running all day.
    func watchForTopUp() {
        balanceWatch?.cancel()
        balanceWatch = Task { [weak self] in
            guard let self else { return }
            let before = usage.balance
            for _ in 0..<36 {
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                if Task.isCancelled { return }
                await fetchUsage()
                if usage.balance != before { return }
            }
        }
    }

    func stopWatchingForTopUp() {
        balanceWatch?.cancel()
        balanceWatch = nil
    }

    // MARK: - the composer's memory

    func seedComposer(_ text: String) { composerSeed = text }

    /// Consumed once, so going back and forward does not retype it.
    func clearComposerSeed() { composerSeed = nil }

    func rememberSearch(_ term: String) {
        let trimmed = term.trimmed
        guard !trimmed.isEmpty else { return }
        var kept = recentSearches.filter { $0.caseInsensitiveCompare(trimmed) != .orderedSame }
        kept.insert(trimmed, at: 0)
        recentSearches = Array(kept.prefix(6))
    }

    // MARK: - accounts

    /// Asks the server which ways in it can honour, before the sign-in screen
    /// draws any buttons. A failure here is a connection problem, not a refusal,
    /// so it lands in the same place a wrong password would.
    func loadAuthMethods() {
        Task {
            do {
                authMethods = try await api.authMethods(settings)
            } catch {
                authMethods = nil
                signIn = .failed(readable(error))
            }
        }
    }

    /// One field pair, two server endpoints. The server cannot tell "no such
    /// account" from "wrong password" on purpose — that difference leaks which
    /// addresses exist — so registering first is what makes one button work for
    /// both: a new address is created, and a taken one (the only 400 left once
    /// the screen has checked the format) falls through to signing in.
    func signInWithEmail(email: String, password: String) {
        signIn = .running
        Task {
            var registered: AuthResponse?
            do {
                registered = try await api.register(settings, email: email.trimmed, password: password, name: nil)
            } catch let error as APIError {
                if error.status != 400 {
                    signIn = .failed(error.message)
                    return
                }
                registered = nil // taken — this is a returning user
            } catch {
                signIn = .failed(readable(error))
                return
            }

            if let registered {
                apply(registered)
                return
            }

            do {
                apply(try await api.login(settings, email: email.trimmed, password: password))
            } catch {
                signIn = .failed(readable(error))
            }
        }
    }

    /// One tap and no password to invent.
    ///
    /// Two round trips: Google's own consent page hands back an ID token, and
    /// the server turns that into a session only after asking Google whether it
    /// is real. Backing out of the sheet is a decision rather than a failure, so
    /// it leaves the screen exactly as it was.
    func signInWithGoogle() {
        guard let clientId = authMethods?.googleIosClientId, !clientId.isBlank else { return }
        signIn = .running
        Task {
            do {
                let token = try await GoogleSignIn.idToken(clientId: clientId)
                apply(try await api.signInWithGoogle(settings, idToken: token))
            } catch GoogleSignIn.Failure.cancelled {
                signIn = .idle
            } catch let GoogleSignIn.Failure.noToken(reason) {
                signIn = .failed(t("auth_google_failed", reason))
            } catch {
                signIn = .failed(readable(error))
            }
        }
    }

    /// The phone route, where a code sent by SMS is the whole of the proof.
    func startPhoneSignIn(_ phone: String, onSent: @escaping () -> Void) {
        signIn = .running
        Task {
            do {
                _ = try await api.startPhoneSignIn(settings, phone: phone.trimmed)
                signIn = .idle
                onSent()
            } catch {
                signIn = .failed(readable(error))
            }
        }
    }

    func checkPhoneCode(phone: String, code: String) {
        signIn = .running
        Task {
            do {
                apply(try await api.checkPhoneCode(settings, phone: phone.trimmed, code: code.trimmed))
            } catch {
                signIn = .failed(readable(error))
            }
        }
    }

    func failSignIn(_ reason: String) { signIn = .failed(reason) }

    func clearSignInError() { signIn = .idle }

    // MARK: - forgetting a password

    /// Asks for a code, and moves on regardless of what comes back.
    ///
    /// The server answers a registered address and an unregistered one
    /// identically, so that it cannot be used to find out who has an account.
    /// The app has to hold that line: showing "no account with that email" here
    /// would hand back exactly the answer the server refused to give. So the
    /// next screen appears either way, and someone who typed the wrong address
    /// finds out by never receiving anything.
    func sendResetCode(_ email: String, onSent: @escaping () -> Void) {
        let address = email.trimmed
        resetEmail = address
        signIn = .running
        Task {
            do {
                _ = try await api.forgotPassword(settings, email: address)
                signIn = .idle
                onSent()
            } catch {
                // A real failure — no mail provider, or no server at all. That
                // is about this deployment, not about the address, so it is safe
                // to show and useless to hide.
                signIn = .failed(readable(error))
            }
        }
    }

    /// Checks nothing on its own — there is no endpoint that only validates a
    /// code, and adding one would be a way to grind through six-digit guesses
    /// without ever committing to a password. The code is carried to the next
    /// screen and spent there, once, together with the new password.
    func holdResetCode(_ code: String) { resetCode = code.trimmed }

    /// Spends the code, sets the password, and signs in with what comes back.
    func resetPassword(_ password: String, onDone: @escaping () -> Void) {
        signIn = .running
        Task {
            do {
                let auth = try await api.resetPassword(
                    settings, email: resetEmail, code: resetCode, password: password
                )
                resetCode = ""
                resetEmail = ""
                apply(auth)
                onDone()
            } catch {
                signIn = .failed(readable(error))
            }
        }
    }

    func clearReset() {
        resetCode = ""
        resetEmail = ""
        signIn = .idle
    }

    /// From Settings, where the current password is the proof.
    func changePassword(
        current: String,
        new: String,
        onDone: @escaping () -> Void,
        onError: @escaping (String) -> Void
    ) {
        Task {
            do {
                _ = try await api.changePassword(settings, currentPassword: current, newPassword: new)
                onDone()
            } catch {
                if expired(error) { return }
                onError(readable(error))
            }
        }
    }

    private func apply(_ response: AuthResponse) {
        account = response.user
        signIn = .idle
        // Saved last: the whole app is gated on the token being there, so
        // writing it is what moves the person off the sign-in screen.
        store.saveToken(response.token)
        settings = store.settings()
    }

    /// Confirms the stored session is still good, and refreshes who it belongs to.
    func loadAccount() {
        guard settings.isSignedIn else { return }
        Task {
            do { account = try await api.me(settings) } catch { _ = expired(error) }
        }
    }

    /// Closes the account for good. The session is dropped either way: if the
    /// server did delete it, the token is dead, and leaving someone apparently
    /// signed in to an account that no longer exists is the worst of both.
    func deleteAccount(onError: @escaping (String) -> Void) {
        Task {
            do {
                _ = try await api.deleteAccount(settings)
            } catch {
                if !expired(error) {
                    onError(readable(error))
                    return
                }
            }
            forgetSession()
        }
    }

    func signOut() {
        Task {
            // Best effort: the session is being abandoned either way, and a
            // server that cannot be reached must not trap anyone signed in.
            _ = try? await api.logout(settings)
            forgetSession()
        }
    }

    private func forgetSession() {
        feedTask?.cancel()
        feedTask = nil
        CallWatch.shared.stopAll()
        account = nil
        profile = nil
        selected = nil
        parse = .idle
        calls = []
        loading = false
        error = nil
        store.saveToken("")
        settings = store.settings()
    }

    /// A dead session is not an error worth showing — the screens are about to
    /// be replaced by the sign-in one. Returns true when it handled the failure.
    @discardableResult
    private func expired(_ error: Error) -> Bool {
        guard let api = error as? APIError, api.isUnauthorised else { return false }
        forgetSession()
        return true
    }

    // MARK: - one sentence, turned into a brief

    /// Sends one sentence to be turned into a brief. Nothing is dialled — the
    /// result is shown back for correction, which is why the parser is allowed
    /// to leave fields empty rather than guess at them.
    func parseRequest(_ text: String) {
        parse = .running
        Task {
            do {
                let brief = try await api.parse(settings, text: text)
                // A stale global error (a failed refresh, say) has no business
                // sitting above a brief that just parsed fine.
                error = nil
                parse = .ready(brief)
            } catch {
                parse = .failed(readable(error))
            }
        }
    }

    /// Keeps the user's corrections in the state the screen reads from.
    func editBrief(_ brief: Brief) { parse = .ready(brief) }

    func clearParse() { parse = .idle }

    // MARK: - who the assistant calls for

    /// Reads the name and phone number the server already has, to prefill Settings.
    func loadProfile() {
        guard settings.isSignedIn else { return }
        Task {
            do { profile = try await api.getProfile(settings) } catch { _ = expired(error) }
        }
    }

    /// The name the assistant gives, and the number a hand-over rings.
    func saveProfile(
        ownerName: String,
        ownerPhone: String,
        onDone: @escaping () -> Void,
        onError: @escaping (String) -> Void
    ) {
        Task {
            do {
                profile = try await api.saveProfile(
                    settings,
                    profile: Profile(ownerName: ownerName.trimmed, ownerPhone: ownerPhone.trimmed)
                )
                // The name here is the same field the account header renders, so
                // the header is now stale. Without this it keeps showing the name
                // from sign-in until the app is restarted — and the one it shows
                // is not the one the assistant gives out on a call.
                loadAccount()
                refresh()
                onDone()
            } catch {
                if expired(error) { return }
                onError(readable(error))
            }
        }
    }

    // MARK: - caller ID

    /// The last answer from the server, kept so a failure can still say which
    /// number was involved and which one was going to ring.
    private var lastCallerId = CallerId()

    private func state(of callerId: CallerId) -> CallerIdState {
        if callerId.verified { return .verified }
        if !callerId.pendingCode.isBlank {
            return .waiting(
                code: callerId.pendingCode,
                phone: callerId.phone,
                callingFrom: callerId.callingFrom,
                resumed: true
            )
        }
        return .ready(phone: callerId.phone, callingFrom: callerId.callingFrom)
    }

    /// Where the caller ID stands. The server asks Twilio rather than trusting
    /// its own copy, and tells us about a verification call still ringing — so
    /// reopening the screen mid-call lands back on the same six digits instead
    /// of offering to place a second call.
    func loadCallerId() {
        guard settings.isSignedIn else { return }
        Task {
            do {
                lastCallerId = try await api.callerId(settings)
                callerId = state(of: lastCallerId)
                if case .waiting = callerId { watchCallerId() }
            } catch {
                if expired(error) { return }
                callerId = .failed(
                    reason: readable(error),
                    phone: lastCallerId.phone,
                    callingFrom: lastCallerId.callingFrom
                )
            }
        }
    }

    /// Asks Twilio to ring them and hands back the code they will have to key
    /// in. The code arrives before the call is placed, which is the whole reason
    /// the server sets a delay: the screen gets to say what is about to happen
    /// before the phone rings.
    ///
    /// - Parameter force: place a new call even though one is already ringing.
    ///   This is the "ring me again" path and nothing else: by default the server
    ///   hands back the code from the call in flight, because two live codes and
    ///   two incoming calls is worse than waiting a little longer for the first.
    func startCallerIdVerification(force: Bool = false) {
        guard settings.isSignedIn else { return }
        callerId = .loading
        Task {
            do {
                let started = try await api.startCallerIdVerification(settings, force: force)
                callerId = .waiting(
                    code: started.code,
                    phone: started.phone,
                    callingFrom: started.callingFrom,
                    resumed: started.resumed
                )
                watchCallerId()
            } catch {
                if expired(error) { return }
                callerId = .failed(
                    reason: readable(error),
                    phone: lastCallerId.phone,
                    callingFrom: lastCallerId.callingFrom
                )
            }
        }
    }

    /// Keeps asking while the call is in flight. Twilio's webhook is what
    /// actually records the result server-side; this is only how the screen
    /// finds out, and it has to poll because there is nothing pushing to the
    /// phone. A poll that fails is a dropped request, not a failed
    /// verification — the loop keeps going.
    private func watchCallerId() {
        callerIdPoll?.cancel()
        callerIdPoll = Task { [weak self] in
            guard let self else { return }
            let deadline = Date().addingTimeInterval(3 * 60)
            while !Task.isCancelled, Date() < deadline {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                if Task.isCancelled { return }
                guard let answer = try? await api.callerId(settings) else { continue }
                if answer.verified {
                    lastCallerId = answer
                    callerId = .verified
                    loadProfile()
                    return
                }
            }
        }
    }

    /// Stop presenting their number. This also gives it back to Twilio rather
    /// than only forgetting it here: a number left on the account is one we could
    /// still put on a call, and one we said we were no longer holding.
    func releaseCallerId() {
        guard settings.isSignedIn else { return }
        Task {
            do {
                _ = try await api.releaseCallerId(settings)
                lastCallerId.verified = false
                callerId = state(of: lastCallerId)
                loadProfile()
            } catch { report(error) }
        }
    }

    /// Leaving the screen. The verification itself carries on at Twilio's end.
    func stopWatchingCallerId() {
        callerIdPoll?.cancel()
        callerIdPoll = nil
    }

    // MARK: - the calls themselves

    func clearError() { error = nil }

    /// - Parameter quiet: true for background polling, so the spinner doesn't flicker.
    func refresh(quiet: Bool = false) {
        guard settings.isSignedIn else {
            error = t("error_configure_first")
            return
        }
        Task {
            if !quiet {
                loading = true
                error = nil
            }
            do {
                calls = try await api.listCalls(settings)
                loading = false
            } catch {
                if expired(error) { return }
                loading = false
                if !quiet { self.error = readable(error) }
            }
        }
    }

    /// - Parameter onNeedsTopUp: the account has run out of calls. Separate from
    ///   the error path because it is the one refusal with something to be done
    ///   about it — the composer sends them to the shop rather than leaving a
    ///   message on a screen with no way forward.
    func createCall(
        _ request: NewCallRequest,
        onPlaced: @escaping (String) -> Void,
        onNeedsTopUp: @escaping () -> Void = {}
    ) {
        Task {
            loading = true
            error = nil
            do {
                let call = try await api.createCall(settings, request: request)
                loading = false
                calls.insert(call, at: 0)
                // The balance just went down by one; the plan screen should not
                // have to be told by the server what this call already knows.
                usage.used += 1
                usage.balance = max(0, usage.balance - 1)
                // Follow it from the background too, so "needs you" reaches the
                // phone even with the app off screen.
                CallWatch.shared.start(settings: settings, callId: call.id)
                onPlaced(call.id)
            } catch {
                if expired(error) { return }
                loading = false
                self.error = readable(error)
                if let api = error as? APIError, api.needsCredits {
                    // Refreshed on the way, so the shop opens showing a real
                    // zero rather than whatever was last cached.
                    loadUsage()
                    onNeedsTopUp()
                }
            }
        }
    }

    /// Places the same call again — for the ones that rang out.
    func redial(_ call: Call, onPlaced: @escaping (String) -> Void = { _ in }) {
        createCall(
            NewCallRequest(
                goal: call.goal,
                phoneNumber: call.phoneNumber,
                businessName: call.businessName,
                template: call.template,
                constraints: call.constraints,
                language: call.language
            ),
            onPlaced: onPlaced
        )
    }

    /// How the call went, in the caller's own judgement. Merged straight back
    /// into the call so the detail screen stops asking.
    ///
    /// The screen says it plainly and so does this: nothing here rings anybody
    /// back or reaches the business. It is a note about the assistant.
    func sendFeedback(
        callId: String,
        verdict: String,
        reasons: [String] = [],
        note: String = "",
        onDone: @escaping () -> Void = {}
    ) {
        Task {
            do {
                let saved = try await api.sendFeedback(
                    settings,
                    id: callId,
                    request: FeedbackRequest(verdict: verdict, reasons: reasons, note: note)
                )
                calls = calls.map { call in
                    guard call.id == callId else { return call }
                    var updated = call
                    updated.feedback = saved
                    return updated
                }
                if selected?.id == callId { selected?.feedback = saved }
                onDone()
            } catch { report(error) }
        }
    }

    /// Forgets one call, here and on the server.
    ///
    /// The row goes as soon as the server confirms rather than optimistically:
    /// this is not undoable, and a row that vanishes and comes back because the
    /// request failed is worse than one that takes a moment to go.
    func deleteCall(_ callId: String, onDone: @escaping () -> Void = {}) {
        Task {
            do {
                _ = try await api.deleteCall(settings, id: callId)
                calls.removeAll { $0.id == callId }
                if selected?.id == callId {
                    feedTask?.cancel()
                    feedTask = nil
                    selected = nil
                }
                onDone()
            } catch { report(error) }
        }
    }

    func hangUp(_ callId: String) {
        Task {
            do { merge(try await api.hangUp(settings, id: callId)) } catch { report(error) }
        }
    }

    /// Types a line into a live call. The note comes straight back over the
    /// socket as an "owner" transcript entry, so there is nothing to append
    /// locally — if it does not appear, it did not arrive.
    func sendNote(callId: String, text: String) {
        let trimmed = text.trimmed
        guard !trimmed.isEmpty else { return }
        Task {
            do { _ = try await api.sendNote(settings, id: callId, text: trimmed) } catch { report(error) }
        }
    }

    /// Step into a call that is already running — rings your number and bridges
    /// you in.
    func takeOver(_ callId: String) {
        Task {
            do { merge(try await api.takeOver(settings, id: callId)) } catch { report(error) }
        }
    }

    /// Loads a call and follows it live until ``stopWatching()``. The socket is
    /// reopened if it drops, because a dropped feed during a live call is
    /// indistinguishable on screen from a call where nobody is saying anything.
    func watch(_ callId: String) {
        feedTask?.cancel()
        selected = calls.first { $0.id == callId }

        feedTask = Task { [weak self] in
            guard let self else { return }
            var backoff: UInt64 = 1_000_000_000

            while !Task.isCancelled {
                // Re-fetching on every attempt also repairs the transcript,
                // which may have advanced while the socket was down.
                do {
                    let fresh = try await api.getCall(settings, id: callId)
                    selected = fresh
                    putInList(fresh)
                    // Opening a live call also puts it under the watch, so
                    // leaving the app does not mean missing the transfer.
                    if fresh.isLive { CallWatch.shared.start(settings: settings, callId: fresh.id) }
                    backoff = 1_000_000_000
                } catch {
                    if expired(error) { return }
                    self.error = readable(error)
                    if selected == nil { return }
                }

                if let feed = try? api.liveFeed(settings, callId: callId) {
                    for await event in feed {
                        if Task.isCancelled { return }
                        switch event.type {
                        case "transcript":
                            if let entry = event.entry { selected?.transcript.append(entry) }
                        // A line's translation lands after the line itself,
                        // matched on its timestamp.
                        case "translation":
                            if let at = event.at, let text = event.translation {
                                selected?.transcript = (selected?.transcript ?? []).map { line in
                                    guard line.at == at else { return line }
                                    var updated = line
                                    updated.translation = text
                                    return updated
                                }
                            }
                        default:
                            if let call = event.call { merge(call) }
                        }
                    }
                }

                // A closed socket on a finished call is the normal ending.
                if selected?.isLive != true { return }
                if Task.isCancelled { return }

                try? await Task.sleep(nanoseconds: backoff)
                backoff = min(backoff * 2, 8_000_000_000)
            }
        }
    }

    func stopWatching() {
        feedTask?.cancel()
        feedTask = nil
        selected = nil
    }

    /// Status updates arrive without a transcript, so keep whatever we have
    /// already streamed rather than blanking the conversation on every change.
    private func merge(_ incoming: Call) {
        if let existing = selected, existing.id == incoming.id {
            if incoming.transcript.isEmpty {
                var kept = incoming
                kept.transcript = existing.transcript
                selected = kept
            } else {
                selected = incoming
            }
        }
        putInList(incoming)
    }

    private func putInList(_ incoming: Call) {
        var summary = incoming
        summary.transcript = []
        if let index = calls.firstIndex(where: { $0.id == incoming.id }) {
            calls[index] = summary
        } else {
            calls.insert(summary, at: 0)
        }
    }

    // MARK: - failures

    private func report(_ error: Error) {
        if expired(error) { return }
        self.error = readable(error)
    }

    private func readable(_ error: Error) -> String {
        if let api = error as? APIError { return api.message }
        let message = error.localizedDescription
        return message.isEmpty ? t("error_generic") : message
    }
}
