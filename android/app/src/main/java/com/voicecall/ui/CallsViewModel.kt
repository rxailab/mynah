package com.voicecall.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.voicecall.CallWatchService
import com.voicecall.R
import com.voicecall.data.Account
import com.voicecall.data.ApiException
import com.voicecall.data.AuthMethods
import com.voicecall.data.AuthResponse
import com.voicecall.data.Brief
import com.voicecall.data.Call
import com.voicecall.data.CallerId
import com.voicecall.data.FeedbackRequest
import com.voicecall.data.FirstRun
import com.voicecall.data.Language
import com.voicecall.data.NewCallRequest
import com.voicecall.data.NewScheduledRequest
import com.voicecall.data.PaymentIntent
import com.voicecall.data.PlayBilling
import com.voicecall.data.Profile
import com.voicecall.data.ScheduledCall
import com.voicecall.data.ScheduledPatch
import com.voicecall.data.ServerSettings
import com.voicecall.data.SettingsStore
import com.voicecall.data.Strings
import com.voicecall.data.Usage
import com.voicecall.data.VoiceCallApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class CallsUiState(
    val calls: List<Call> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null,
)

/** Turning one sentence into a brief the person can correct. */
sealed interface ParseState {
    data object Idle : ParseState
    data object Running : ParseState
    data class Ready(val brief: Brief) : ParseState
    data class Failed(val reason: String) : ParseState
}

/** Signing in, by either route. [Failed] is shown on the sign-in screen itself. */
sealed interface SignInState {
    data object Idle : SignInState
    data object Running : SignInState
    data class Failed(val reason: String) : SignInState
}

/**
 * Getting their own number cleared to show to the businesses they call.
 *
 * [Waiting] is the whole point of the screen: the code has to be on display
 * before the phone rings, because an unannounced call from a foreign number
 * asking for digits is the shape of a scam and gets hung up on.
 */
sealed interface CallerIdState {
    data object Loading : CallerIdState
    data class Ready(val phone: String, val callingFrom: String) : CallerIdState

    /**
     * @param resumed true when this is a call that was already ringing before
     *   the screen opened. Worth distinguishing: someone who has just pressed
     *   the button is waiting for a phone to ring, whereas someone coming back
     *   to this has a phone ringing at them now and needs to know the digits
     *   are the same ones, not a second set.
     */
    data class Waiting(
        val code: String,
        val phone: String,
        val callingFrom: String,
        val resumed: Boolean = false,
    ) : CallerIdState

    data object Verified : CallerIdState
    data class Failed(val reason: String, val phone: String, val callingFrom: String) : CallerIdState
}

class CallsViewModel(app: Application) : AndroidViewModel(app) {

    private val store = SettingsStore(app)

    /** null while DataStore is still reading from disk. */
    val settings: StateFlow<ServerSettings?> = store.settings
        .map<ServerSettings, ServerSettings?> { it }
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val language: StateFlow<Language> =
        store.language.stateIn(viewModelScope, SharingStarted.Eagerly, Language.SYSTEM)

    /** null while DataStore is still reading — the start route depends on it. */
    val firstRun: StateFlow<FirstRun?> = store.firstRun
        .map<FirstRun, FirstRun?> { it }
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    fun finishWelcome() { viewModelScope.launch { store.markOnboarded() } }
    fun finishProfilePrompt() { viewModelScope.launch { store.markProfilePrompted() } }
    fun finishCoach() { viewModelScope.launch { store.markCoachSeen() } }

    private val strings = Strings(app) { language.value }
    private val api = VoiceCallApi(strings)

    fun setLanguage(choice: Language) {
        viewModelScope.launch { store.saveLanguage(choice) }
    }

    private val _uiState = MutableStateFlow(CallsUiState())
    val uiState: StateFlow<CallsUiState> = _uiState.asStateFlow()

    private val _selected = MutableStateFlow<Call?>(null)
    val selected: StateFlow<Call?> = _selected.asStateFlow()

    private val _profile = MutableStateFlow<Profile?>(null)
    val profile: StateFlow<Profile?> = _profile.asStateFlow()

    private val _parse = MutableStateFlow<ParseState>(ParseState.Idle)
    val parse: StateFlow<ParseState> = _parse.asStateFlow()

    // --- scheduled calls -----------------------------------------------------

    private val _scheduled = MutableStateFlow<List<ScheduledCall>>(emptyList())
    val scheduled: StateFlow<List<ScheduledCall>> = _scheduled.asStateFlow()

    fun loadScheduled() {
        val target = current()
        if (!target.isSignedIn) return
        viewModelScope.launch {
            try {
                _scheduled.value = api.scheduled(target)
            } catch (e: Exception) {
                if (expired(e)) return@launch
                _uiState.update { it.copy(error = e.readable()) }
            }
        }
    }

    fun setScheduledEnabled(id: String, enabled: Boolean) = patchScheduled(id, ScheduledPatch(enabled = enabled))

    /**
     * The person has acted on a task that came due — a one-off retires, a repeat
     * rolls forward to its next slot.
     */
    fun dismissScheduled(id: String) = patchScheduled(id, ScheduledPatch(dismiss = true))

    private fun patchScheduled(id: String, patch: ScheduledPatch) {
        val target = current()
        if (!target.isSignedIn) return
        viewModelScope.launch {
            try {
                val updated = api.patchScheduled(target, id, patch)
                _scheduled.update { list -> list.map { if (it.id == id) updated else it } }
            } catch (e: Exception) {
                if (expired(e)) return@launch
                _uiState.update { it.copy(error = e.readable()) }
            }
        }
    }

    /**
     * Books the brief on the confirm screen for later instead of dialling it.
     *
     * One moment, never a repeat — see [NewScheduledRequest]. The server also
     * refuses a second pending call for a number that already has one, which
     * arrives here as an ordinary error with a sentence worth showing.
     */
    fun scheduleCall(
        request: NewScheduledRequest,
        onDone: () -> Unit,
        onError: (String) -> Unit,
    ) {
        val target = current()
        viewModelScope.launch {
            try {
                val task = api.createScheduled(target, request)
                _scheduled.update { listOf(task) + it }
                onDone()
            } catch (e: Exception) {
                if (expired(e)) return@launch
                onError(e.readable())
            }
        }
    }

    fun deleteScheduled(id: String) {
        val target = current()
        if (!target.isSignedIn) return
        viewModelScope.launch {
            try {
                api.deleteScheduled(target, id)
                _scheduled.update { list -> list.filterNot { it.id == id } }
            } catch (e: Exception) {
                if (expired(e)) return@launch
                _uiState.update { it.copy(error = e.readable()) }
            }
        }
    }

    /**
     * The month's calls, the balance left to spend, and what is on sale. Used
     * by the plan screen, and by the home screen to warn before the last call
     * runs out rather than at the moment somebody wants to make one.
     */
    private val _usage = MutableStateFlow(Usage())
    val usage: StateFlow<Usage> = _usage.asStateFlow()

    fun loadUsage() { viewModelScope.launch { fetchUsage() } }

    private suspend fun fetchUsage(): Usage? {
        val target = current()
        if (!target.isSignedIn) return null
        return try {
            api.usage(target).also { _usage.value = it }
        } catch (e: Exception) {
            // A missing allowance figure is not worth an error on a screen
            // whose other numbers are all present.
            expired(e)
            null
        }
    }

    // --- buying calls ----------------------------------------------------------

    /**
     * Play is only connected to once there is a screen that needs it, so an app
     * that never opens the shop never talks to it.
     *
     * The delivery callback is the only place credits are claimed: it hands the
     * purchase to the server, which asks Google about it, and the balance that
     * comes back is what the screen shows. PlayBilling consumes the purchase
     * only after this returns, so nothing paid for is ever thrown away
     * undelivered — see the note there.
     */
    private var _billing: PlayBilling? = null

    val billing: PlayBilling
        get() = _billing ?: PlayBilling(
            context = getApplication(),
            scope = viewModelScope,
            deliver = { productId, token ->
                val verified = api.verifyPlayPurchase(current(), productId, token)
                _usage.update { it.copy(balance = verified.balance) }
                verified.calls
            },
        ).also { _billing = it }

    /**
     * Prices come from Play; what each pack delivers comes from the server, so
     * the packs have to arrive before Play can be asked about them.
     */
    fun openShop() {
        viewModelScope.launch {
            val ids = (fetchUsage() ?: return@launch).packs.map { it.productId }
            if (ids.isNotEmpty()) billing.loadPrices(ids)
            // Anything paid for on a previous run that never reached the server.
            billing.recover()
        }
    }

    /**
     * The other way to pay: a web page taking cards, WeChat Pay and Alipay.
     *
     * The link is fetched on the press rather than kept, because it lasts half
     * an hour — and handed to the caller rather than opened here, since the two
     * things to do with it are opening it and sending it to whoever is paying.
     */
    fun topUpLink(onReady: (String) -> Unit) {
        viewModelScope.launch {
            try {
                onReady(api.payLink(current()).url)
            } catch (e: Exception) {
                if (expired(e)) return@launch
                _uiState.update { it.copy(error = e.readable()) }
            }
        }
    }

    /**
     * Opens a payment for one pack, to be handed to Stripe's sheet.
     *
     * Nothing is charged here — this only asks the server to start a payment
     * and hands back what the sheet needs to show it. The money moves when the
     * person confirms in the sheet, and the credits land on Stripe's webhook,
     * not on the sheet's result: a result that says "succeeded" is the phone's
     * word for it, and the phone is not who we take payment facts from.
     */
    fun startInAppPayment(priceId: String, onReady: (PaymentIntent) -> Unit) {
        viewModelScope.launch {
            try {
                onReady(api.paymentIntent(current(), priceId))
            } catch (e: Exception) {
                if (expired(e)) return@launch
                _uiState.update { it.copy(error = e.readable()) }
            }
        }
    }

    /**
     * Watches the balance for a few minutes after a top-up link goes out.
     *
     * Paying happens in a browser — or on somebody else's phone entirely — and
     * the credits land on a webhook from Stripe, so there is no result to
     * await and nothing to bring the app back. Polling only while it could
     * plausibly arrive is the honest version of a push nobody sends: it stops
     * on the first change, and gives up rather than running all day.
     */
    private var balanceWatch: Job? = null

    fun watchForTopUp() {
        balanceWatch?.cancel()
        balanceWatch = viewModelScope.launch {
            val before = _usage.value.balance
            repeat(36) {
                delay(5_000)
                if (!isActive) return@launch
                fetchUsage()
                if (_usage.value.balance != before) return@launch
            }
        }
    }

    fun stopWatchingForTopUp() {
        balanceWatch?.cancel()
        balanceWatch = null
    }

    override fun onCleared() {
        _billing?.close()
        super.onCleared()
    }

    /**
     * Text for the composer to open with, put here by a template or a saved
     * business. Held on the view model rather than passed through the route so
     * a whole sentence does not have to survive URL encoding.
     */
    private val _composerSeed = MutableStateFlow<String?>(null)
    val composerSeed: StateFlow<String?> = _composerSeed.asStateFlow()

    fun seedComposer(text: String) { _composerSeed.value = text }

    /** Consumed once, so going back and forward does not retype it. */
    fun clearComposerSeed() { _composerSeed.value = null }

    /**
     * What has been searched for this session. Kept in memory on purpose for
     * now: it is a convenience, not a record, and persisting someone's search
     * history is a decision worth making deliberately rather than by default.
     */
    private val _recentSearches = MutableStateFlow<List<String>>(emptyList())
    val recentSearches: StateFlow<List<String>> = _recentSearches.asStateFlow()

    fun rememberSearch(term: String) {
        val t = term.trim()
        if (t.isBlank()) return
        _recentSearches.update { existing ->
            (listOf(t) + existing.filterNot { it.equals(t, ignoreCase = true) }).take(6)
        }
    }

    private val _callerId = MutableStateFlow<CallerIdState>(CallerIdState.Loading)
    val callerId: StateFlow<CallerIdState> = _callerId.asStateFlow()

    private var callerIdPoll: Job? = null

    /** Who is signed in. Null until [loadAccount] answers, or after signing out. */
    private val _account = MutableStateFlow<Account?>(null)
    val account: StateFlow<Account?> = _account.asStateFlow()

    /** What the server will accept. Null while the sign-in screen is still asking. */
    private val _authMethods = MutableStateFlow<AuthMethods?>(null)
    val authMethods: StateFlow<AuthMethods?> = _authMethods.asStateFlow()

    private val _signIn = MutableStateFlow<SignInState>(SignInState.Idle)
    val signIn: StateFlow<SignInState> = _signIn.asStateFlow()

    /**
     * The address a reset is running for, carried between the three screens.
     *
     * On the view model rather than in the route, because the code screen and
     * the new-password screen both need it and an address in a navigation
     * argument ends up in a back-stack entry and a URL-encoded string for no
     * good reason.
     */
    private val _resetEmail = MutableStateFlow("")
    val resetEmail: StateFlow<String> = _resetEmail.asStateFlow()

    /** Held only until the new password is set; never written to disk. */
    private var resetCode = ""

    private var feedJob: Job? = null

    private fun current(): ServerSettings = settings.value ?: ServerSettings()

    // --- accounts ------------------------------------------------------------

    /**
     * Asks the server which ways in it can honour, before the sign-in screen
     * draws any buttons. A failure here is a connection problem, not a refusal,
     * so it lands in the same place a wrong password would.
     */
    fun loadAuthMethods() {
        val target = current()
        viewModelScope.launch {
            try {
                _authMethods.value = api.authMethods(target)
            } catch (e: Exception) {
                _authMethods.value = null
                _signIn.value = SignInState.Failed(e.readable())
            }
        }
    }

    /**
     * One field pair, two server endpoints. The server cannot tell "no such
     * account" from "wrong password" on purpose — that difference leaks which
     * addresses exist — so registering first is what makes one button work for
     * both: a new address is created, and a taken one (the only 400 left once
     * the screen has checked the format) falls through to signing in.
     */
    fun signInWithEmail(email: String, password: String) {
        val target = current()
        _signIn.value = SignInState.Running
        viewModelScope.launch {
            val registered = try {
                api.register(target, email.trim(), password, null)
            } catch (e: ApiException) {
                if (e.status != 400) {
                    _signIn.value = SignInState.Failed(e.readable())
                    return@launch
                }
                null // taken — this is a returning user
            } catch (e: Exception) {
                _signIn.value = SignInState.Failed(e.readable())
                return@launch
            }

            if (registered != null) {
                applySession(registered)
                return@launch
            }

            try {
                applySession(api.login(target, email.trim(), password))
            } catch (e: Exception) {
                _signIn.value = SignInState.Failed(e.readable())
            }
        }
    }

    /** [idToken] comes from Credential Manager; the server checks it with Google. */
    fun signInWithGoogle(idToken: String) {
        val target = current()
        _signIn.value = SignInState.Running
        viewModelScope.launch {
            try {
                applySession(api.signInWithGoogle(target, idToken))
            } catch (e: Exception) {
                _signIn.value = SignInState.Failed(e.readable())
            }
        }
    }

    /** Google refused, or the person backed out of the sheet. */
    fun failSignIn(reason: String) { _signIn.value = SignInState.Failed(reason) }

    fun clearSignInError() { _signIn.value = SignInState.Idle }

    // --- forgetting a password ------------------------------------------------

    /**
     * Asks for a code, and moves on regardless of what comes back.
     *
     * The server answers a registered address and an unregistered one
     * identically, so that it cannot be used to find out who has an account.
     * The app has to hold that line: showing "no account with that email" here
     * would hand back exactly the answer the server refused to give. So the
     * next screen appears either way, and someone who typed the wrong address
     * finds out by never receiving anything.
     */
    fun sendResetCode(email: String, onSent: () -> Unit) {
        val target = current()
        val address = email.trim()
        _resetEmail.value = address
        _signIn.value = SignInState.Running
        viewModelScope.launch {
            try {
                api.forgotPassword(target, address)
                _signIn.value = SignInState.Idle
                onSent()
            } catch (e: Exception) {
                // A real failure — no mail provider, or no server at all. That
                // is about this deployment, not about the address, so it is
                // safe to show and useless to hide.
                _signIn.value = SignInState.Failed(e.readable())
            }
        }
    }

    /**
     * Checks nothing on its own — there is no endpoint that only validates a
     * code, and adding one would be a way to grind through six-digit guesses
     * without ever committing to a password. The code is carried to the next
     * screen and spent there, once, together with the new password.
     */
    fun holdResetCode(code: String) { resetCode = code.trim() }

    /** Spends the code, sets the password, and signs in with what comes back. */
    fun resetPassword(password: String, onDone: () -> Unit) {
        val target = current()
        _signIn.value = SignInState.Running
        viewModelScope.launch {
            try {
                val auth = api.resetPassword(target, _resetEmail.value, resetCode, password)
                resetCode = ""
                _resetEmail.value = ""
                // Saving the token is what moves the person off the sign-in
                // screens, so the callback runs after it rather than beside it.
                applySession(auth)
                onDone()
            } catch (e: Exception) {
                _signIn.value = SignInState.Failed(e.readable())
            }
        }
    }

    fun clearReset() {
        resetCode = ""
        _resetEmail.value = ""
        _signIn.value = SignInState.Idle
    }

    /** From Settings, where the current password is the proof. */
    fun changePassword(
        currentPassword: String,
        newPassword: String,
        onDone: () -> Unit,
        onError: (String) -> Unit,
    ) {
        val target = current()
        viewModelScope.launch {
            try {
                api.changePassword(target, currentPassword, newPassword)
                onDone()
            } catch (e: Exception) {
                if (expired(e)) return@launch
                onError(e.readable())
            }
        }
    }

    private suspend fun applySession(response: AuthResponse) {
        _account.value = response.user
        _signIn.value = SignInState.Idle
        // Saved last: the whole app is gated on the token being there, so
        // writing it is what moves the person off the sign-in screen.
        store.saveToken(response.token)
    }

    /** Confirms the stored session is still good, and refreshes who it belongs to. */
    fun loadAccount() {
        val target = current()
        if (!target.isSignedIn) return
        viewModelScope.launch {
            try {
                _account.value = api.me(target)
            } catch (e: Exception) {
                expired(e)
            }
        }
    }

    /**
     * Closes the account for good. The session is dropped either way: if the
     * server did delete it, the token is dead, and leaving someone apparently
     * signed in to an account that no longer exists is the worst of both.
     */
    fun deleteAccount(onError: (String) -> Unit) {
        val target = current()
        viewModelScope.launch {
            try {
                api.deleteAccount(target)
            } catch (e: Exception) {
                if (!expired(e)) {
                    onError(e.readable())
                    return@launch
                }
            }
            forgetSession()
        }
    }

    fun signOut() {
        val target = current()
        viewModelScope.launch {
            // Best effort: the session is being abandoned either way, and a
            // server that cannot be reached must not trap anyone signed in.
            runCatching { api.logout(target) }
            forgetSession()
        }
    }

    private suspend fun forgetSession() {
        feedJob?.cancel()
        feedJob = null
        _account.value = null
        _profile.value = null
        _selected.value = null
        _parse.value = ParseState.Idle
        _uiState.value = CallsUiState()
        store.saveToken("")
    }

    /**
     * A dead session is not an error worth showing — the screens are about to
     * be replaced by the sign-in one. Returns true when it handled the failure.
     */
    private fun expired(e: Throwable): Boolean {
        if (e !is ApiException || !e.isUnauthorised) return false
        viewModelScope.launch { forgetSession() }
        return true
    }

    /**
     * Sends one sentence to be turned into a brief. Nothing is dialled — the
     * result is shown back for correction, which is why the parser is allowed
     * to leave fields empty rather than guess at them.
     */
    fun parseRequest(text: String) {
        _parse.value = ParseState.Running
        viewModelScope.launch {
            _parse.value = try {
                val brief = api.parse(current(), text)
                // A stale global error (a failed refresh, say) has no business
                // sitting above a brief that just parsed fine.
                _uiState.update { it.copy(error = null) }
                ParseState.Ready(brief)
            } catch (e: Exception) {
                ParseState.Failed(e.readable())
            }
        }
    }

    /** Keeps the user's corrections in the state the screen reads from. */
    fun editBrief(brief: Brief) {
        _parse.value = ParseState.Ready(brief)
    }

    fun clearParse() { _parse.value = ParseState.Idle }

    /** Reads the name and phone number the server already has, to prefill Settings. */
    fun loadProfile() {
        val target = current()
        if (!target.isSignedIn) return
        viewModelScope.launch {
            try {
                _profile.value = api.getProfile(target)
            } catch (e: Exception) {
                expired(e)
            }
        }
    }

    /** The name the assistant gives, and the number a hand-over rings. */
    fun saveProfile(
        ownerName: String,
        ownerPhone: String,
        onDone: () -> Unit,
        onError: (String) -> Unit,
    ) {
        viewModelScope.launch {
            try {
                _profile.value = api.saveProfile(
                    current(),
                    Profile(ownerName.trim(), ownerPhone.trim()),
                )
                // The name here is the same field the account header renders,
                // so the header is now stale. Without this it keeps showing the
                // name from sign-in until the app is restarted — and the one it
                // shows is not the one the assistant gives out on a call.
                loadAccount()
                refresh()
                onDone()
            } catch (e: Exception) {
                if (expired(e)) return@launch
                onError(e.readable())
            }
        }
    }

    // --- caller ID -----------------------------------------------------------

    /** The last answer from the server, kept so a failure can still say which
     *  number was involved and which one was going to ring. */
    private var lastCallerId = CallerId()

    private fun CallerId.asState(): CallerIdState = when {
        verified -> CallerIdState.Verified
        pendingCode.isNotBlank() ->
            CallerIdState.Waiting(pendingCode, phone, callingFrom, resumed = true)
        else -> CallerIdState.Ready(phone, callingFrom)
    }

    /**
     * Where the caller ID stands. The server asks Twilio rather than trusting
     * its own copy, and tells us about a verification call still ringing — so
     * reopening the screen mid-call lands back on the same six digits instead
     * of offering to place a second call.
     */
    fun loadCallerId() {
        val target = current()
        if (!target.isSignedIn) return
        viewModelScope.launch {
            try {
                lastCallerId = api.callerId(target)
                _callerId.value = lastCallerId.asState()
                if (_callerId.value is CallerIdState.Waiting) watchCallerId()
            } catch (e: Exception) {
                if (expired(e)) return@launch
                _callerId.value =
                    CallerIdState.Failed(e.readable(), lastCallerId.phone, lastCallerId.callingFrom)
            }
        }
    }

    /**
     * Asks Twilio to ring them and hands back the code they will have to key
     * in. The code arrives before the call is placed, which is the whole reason
     * the server sets a delay: the screen gets to say what is about to happen
     * before the phone rings.
     *
     * @param force place a new call even though one is already ringing. This is
     *   the "ring me again" path and nothing else: by default the server hands
     *   back the code from the call in flight, because two live codes and two
     *   incoming calls is worse than waiting a little longer for the first.
     */
    fun startCallerIdVerification(force: Boolean = false) {
        val target = current()
        if (!target.isSignedIn) return
        _callerId.value = CallerIdState.Loading

        viewModelScope.launch {
            val started = try {
                api.startCallerIdVerification(target, force)
            } catch (e: Exception) {
                if (expired(e)) return@launch
                _callerId.value =
                    CallerIdState.Failed(e.readable(), lastCallerId.phone, lastCallerId.callingFrom)
                return@launch
            }
            _callerId.value = CallerIdState.Waiting(
                started.code,
                started.phone,
                started.callingFrom,
                resumed = started.resumed,
            )
            watchCallerId()
        }
    }

    /**
     * Keeps asking while the call is in flight. Twilio's webhook is what
     * actually records the result server-side; this is only how the screen
     * finds out, and it has to poll because there is nothing pushing to the
     * phone. A poll that fails is a dropped request, not a failed
     * verification — the loop keeps going.
     */
    private fun watchCallerId() {
        callerIdPoll?.cancel()
        callerIdPoll = viewModelScope.launch {
            val deadline = System.currentTimeMillis() + 3 * 60_000L
            while (isActive && System.currentTimeMillis() < deadline) {
                delay(3_000)
                val answer = try {
                    api.callerId(current())
                } catch (e: Exception) {
                    continue
                }
                if (answer.verified) {
                    lastCallerId = answer
                    _callerId.value = CallerIdState.Verified
                    loadProfile()
                    return@launch
                }
            }
        }
    }

    /**
     * Stop presenting their number. This also gives it back to Twilio rather
     * than only forgetting it here: a number left on the account is one we
     * could still put on a call, and one we said we were no longer holding.
     */
    fun releaseCallerId() {
        val target = current()
        if (!target.isSignedIn) return
        viewModelScope.launch {
            try {
                api.releaseCallerId(target)
                lastCallerId = lastCallerId.copy(verified = false)
                _callerId.value = lastCallerId.asState()
                loadProfile()
            } catch (e: Exception) {
                if (expired(e)) return@launch
                _uiState.update { it.copy(error = e.readable()) }
            }
        }
    }

    /** Leaving the screen. The verification itself carries on at Twilio's end. */
    fun stopWatchingCallerId() {
        callerIdPoll?.cancel()
        callerIdPoll = null
    }

    fun clearError() = _uiState.update { it.copy(error = null) }

    /** @param quiet true for background polling, so the spinner doesn't flicker. */
    fun refresh(quiet: Boolean = false) {
        val active = current()
        if (!active.isSignedIn) {
            _uiState.update { it.copy(error = strings[R.string.error_configure_first]) }
            return
        }
        viewModelScope.launch {
            if (!quiet) _uiState.update { it.copy(loading = true, error = null) }
            try {
                val calls = api.listCalls(active)
                _uiState.update { it.copy(calls = calls, loading = false) }
            } catch (e: Exception) {
                if (expired(e)) return@launch
                _uiState.update {
                    it.copy(loading = false, error = if (quiet) it.error else e.readable())
                }
            }
        }
    }

    /**
     * @param onNeedsTopUp the account has run out of calls. Separate from the
     *   error path because it is the one refusal with something to be done
     *   about it — the composer sends them to the shop rather than leaving a
     *   message on a screen with no way forward.
     */
    fun createCall(
        request: NewCallRequest,
        onPlaced: (String) -> Unit,
        onNeedsTopUp: () -> Unit = {},
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(loading = true, error = null) }
            try {
                val call = api.createCall(current(), request)
                _uiState.update { it.copy(loading = false, calls = listOf(call) + it.calls) }
                // The balance just went down by one; the plan screen should not
                // have to be told by the server what this call already knows.
                _usage.update { it.copy(used = it.used + 1, balance = (it.balance - 1).coerceAtLeast(0)) }
                // Follow it from the background too, so "needs you" reaches the
                // phone even with the app off screen.
                CallWatchService.start(getApplication(), call.id, call.businessName)
                onPlaced(call.id)
            } catch (e: Exception) {
                if (expired(e)) return@launch
                _uiState.update { it.copy(loading = false, error = e.readable()) }
                if (e is ApiException && e.needsCredits) {
                    // Refreshed on the way, so the shop opens showing a real
                    // zero rather than whatever was last cached.
                    loadUsage()
                    onNeedsTopUp()
                }
            }
        }
    }

    /** Places the same call again — for the ones that rang out. */
    fun redial(call: Call, onPlaced: (String) -> Unit = {}) {
        createCall(
            NewCallRequest(
                goal = call.goal,
                phoneNumber = call.phoneNumber,
                businessName = call.businessName,
                template = call.template,
                constraints = call.constraints,
                language = call.language,
            ),
            onPlaced = onPlaced,
        )
    }

    /**
     * How the call went, in the caller's own judgement. Merged straight back
     * into the call so the detail screen stops asking.
     *
     * The screen says it plainly and so does this: nothing here rings anybody
     * back or reaches the business. It is a note about the assistant.
     */
    fun sendFeedback(
        callId: String,
        verdict: String,
        reasons: List<String> = emptyList(),
        note: String = "",
        onDone: () -> Unit = {},
    ) {
        viewModelScope.launch {
            try {
                val saved = api.sendFeedback(
                    current(),
                    callId,
                    FeedbackRequest(verdict = verdict, reasons = reasons, note = note),
                )
                _uiState.update { state ->
                    state.copy(calls = state.calls.map {
                        if (it.id == callId) it.copy(feedback = saved) else it
                    })
                }
                onDone()
            } catch (e: Exception) {
                if (expired(e)) return@launch
                _uiState.update { it.copy(error = e.readable()) }
            }
        }
    }

    fun hangUp(callId: String) {
        viewModelScope.launch {
            try {
                merge(api.hangUp(current(), callId))
            } catch (e: Exception) {
                if (expired(e)) return@launch
                _uiState.update { it.copy(error = e.readable()) }
            }
        }
    }

    /**
     * Types a line into a live call. The note comes straight back over the
     * socket as an "owner" transcript entry, so there is nothing to append
     * locally — if it does not appear, it did not arrive.
     */
    fun sendNote(callId: String, text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return
        viewModelScope.launch {
            try {
                api.sendNote(current(), callId, trimmed)
            } catch (e: Exception) {
                if (expired(e)) return@launch
                _uiState.update { it.copy(error = e.readable()) }
            }
        }
    }

    /** Step into a call that is already running — rings your number and bridges you in. */
    fun takeOver(callId: String) {
        viewModelScope.launch {
            try {
                merge(api.takeOver(current(), callId))
            } catch (e: Exception) {
                if (expired(e)) return@launch
                _uiState.update { it.copy(error = e.readable()) }
            }
        }
    }

    /**
     * Loads a call and follows it live until [stopWatching]. The socket is
     * reopened if it drops, because a dropped feed during a live call is
     * indistinguishable on screen from a call where nobody is saying anything.
     */
    fun watch(callId: String) {
        feedJob?.cancel()
        _selected.value = _uiState.value.calls.firstOrNull { it.id == callId }

        feedJob = viewModelScope.launch {
            var backoffMs = 1000L

            while (isActive) {
                // Re-fetching on every attempt also repairs the transcript,
                // which may have advanced while the socket was down.
                try {
                    val fresh = api.getCall(current(), callId)
                    _selected.value = fresh
                    putInList(fresh)
                    // Opening a live call also puts it under the watch service,
                    // so leaving the app does not mean missing the transfer.
                    if (fresh.isLive) CallWatchService.start(getApplication(), fresh.id, fresh.businessName)
                    backoffMs = 1000L
                } catch (e: Exception) {
                    if (expired(e)) return@launch
                    _uiState.update { it.copy(error = e.readable()) }
                    if (_selected.value == null) return@launch
                }

                try {
                    api.liveFeed(current(), callId).collect { event ->
                        when (event.type) {
                            "transcript" -> event.entry?.let { entry ->
                                _selected.update { call ->
                                    call?.copy(transcript = call.transcript + entry)
                                }
                            }
                            // A line's translation lands after the line itself,
                            // matched on its timestamp.
                            "translation" -> {
                                val at = event.at
                                val text = event.translation
                                if (at != null && text != null) {
                                    _selected.update { call ->
                                        call?.copy(
                                            transcript = call.transcript.map {
                                                if (it.at == at) it.copy(translation = text) else it
                                            },
                                        )
                                    }
                                }
                            }
                            else -> event.call?.let(::merge)
                        }
                    }
                } catch (_: Exception) {
                    // Falls through to the retry decision below.
                }

                // A closed socket on a finished call is the normal ending.
                if (_selected.value?.isLive != true) return@launch

                delay(backoffMs)
                backoffMs = (backoffMs * 2).coerceAtMost(8000L)
            }
        }
    }

    fun stopWatching() {
        feedJob?.cancel()
        feedJob = null
        _selected.value = null
    }

    /**
     * Status updates arrive without a transcript, so keep whatever we have
     * already streamed rather than blanking the conversation on every change.
     */
    private fun merge(incoming: Call) {
        _selected.update { existing ->
            when {
                // Not watching this call — leave the detail screen alone.
                existing == null || existing.id != incoming.id -> existing
                incoming.transcript.isEmpty() -> incoming.copy(transcript = existing.transcript)
                else -> incoming
            }
        }
        putInList(incoming)
    }

    private fun putInList(incoming: Call) {
        _uiState.update { state ->
            val index = state.calls.indexOfFirst { it.id == incoming.id }
            val summary = incoming.copy(transcript = emptyList())
            val calls = if (index >= 0) {
                state.calls.toMutableList().also { it[index] = summary }
            } else {
                listOf(summary) + state.calls
            }
            state.copy(calls = calls)
        }
    }

    private fun Throwable.readable(): String =
        if (this is ApiException) message ?: strings[R.string.error_generic]
        else message ?: this::class.simpleName ?: strings[R.string.error_generic]
}
