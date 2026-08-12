import Foundation

// Every type the server sends decodes leniently: a missing key falls back to
// the same default the Android app declares, so one side adding a field never
// breaks the other. Requests encode with the synthesised conformance, which
// leaves a nil out rather than sending null — matching kotlinx's
// `explicitNulls = false`.

extension KeyedDecodingContainer {
    /// A value, or the default when the key is absent, null, or the wrong shape.
    func value<T: Decodable>(_ key: Key, _ fallback: T) -> T {
        ((try? decodeIfPresent(T.self, forKey: key)) ?? nil) ?? fallback
    }

    func optional<T: Decodable>(_ key: Key) -> T? {
        ((try? decodeIfPresent(T.self, forKey: key)) ?? nil)
    }
}

/// One call task. The list endpoint omits ``transcript``; the detail endpoint
/// and the live feed include it, so it defaults to empty rather than being a
/// separate type.
struct Call: Decodable, Identifiable, Equatable {
    let id: String
    var phoneNumber: String
    var businessName: String
    var template: String
    var goal: String
    var constraints: [String] = []
    /// What the assistant speaks on the line — matches the callee, not the app.
    var language: String = "en"
    var cost: Cost?
    var status: String
    /// Queueing rather than talking, as the assistant reports it.
    ///
    /// ``holdSeconds`` is what the server had banked when it last pushed, and
    /// ``holdingSince`` is when the current wait started — the feed only pushes
    /// on a change, so the running total has to be worked out here. Use
    /// ``holdSoFarSeconds(now:)`` rather than either on its own.
    var onHold: Bool = false
    var holdingSince: Int?
    var holdSeconds: Int = 0
    /// Whether this call may accept a callback instead of queueing.
    var acceptCallback: Bool = false
    /// What this call has to get through, ticked off as it goes.
    var steps: [Step] = []
    var results: [String: String] = [:]
    var outcome: String?
    var summary: String?
    var summaryTranslation: String?
    /// Nil until it has been rated, so the detail screen asks only once.
    var feedback: Feedback?
    var error: String?
    var createdAt: Int
    var endedAt: Int?
    var transcript: [TranscriptEntry] = []

    var isLive: Bool {
        [CallStatus.queued, CallStatus.dialing, CallStatus.inProgress, CallStatus.transferring]
            .contains(status)
    }

    /// Total time queueing, including the stretch still running.
    func holdSoFarSeconds(now: Int) -> Int {
        let running = holdingSince.map { max(0, (now - $0) / 1000) } ?? 0
        return holdSeconds + running
    }

    enum CodingKeys: String, CodingKey {
        case id, phoneNumber, businessName, template, goal, constraints, language, cost, status
        case onHold, holdingSince, holdSeconds, acceptCallback, steps, results, outcome
        case summary, summaryTranslation, feedback, error, createdAt, endedAt, transcript
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.value(.id, "")
        phoneNumber = c.value(.phoneNumber, "")
        businessName = c.value(.businessName, "")
        template = c.value(.template, CallTemplate.custom.id)
        goal = c.value(.goal, "")
        constraints = c.value(.constraints, [])
        language = c.value(.language, "en")
        cost = c.optional(.cost)
        status = c.value(.status, CallStatus.queued)
        onHold = c.value(.onHold, false)
        holdingSince = c.optional(.holdingSince)
        holdSeconds = c.value(.holdSeconds, 0)
        acceptCallback = c.value(.acceptCallback, false)
        steps = c.value(.steps, [])
        results = c.value(.results, [:])
        outcome = c.optional(.outcome)
        summary = c.optional(.summary)
        summaryTranslation = c.optional(.summaryTranslation)
        feedback = c.optional(.feedback)
        error = c.optional(.error)
        createdAt = c.value(.createdAt, 0)
        endedAt = c.optional(.endedAt)
        transcript = c.value(.transcript, [])
    }
}

struct Step: Decodable, Equatable {
    var label: String = ""
    var done: Bool = false

    enum CodingKeys: String, CodingKey { case label, done }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        label = c.value(.label, "")
        done = c.value(.done, false)
    }

    init(label: String, done: Bool = false) {
        self.label = label
        self.done = done
    }
}

/// What the caller made of the call afterwards. ``verdict`` is the whole of the
/// required answer — reasons and note are both optional, because a rating that
/// demands an essay gets neither.
struct Feedback: Decodable, Equatable {
    var verdict: String = ""
    var reasons: [String] = []
    var note: String = ""
    var at: Int = 0

    enum CodingKeys: String, CodingKey { case verdict, reasons, note, at }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        verdict = c.value(.verdict, "")
        reasons = c.value(.reasons, [])
        note = c.value(.note, "")
        at = c.value(.at, 0)
    }
}

struct FeedbackRequest: Encodable {
    var verdict: String
    var reasons: [String] = []
    var note: String = ""
}

/// The reasons the server will accept. Anything else it drops on the floor.
enum FeedbackReason {
    static let wrongDetails = "wrong_details"
    static let misheard = "misheard"
    static let tooWordy = "too_wordy"
    static let queuedTooLong = "queued_too_long"
    static let other = "other"

    static let all = [wrongDetails, misheard, tooWordy, queuedTooLong, other]
}

/// What a call cost, once Twilio has rated it.
///
/// ``price`` is the total, and it is part measured and part worked out:
/// ``voice`` is what Twilio charged for the phone line, ``relay`` is the speech
/// relay's share derived from the duration, because Twilio bills that monthly
/// with no per-call price. Relay is the larger half — around 80% of a long
/// call — so leaving it out understated a call several times over. It does mean
/// the total is an estimate, which ``estimated`` says out loud.
struct Cost: Decodable, Equatable {
    var price: String = ""
    var voice: String = ""
    var relay: String = ""
    var estimated: Bool = false
    var unit: String = ""
    var durationSeconds: Int = 0

    enum CodingKeys: String, CodingKey { case price, voice, relay, estimated, unit, durationSeconds }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        price = c.value(.price, "")
        voice = c.value(.voice, "")
        relay = c.value(.relay, "")
        estimated = c.value(.estimated, false)
        unit = c.value(.unit, "")
        durationSeconds = c.value(.durationSeconds, 0)
    }
}

struct TranscriptEntry: Decodable, Equatable {
    var speaker: String = ""
    var text: String = ""
    var at: Int = 0
    /// The line in the other language, filled in shortly after it was spoken.
    /// Nil means not translated yet — or not at all, which the UI treats the
    /// same way: show the line as it was said.
    var translation: String?

    enum CodingKeys: String, CodingKey { case speaker, text, at, translation }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        speaker = c.value(.speaker, "")
        text = c.value(.text, "")
        at = c.value(.at, 0)
        translation = c.optional(.translation)
    }
}

enum CallStatus {
    static let queued = "queued"
    static let dialing = "dialing"
    static let inProgress = "in_progress"
    static let transferring = "transferring"
    static let completed = "completed"
    static let failed = "failed"
}

enum Speaker {
    static let agent = "agent"
    static let caller = "caller"
    static let system = "system"
    /// You, typing into the live call from this app.
    static let owner = "owner"
}

/// Call templates the server knows how to brief the agent for.
enum CallTemplate: String, CaseIterable, Identifiable {
    case restaurant, appointment, bank, custom

    var id: String { rawValue }

    var label: String {
        switch self {
        case .restaurant: "Restaurant booking"
        case .appointment: "Appointment"
        case .bank: "Bank or utility"
        case .custom: "Something else"
        }
    }

    var blurb: String {
        switch self {
        case .restaurant: "Book a table and confirm the details back."
        case .appointment: "Book a slot and find out what to bring."
        case .bank: "Get through the menus and the queue, then hand the call to you for security."
        case .custom: "Describe the call yourself."
        }
    }
}

struct NewCallRequest: Encodable {
    var goal: String
    var phoneNumber: String
    var businessName: String?
    var template: String = CallTemplate.custom.id
    var constraints: [String] = []
    var language: String = "en"
    var acceptCallback: Bool = false
}

struct CallsResponse: Decodable {
    var calls: [Call] = []

    enum CodingKeys: String, CodingKey { case calls }

    init(from decoder: Decoder) throws {
        calls = try decoder.container(keyedBy: CodingKeys.self).value(.calls, [])
    }
}

struct ParseRequest: Encodable { var text: String }
struct NoteRequest: Encodable { var text: String }

struct OkResponse: Decodable {
    var ok: Bool = true

    enum CodingKeys: String, CodingKey { case ok }

    init(from decoder: Decoder) throws {
        ok = try decoder.container(keyedBy: CodingKeys.self).value(.ok, true)
    }
}

/// What the server made of one sentence. Every field the parser could not fill
/// comes back nil on purpose — those become rows the person taps rather than
/// guesses the assistant would act on.
struct Brief: Decodable, Equatable {
    var businessName: String?
    var phoneNumber: String?
    var task: String = ""
    var when: String?
    var constraints: [String] = []
    var template: String = CallTemplate.custom.id
    var language: String = "en"
    var goal: String = ""
    /// The actual opening line, built by the same code the live call uses.
    var opening: String = ""
    /// The one field here the parser never fills: it is a choice made on the
    /// confirm screen, not something a sentence can say. It lives on the brief
    /// anyway so that everything the dial button sends comes from one object.
    var acceptCallback: Bool = false

    enum CodingKeys: String, CodingKey {
        case businessName, phoneNumber, task, when, constraints, template, language, goal, opening, acceptCallback
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        businessName = c.optional(.businessName)
        phoneNumber = c.optional(.phoneNumber)
        task = c.value(.task, "")
        when = c.optional(.when)
        constraints = c.value(.constraints, [])
        template = c.value(.template, CallTemplate.custom.id)
        language = c.value(.language, "en")
        goal = c.value(.goal, "")
        opening = c.value(.opening, "")
        acceptCallback = c.value(.acceptCallback, false)
    }

    /// Rebuilt here rather than trusting the server's copy, which predates any edits.
    func composedGoal() -> String {
        let time = when?.trimmed ?? ""
        return time.isEmpty ? task.trimmed : "\(task.trimmed) — \(time)"
    }

    func toRequest() -> NewCallRequest {
        NewCallRequest(
            goal: composedGoal(),
            phoneNumber: phoneNumber?.trimmed ?? "",
            businessName: businessName?.trimmed.nilIfBlank,
            template: template,
            constraints: constraints,
            language: language,
            acceptCallback: acceptCallback
        )
    }

    /// The same brief, booked for later instead of dialled now. The constraints
    /// are not carried: a scheduled task is re-briefed through the ordinary
    /// check step when its time comes, which is where they are filled in again.
    func toScheduledRequest(runAt: Int) -> NewScheduledRequest {
        NewScheduledRequest(
            goal: composedGoal(),
            runAt: runAt,
            phoneNumber: phoneNumber?.trimmed.nilIfBlank,
            businessName: businessName?.trimmed.nilIfBlank,
            template: template,
            language: language
        )
    }
}

/// The callee's country code beats everything else as a language signal.
func languageForNumber(_ phone: String) -> String? {
    let cleaned = phone.filter { $0.isNumber || $0 == "+" }
    guard cleaned.hasPrefix("+") else { return nil }
    let dialled = cleaned.dropFirst()
    return ["86", "852", "853", "886"].contains(where: { dialled.hasPrefix($0) }) ? "zh" : "en"
}

struct ServerConfig: Decodable {
    var ownerName: String = ""
    var ownerPhone: String = ""
    var ready: Bool = false
    var templates: [String] = []

    enum CodingKeys: String, CodingKey { case ownerName, ownerPhone, ready, templates }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        ownerName = c.value(.ownerName, "")
        ownerPhone = c.value(.ownerPhone, "")
        ready = c.value(.ready, false)
        templates = c.value(.templates, [])
    }
}

/// Who the assistant says it is calling for. Lives on the server rather than
/// the phone, because the greeting and the warm-transfer dial both need it, but
/// it is edited here so nobody has to touch a .env file to change their own name.
struct Profile: Codable, Equatable {
    var ownerName: String = ""
    var ownerPhone: String = ""
    var ready: Bool = false
    /// Whether calls go out under their own number rather than the shared one.
    var callerIdVerified: Bool = false
    /// The one flag to check before offering to dial. Both halves of the rule —
    /// profile filled in, number verified — are decided on the server so the two
    /// sides cannot drift apart.
    var canCall: Bool = false

    init(ownerName: String = "", ownerPhone: String = "") {
        self.ownerName = ownerName
        self.ownerPhone = ownerPhone
    }

    enum CodingKeys: String, CodingKey { case ownerName, ownerPhone, ready, callerIdVerified, canCall }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        ownerName = c.value(.ownerName, "")
        ownerPhone = c.value(.ownerPhone, "")
        ready = c.value(.ready, false)
        callerIdVerified = c.value(.callerIdVerified, false)
        canCall = c.value(.canCall, false)
    }
}

/// Whether their number is cleared to be shown to whoever they call.
///
/// ``callingFrom`` is the number Twilio's verification call arrives from. It
/// comes down from the server rather than being built in: the whole point of
/// showing it is that the incoming call is recognised instead of ignored, so a
/// stale value in a shipped app would be worse than none.
struct CallerId: Decodable {
    var verified: Bool = false
    var phone: String = ""
    var callingFrom: String = ""
    /// The code from a verification call that is still ringing, if there is one.
    /// Twilio hands a code over once, so this is the only way back to it for
    /// anyone who left the screen while their phone was ringing.
    var pendingCode: String = ""

    init() {}

    enum CodingKeys: String, CodingKey { case verified, phone, callingFrom, pendingCode }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        verified = c.value(.verified, false)
        phone = c.value(.phone, "")
        callingFrom = c.value(.callingFrom, "")
        pendingCode = c.value(.pendingCode, "")
    }
}

/// A verification in flight: the code to key in when the phone rings.
struct CallerIdVerification: Decodable {
    var code: String = ""
    var phone: String = ""
    var callingFrom: String = ""
    var delaySeconds: Int = 0
    /// True when this is the code from a call already ringing, not a new one.
    var resumed: Bool = false

    enum CodingKeys: String, CodingKey { case code, phone, callingFrom, delaySeconds, resumed }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        code = c.value(.code, "")
        phone = c.value(.phone, "")
        callingFrom = c.value(.callingFrom, "")
        delaySeconds = c.value(.delaySeconds, 0)
        resumed = c.value(.resumed, false)
    }
}

struct ForceRequest: Encodable { var force: Bool = true }

/// A call set to happen later.
///
/// ``readyAt`` is the whole point of the feature: when a task's time comes the
/// server marks it ready rather than dialling, and it waits here until it is
/// confirmed through the ordinary check step.
struct ScheduledCall: Decodable, Identifiable, Equatable {
    var id: String = ""
    var goal: String = ""
    var phoneNumber: String = ""
    var businessName: String = ""
    var template: String = CallTemplate.custom.id
    var language: String = "en"
    var runAt: Int = 0
    /// 0 means once; otherwise the gap in days between runs.
    var repeatDays: Int = 0
    var enabled: Bool = true
    var readyAt: Int?

    var isReady: Bool { readyAt != nil && enabled }

    enum CodingKeys: String, CodingKey {
        case id, goal, phoneNumber, businessName, template, language, runAt, repeatDays, enabled, readyAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.value(.id, "")
        goal = c.value(.goal, "")
        phoneNumber = c.value(.phoneNumber, "")
        businessName = c.value(.businessName, "")
        template = c.value(.template, CallTemplate.custom.id)
        language = c.value(.language, "en")
        runAt = c.value(.runAt, 0)
        repeatDays = c.value(.repeatDays, 0)
        enabled = c.value(.enabled, true)
        readyAt = c.optional(.readyAt)
    }
}

struct ScheduledResponse: Decodable {
    var tasks: [ScheduledCall] = []

    enum CodingKeys: String, CodingKey { case tasks }

    init(from decoder: Decoder) throws {
        tasks = try decoder.container(keyedBy: CodingKeys.self).value(.tasks, [])
    }
}

/// A call set for one moment. There is deliberately no repeat field: a standing
/// rule that rings the same number every morning is a robocall from the other
/// end, whoever set it up and whatever for, and the server refuses one anyway.
/// Leaving the field out means the app cannot ask by accident.
struct NewScheduledRequest: Encodable {
    var goal: String
    var runAt: Int
    var phoneNumber: String?
    var businessName: String?
    var template: String = CallTemplate.custom.id
    var language: String = "en"
}

struct ScheduledPatch: Encodable {
    var enabled: Bool?
    var dismiss: Bool?
}

/// ``needsCredits`` marks the one refusal that has something to do about it: the
/// account is out of calls, so the app can offer the top-up rather than only
/// reporting the wall.
struct ApiErrorBody: Decodable {
    var error: String?
    var needsCredits: Bool = false

    enum CodingKeys: String, CodingKey { case error, needsCredits }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        error = c.optional(.error)
        needsCredits = c.value(.needsCredits, false)
    }
}

// MARK: - accounts

/// The signed-in person. ``callsThisMonth`` comes back with every sign-in so the
/// plan screen has something real to show without a second round trip.
struct Account: Decodable, Equatable {
    var id: String = ""
    var email: String?
    var phone: String?
    var name: String?
    var ownerPhone: String?
    var callsThisMonth: Int = 0

    /// What to greet them by, falling back to the part of the email before the @.
    var displayName: String {
        if let name = name?.trimmed.nilIfBlank { return name }
        if let email, let local = email.split(separator: "@").first {
            return local.prefix(1).uppercased() + local.dropFirst()
        }
        return phone ?? ""
    }

    var handle: String { email ?? phone ?? "" }

    var initial: String {
        let first = displayName.trimmed.prefix(1).uppercased()
        return first.isEmpty ? "?" : first
    }

    enum CodingKeys: String, CodingKey { case id, email, phone, name, ownerPhone, callsThisMonth }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.value(.id, "")
        email = c.optional(.email)
        phone = c.optional(.phone)
        name = c.optional(.name)
        ownerPhone = c.optional(.ownerPhone)
        callsThisMonth = c.value(.callsThisMonth, 0)
    }
}

struct AuthResponse: Decodable {
    var token: String
    var user: Account

    enum CodingKeys: String, CodingKey { case token, user }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        token = c.value(.token, "")
        user = try c.decode(Account.self, forKey: .user)
    }
}

/// Which ways in this server can honour. The app asks before drawing the
/// sign-in screen, because a button that cannot work is worse than no button.
struct AuthMethods: Decodable {
    var email: Bool = true
    var phone: Bool = false
    var google: Bool = false
    /// The Android app's client id. Read here only so the two fields stay
    /// visibly different things — this app cannot sign in with it.
    var googleClientId: String = ""
    /// The one this app opens the sheet with. Google issues an ID token to the
    /// client that asked for it, and an iOS app has a client id of its own.
    var googleIosClientId: String = ""
    /// Whether the server can send a reset code at all. Same rule as the Google
    /// button: without a mail provider the code has nowhere to go, so the link
    /// is hidden rather than leading somewhere that cannot work.
    var passwordReset: Bool = false

    /// Both halves have to be there before the button can do anything: a server
    /// with Google switched on but no iOS client configured would hand back a
    /// token it is bound to refuse.
    var googleUsable: Bool { google && !googleIosClientId.isBlank }

    enum CodingKeys: String, CodingKey {
        case email, phone, google, googleClientId, googleIosClientId, passwordReset
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        email = c.value(.email, true)
        phone = c.value(.phone, false)
        google = c.value(.google, false)
        googleClientId = c.value(.googleClientId, "")
        googleIosClientId = c.value(.googleIosClientId, "")
        passwordReset = c.value(.passwordReset, false)
    }
}

struct GoogleSignInRequest: Encodable { var idToken: String }

struct ForgotPasswordRequest: Encodable { var email: String }
struct ResetPasswordRequest: Encodable { var email: String; var code: String; var password: String }
struct ChangePasswordRequest: Encodable { var currentPassword: String; var newPassword: String }
struct RegisterRequest: Encodable { var email: String; var password: String; var name: String? }
struct LoginRequest: Encodable { var email: String; var password: String }
struct PhoneStartRequest: Encodable { var phone: String }
struct PhoneCheckRequest: Encodable { var phone: String; var code: String }

struct MeResponse: Decodable { var user: Account }

/// The plan screen's figures. ``used`` is this month's calls — history, and it
/// only ever grows — while ``balance`` is what is left to spend and is the
/// number that decides whether the dial button will work.
struct Usage: Decodable, Equatable {
    var used: Int = 0
    var balance: Int = 0
    var packs: [Pack] = []
    /// Packs payable in-app, priced by Stripe.
    var inAppPacks: [InAppPack] = []
    /// Whether the server has the web payment page switched on. Comes down here
    /// rather than being discovered by asking for a link, so the app never shows
    /// a button that turns out not to work when it is pressed.
    var webPay: Bool = false

    init() {}

    enum CodingKeys: String, CodingKey { case used, balance, packs, inAppPacks, webPay }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        used = c.value(.used, 0)
        balance = c.value(.balance, 0)
        packs = c.value(.packs, [])
        inAppPacks = c.value(.inAppPacks, [])
        webPay = c.value(.webPay, false)
    }
}

/// A pack bought without leaving the app. ``price`` arrives already formatted by
/// the server from what Stripe holds — the app never builds a price out of a
/// number, so what is shown and what is charged cannot drift.
struct InAppPack: Decodable, Identifiable, Equatable {
    var priceId: String = ""
    var calls: Int = 0
    var price: String = ""

    var id: String { priceId }

    enum CodingKeys: String, CodingKey { case priceId, calls, price }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        priceId = c.value(.priceId, "")
        calls = c.value(.calls, 0)
        price = c.value(.price, "")
    }
}

/// One top-up, as the server sells it. The price is deliberately absent: on
/// Android it comes from Play. Here the packs are only a description of what is
/// on sale, and the charging happens through the payment page.
struct Pack: Decodable, Identifiable, Equatable {
    var productId: String = ""
    var calls: Int = 0

    var id: String { productId }

    enum CodingKeys: String, CodingKey { case productId, calls }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        productId = c.value(.productId, "")
        calls = c.value(.calls, 0)
    }
}

/// A short-lived web address for topping the account up by card, WeChat Pay or
/// Alipay. Good for thirty minutes and for nothing but adding calls, which is
/// what makes it safe to send to whoever is actually paying — a parent abroad
/// with no UK card is the case it exists for.
struct PayLink: Decodable {
    var url: String = ""

    enum CodingKeys: String, CodingKey { case url }

    init(from decoder: Decoder) throws {
        url = try decoder.container(keyedBy: CodingKeys.self).value(.url, "")
    }
}

/// Envelope for everything the live feed pushes down the socket.
struct FeedEvent: Decodable {
    var type: String = ""
    var call: Call?
    var entry: TranscriptEntry?
    /// A "translation" event carries these: the line's timestamp, and its text.
    var at: Int?
    var translation: String?

    enum CodingKeys: String, CodingKey { case type, call, entry, at, translation }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        type = c.value(.type, "")
        call = c.optional(.call)
        entry = c.optional(.entry)
        at = c.optional(.at)
        translation = c.optional(.translation)
    }
}

/// - Parameters:
///   - status: the HTTP code, when the server answered at all. 401 is the one
///     the app acts on rather than just shows: the session has gone and the only
///     way forward is to sign in again.
///   - needsCredits: the account has run out of calls. The other refusals are
///     things to read; this one is a thing to do, so it is carried separately and
///     the composer sends them to the top-up rather than a dead end.
struct APIError: LocalizedError {
    let message: String
    var status: Int?
    var needsCredits: Bool = false

    var errorDescription: String? { message }
    var isUnauthorised: Bool { status == 401 }
}

// MARK: - small conveniences

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
    var nilIfBlank: String? { trimmed.isEmpty ? nil : self }
    var isBlank: Bool { trimmed.isEmpty }
    var isNotBlank: Bool { !trimmed.isEmpty }
}

extension Optional where Wrapped == String {
    var orEmpty: String { self ?? "" }
}
