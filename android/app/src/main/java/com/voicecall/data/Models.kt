package com.voicecall.data

import kotlinx.serialization.Serializable

/**
 * One call task. The list endpoint omits [transcript]; the detail endpoint and
 * the live feed include it, so it defaults to empty rather than being a
 * separate type.
 */
@Serializable
data class Call(
    val id: String,
    val phoneNumber: String,
    val businessName: String,
    val template: String,
    val goal: String,
    val constraints: List<String> = emptyList(),
    /** What the assistant speaks on the line — matches the callee, not the app. */
    val language: String = "en",
    val cost: Cost? = null,
    val status: String,
    /**
     * Queueing rather than talking, as the assistant reports it.
     *
     * [holdSeconds] is what the server had banked when it last pushed, and
     * [holdingSince] is when the current wait started — the feed only pushes on
     * a change, so the running total has to be worked out here. Use
     * [holdSoFarSeconds] rather than either on its own.
     */
    val onHold: Boolean = false,
    val holdingSince: Long? = null,
    val holdSeconds: Int = 0,
    /** Whether this call may accept a callback instead of queueing. Chosen before dialling. */
    val acceptCallback: Boolean = false,
    /** What this call has to get through, ticked off as it goes. */
    val steps: List<Step> = emptyList(),
    val results: Map<String, String> = emptyMap(),
    val outcome: String? = null,
    val summary: String? = null,
    val summaryTranslation: String? = null,
    /** Null until it has been rated, so the detail screen asks only once. */
    val feedback: Feedback? = null,
    val error: String? = null,
    val createdAt: Long,
    val endedAt: Long? = null,
    val transcript: List<TranscriptEntry> = emptyList(),
) {
    val isLive: Boolean
        get() = status in setOf(CallStatus.QUEUED, CallStatus.DIALING, CallStatus.IN_PROGRESS, CallStatus.TRANSFERRING)

    /** Total time queueing, including the stretch still running. */
    fun holdSoFarSeconds(now: Long): Int {
        val running = holdingSince?.let { ((now - it) / 1000).coerceAtLeast(0L).toInt() } ?: 0
        return holdSeconds + running
    }
}

@Serializable
data class Step(
    val label: String,
    val done: Boolean = false,
)

/**
 * What the caller made of the call afterwards. [verdict] is the whole of the
 * required answer — reasons and note are both optional, because a rating that
 * demands an essay gets neither.
 */
@Serializable
data class Feedback(
    val verdict: String = "",
    val reasons: List<String> = emptyList(),
    val note: String = "",
    val at: Long = 0,
)

@Serializable
data class FeedbackRequest(
    val verdict: String,
    val reasons: List<String> = emptyList(),
    val note: String = "",
)

/** The reasons the server will accept. Anything else it drops on the floor. */
object FeedbackReason {
    const val WRONG_DETAILS = "wrong_details"
    const val MISHEARD = "misheard"
    const val TOO_WORDY = "too_wordy"
    const val QUEUED_TOO_LONG = "queued_too_long"
    const val OTHER = "other"

    val ALL = listOf(WRONG_DETAILS, MISHEARD, TOO_WORDY, QUEUED_TOO_LONG, OTHER)
}

/**
 * What a call cost, once Twilio has rated it.
 *
 * [price] is the total, and it is part measured and part worked out: [voice] is
 * what Twilio charged for the phone line, [relay] is the speech relay's share
 * derived from the duration, because Twilio bills that monthly with no per-call
 * price. Relay is the larger half — around 80% of a long call — so leaving it
 * out understated a call several times over. It does mean the total is an
 * estimate, which [estimated] says out loud.
 */
@Serializable
data class Cost(
    val price: String = "",
    val voice: String = "",
    val relay: String = "",
    val estimated: Boolean = false,
    val unit: String = "",
    val durationSeconds: Int = 0,
)

@Serializable
data class TranscriptEntry(
    val speaker: String,
    val text: String,
    val at: Long,
    /**
     * The line in the other language, filled in shortly after it was spoken.
     * Null means not translated yet — or not at all, which the UI treats the
     * same way: show the line as it was said.
     */
    val translation: String? = null,
)

object CallStatus {
    const val QUEUED = "queued"
    const val DIALING = "dialing"
    const val IN_PROGRESS = "in_progress"
    const val TRANSFERRING = "transferring"
    const val COMPLETED = "completed"
    const val FAILED = "failed"
}

object Speaker {
    const val AGENT = "agent"
    const val CALLER = "caller"
    const val SYSTEM = "system"

    /** You, typing into the live call from this app. */
    const val OWNER = "owner"
}

/** Call templates the server knows how to brief the agent for. */
enum class CallTemplate(val id: String, val label: String, val blurb: String) {
    RESTAURANT("restaurant", "Restaurant booking", "Book a table and confirm the details back."),
    APPOINTMENT("appointment", "Appointment", "Book a slot and find out what to bring."),
    BANK("bank", "Bank or utility", "Get through the menus and the queue, then hand the call to you for security."),
    CUSTOM("custom", "Something else", "Describe the call yourself."),
}

@Serializable
data class NewCallRequest(
    val goal: String,
    val phoneNumber: String,
    val businessName: String? = null,
    val template: String = CallTemplate.CUSTOM.id,
    val constraints: List<String> = emptyList(),
    val language: String = "en",
    val acceptCallback: Boolean = false,
)

@Serializable
data class CallsResponse(val calls: List<Call>)

@Serializable
data class ParseRequest(val text: String)

@Serializable
data class NoteRequest(val text: String)

@Serializable
data class OkResponse(val ok: Boolean = true)

/**
 * What the server made of one sentence. Every field the parser could not fill
 * comes back null on purpose — those become rows the person taps rather than
 * guesses the assistant would act on.
 */
@Serializable
data class Brief(
    val businessName: String? = null,
    val phoneNumber: String? = null,
    val task: String = "",
    val `when`: String? = null,
    val constraints: List<String> = emptyList(),
    val template: String = CallTemplate.CUSTOM.id,
    val language: String = "en",
    val goal: String = "",
    /** The actual opening line, built by the same code the live call uses. */
    val opening: String = "",
    /**
     * The one field here the parser never fills: it is a choice made on the
     * confirm screen, not something a sentence can say. It lives on the brief
     * anyway so that everything the dial button sends comes from one object.
     */
    val acceptCallback: Boolean = false,
) {
    /** Rebuilt here rather than trusting the server's copy, which predates any edits. */
    fun composedGoal(): String {
        val time = `when`?.trim().orEmpty()
        return if (time.isEmpty()) task.trim() else "${task.trim()} — $time"
    }

    fun toRequest() = NewCallRequest(
        goal = composedGoal(),
        phoneNumber = phoneNumber?.trim().orEmpty(),
        businessName = businessName?.trim()?.ifBlank { null },
        template = template,
        constraints = constraints,
        language = language,
        acceptCallback = acceptCallback,
    )

    /**
     * The same brief, booked for later instead of dialled now. The constraints
     * are not carried: a scheduled task is re-briefed through the ordinary
     * check step when its time comes, which is where they are filled in again.
     */
    fun toScheduledRequest(runAt: Long) = NewScheduledRequest(
        goal = composedGoal(),
        runAt = runAt,
        phoneNumber = phoneNumber?.trim()?.ifBlank { null },
        businessName = businessName?.trim()?.ifBlank { null },
        template = template,
        language = language,
    )
}

/** The callee's country code beats everything else as a language signal. */
fun languageForNumber(phone: String): String? {
    val cleaned = phone.replace(Regex("[^\\d+]"), "")
    if (!cleaned.startsWith("+")) return null
    return if (Regex("^\\+(86|852|853|886)").containsMatchIn(cleaned)) "zh" else "en"
}

@Serializable
data class ServerConfig(
    val ownerName: String = "",
    val ownerPhone: String = "",
    val ready: Boolean = false,
    val templates: List<String> = emptyList(),
)

/**
 * Who the assistant says it is calling for. Lives on the server rather than the
 * phone, because the greeting and the warm-transfer dial both need it, but it
 * is edited here so nobody has to touch a .env file to change their own name.
 */
@Serializable
data class Profile(
    val ownerName: String = "",
    val ownerPhone: String = "",
    val ready: Boolean = false,
    /** Whether calls go out under their own number rather than the shared one. */
    val callerIdVerified: Boolean = false,
    /**
     * The one flag to check before offering to dial. Both halves of the rule —
     * profile filled in, number verified — are decided on the server so the two
     * sides cannot drift apart.
     */
    val canCall: Boolean = false,
)

/**
 * Whether their number is cleared to be shown to whoever they call.
 *
 * [callingFrom] is the number Twilio's verification call arrives from. It comes
 * down from the server rather than being built in: the whole point of showing
 * it is that the incoming call is recognised instead of ignored, so a stale
 * value in a shipped app would be worse than none.
 */
@Serializable
data class CallerId(
    val verified: Boolean = false,
    val phone: String = "",
    val callingFrom: String = "",
    /**
     * The code from a verification call that is still ringing, if there is one.
     * Twilio hands a code over once, so this is the only way back to it for
     * anyone who left the screen while their phone was ringing.
     */
    val pendingCode: String = "",
)

/** A verification in flight: the code to key in when the phone rings. */
@Serializable
data class CallerIdVerification(
    val code: String = "",
    val phone: String = "",
    val callingFrom: String = "",
    val delaySeconds: Int = 0,
    /** True when this is the code from a call already ringing, not a new one. */
    val resumed: Boolean = false,
)

@Serializable
data class ForceRequest(val force: Boolean = true)

/**
 * A call set to happen later.
 *
 * [readyAt] is the whole point of the feature: when a task's time comes the
 * server marks it ready rather than dialling, and it waits here until it is
 * confirmed through the ordinary check step.
 */
@Serializable
data class ScheduledCall(
    val id: String = "",
    val goal: String = "",
    val phoneNumber: String = "",
    val businessName: String = "",
    val template: String = CallTemplate.CUSTOM.id,
    val language: String = "en",
    val runAt: Long = 0,
    /** 0 means once; otherwise the gap in days between runs. */
    val repeatDays: Int = 0,
    val enabled: Boolean = true,
    val readyAt: Long? = null,
) {
    val isReady: Boolean get() = readyAt != null && enabled
}

@Serializable
data class ScheduledResponse(val tasks: List<ScheduledCall> = emptyList())

/**
 * A call set for one moment. There is deliberately no repeat field: a standing
 * rule that rings the same number every morning is a robocall from the other
 * end, whoever set it up and whatever for, and the server refuses one anyway.
 * Leaving the field out means the app cannot ask by accident.
 */
@Serializable
data class NewScheduledRequest(
    val goal: String,
    val runAt: Long,
    val phoneNumber: String? = null,
    val businessName: String? = null,
    val template: String = CallTemplate.CUSTOM.id,
    val language: String = "en",
)

@Serializable
data class ScheduledPatch(val enabled: Boolean? = null, val dismiss: Boolean? = null)

/**
 * [needsCredits] marks the one refusal that has something to do about it: the
 * account is out of calls, so the app can offer the top-up rather than only
 * reporting the wall.
 */
@Serializable
data class ApiError(
    val error: String? = null,
    val needsCredits: Boolean = false,
)

// --- accounts ---------------------------------------------------------------

/**
 * The signed-in person. [callsThisMonth] comes back with every sign-in so the
 * plan screen has something real to show without a second round trip.
 */
@Serializable
data class Account(
    val id: String = "",
    val email: String? = null,
    val phone: String? = null,
    val name: String? = null,
    val ownerPhone: String? = null,
    val callsThisMonth: Int = 0,
) {
    /** What to greet them by, falling back to the part of the email before the @. */
    val displayName: String
        get() = name?.trim()?.ifBlank { null }
            ?: email?.substringBefore('@')?.replaceFirstChar { it.uppercase() }
            ?: phone
            ?: ""

    val handle: String get() = email ?: phone ?: ""

    val initial: String get() = displayName.trim().take(1).uppercase().ifBlank { "?" }
}

@Serializable
data class AuthResponse(val token: String, val user: Account)

/**
 * Which ways in this server can honour. The app asks before drawing the sign-in
 * screen, because a Google button that cannot work is worse than no button.
 *
 * [googleClientId] comes down with it rather than being baked into the build:
 * it is a public identifier, and serving it from the same place that decides
 * whether Google is on at all means the two cannot disagree.
 */
@Serializable
data class AuthMethods(
    val email: Boolean = true,
    val phone: Boolean = false,
    val google: Boolean = false,
    val googleClientId: String = "",
    /**
     * Whether the server can send a reset code at all. Same rule as the Google
     * button: without a mail provider the code has nowhere to go, so the link
     * is hidden rather than leading somewhere that cannot work.
     */
    val passwordReset: Boolean = false,
) {
    /** Both halves have to be there before the button can do anything. */
    val googleUsable: Boolean get() = google && googleClientId.isNotBlank()
}

@Serializable
data class ForgotPasswordRequest(val email: String)

@Serializable
data class ResetPasswordRequest(val email: String, val code: String, val password: String)

@Serializable
data class ChangePasswordRequest(val currentPassword: String, val newPassword: String)

@Serializable
data class GoogleSignInRequest(val idToken: String)

@Serializable
data class MeResponse(val user: Account)

@Serializable
data class RegisterRequest(val email: String, val password: String, val name: String? = null)

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class PhoneStartRequest(val phone: String)

@Serializable
data class PhoneCheckRequest(val phone: String, val code: String)

/**
 * The plan screen's figures. [used] is this month's calls — history, and it
 * only ever grows — while [balance] is what is left to spend and is the number
 * that decides whether the dial button will work.
 *
 * [packs] comes down from the server rather than being built into the app: the
 * ids have to match products in the Play Console, and a shop that disagrees
 * with what the server will honour is worse than no shop. Empty means nothing
 * is on sale yet, and the app shows no shop at all.
 */
@Serializable
data class Usage(
    val used: Int = 0,
    val balance: Int = 0,
    val packs: List<Pack> = emptyList(),
    /** Packs payable in-app through Stripe's sheet, priced by Stripe. */
    val inAppPacks: List<InAppPack> = emptyList(),
    /**
     * Whether the server has the web payment page switched on. Comes down here
     * rather than being discovered by asking for a link, so the app never shows
     * a button that turns out not to work when it is pressed.
     */
    val webPay: Boolean = false,
)

/**
 * A pack bought without leaving the app. [price] arrives already formatted by
 * the server from what Stripe holds — the app never builds a price out of a
 * number, so what is shown and what is charged cannot drift.
 */
@Serializable
data class InAppPack(
    val priceId: String,
    val calls: Int,
    val price: String = "",
)

/**
 * One top-up. The price is deliberately absent: Play is the only place it can
 * be set, and it comes back from the billing library already formatted in the
 * buyer's own currency. This says what the pack delivers; Play says what it
 * costs.
 */
@Serializable
data class Pack(val productId: String, val calls: Int)

/** What the server made of a purchase the app delivered to it. */
@Serializable
data class PlayVerification(
    val ok: Boolean = false,
    /** False when this purchase had already been credited — still a success. */
    val granted: Boolean = false,
    val calls: Int = 0,
    val balance: Int = 0,
)

@Serializable
data class PlayVerifyRequest(val productId: String, val purchaseToken: String)

/**
 * A short-lived web address for topping the account up by card, WeChat Pay or
 * Alipay. Good for thirty minutes and for nothing but adding calls, which is
 * what makes it safe to send to whoever is actually paying — a parent abroad
 * with no UK card is the case it exists for.
 */
@Serializable
data class PayLink(val url: String = "")

/**
 * What Stripe's payment sheet needs to open, in-app.
 *
 * [publishableKey] comes down with it rather than being built into the APK —
 * it is a public identifier that can do nothing on its own, and serving it from
 * the same place that decides whether in-app payment is on at all means the two
 * cannot disagree. Same arrangement as the Google sign-in client id.
 */
@Serializable
data class PaymentIntent(
    val clientSecret: String = "",
    val publishableKey: String = "",
    val amount: Int = 0,
    val currency: String = "",
)

@Serializable
data class PaymentIntentRequest(val priceId: String)

/** Envelope for everything the live feed pushes down the socket. */
@Serializable
data class FeedEvent(
    val type: String,
    val call: Call? = null,
    val entry: TranscriptEntry? = null,
    /** A "translation" event carries these: the line's timestamp, and its text. */
    val at: Long? = null,
    val translation: String? = null,
)

/**
 * @param status the HTTP code, when the server answered at all. 401 is the one
 *   the app acts on rather than just shows: the session has gone and the only
 *   way forward is to sign in again.
 * @param needsCredits the account has run out of calls. The other refusals are
 *   things to read; this one is a thing to do, so it is carried separately and
 *   the composer sends them to the top-up rather than a dead end.
 */
class ApiException(
    message: String,
    val status: Int? = null,
    val needsCredits: Boolean = false,
) : Exception(message) {
    val isUnauthorised: Boolean get() = status == 401
}
