package com.voicecall.data

import com.voicecall.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Thin client over the VoiceCall server. Every call takes the current
 * [ServerSettings] so changing the server address takes effect immediately
 * without rebuilding anything.
 */
class VoiceCallApi(private val strings: Strings) {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = false
    }

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private val jsonType = "application/json; charset=utf-8".toMediaType()

    // --- accounts ----------------------------------------------------------
    // These run before there is a session, so they take an address and no
    // token. Everything below them requires one.
    //
    // The server mounts them under /api/auth, not /auth — hitting the latter
    // gets a 404 that reads like the endpoint does not exist at all.

    suspend fun authMethods(settings: ServerSettings): AuthMethods =
        execute(settings, "/api/auth/methods", needsToken = false) { url -> Request.Builder().url(url).get() }

    suspend fun register(settings: ServerSettings, email: String, password: String, name: String?): AuthResponse =
        openPost(settings, "/api/auth/register", json.encodeToString(RegisterRequest.serializer(), RegisterRequest(email, password, name)))

    suspend fun login(settings: ServerSettings, email: String, password: String): AuthResponse =
        openPost(settings, "/api/auth/login", json.encodeToString(LoginRequest.serializer(), LoginRequest(email, password)))

    suspend fun startPhoneSignIn(settings: ServerSettings, phone: String): OkResponse =
        openPost(settings, "/api/auth/phone/start", json.encodeToString(PhoneStartRequest.serializer(), PhoneStartRequest(phone)))

    suspend fun checkPhoneCode(settings: ServerSettings, phone: String, code: String): AuthResponse =
        openPost(settings, "/api/auth/phone/check", json.encodeToString(PhoneCheckRequest.serializer(), PhoneCheckRequest(phone, code)))

    /**
     * Trades a Google ID token for a session. The server checks the token with
     * Google itself — this app is not a place to decide who someone is.
     */
    suspend fun signInWithGoogle(settings: ServerSettings, idToken: String): AuthResponse =
        openPost(
            settings,
            "/api/auth/google",
            json.encodeToString(GoogleSignInRequest.serializer(), GoogleSignInRequest(idToken)),
        )

    /**
     * Asks for a reset code. Answers the same way whether or not the address
     * has an account — the server will not say, and neither should the screen.
     */
    suspend fun forgotPassword(settings: ServerSettings, email: String): OkResponse =
        openPost(
            settings,
            "/api/auth/password/forgot",
            json.encodeToString(ForgotPasswordRequest.serializer(), ForgotPasswordRequest(email)),
        )

    /** Spends the code, sets the password, and hands back a session. */
    suspend fun resetPassword(
        settings: ServerSettings,
        email: String,
        code: String,
        password: String,
    ): AuthResponse = openPost(
        settings,
        "/api/auth/password/reset",
        json.encodeToString(
            ResetPasswordRequest.serializer(),
            ResetPasswordRequest(email, code, password),
        ),
    )

    /** From inside the app, where the current password is the proof. */
    suspend fun changePassword(
        settings: ServerSettings,
        currentPassword: String,
        newPassword: String,
    ): OkResponse = post(
        settings,
        "/api/auth/password",
        json.encodeToString(
            ChangePasswordRequest.serializer(),
            ChangePasswordRequest(currentPassword, newPassword),
        ),
    )

    suspend fun sendFeedback(
        settings: ServerSettings,
        id: String,
        request: FeedbackRequest,
    ): Feedback = post(
        settings,
        "/api/calls/$id/feedback",
        json.encodeToString(FeedbackRequest.serializer(), request),
    )

    suspend fun me(settings: ServerSettings): Account = get<MeResponse>(settings, "/api/auth/me").user

    suspend fun logout(settings: ServerSettings): OkResponse = post(settings, "/api/auth/logout", "{}")

    /**
     * Closes the account and erases everything belonging to it. Irreversible on
     * the server — there is no soft delete to undo.
     */
    suspend fun deleteAccount(settings: ServerSettings): OkResponse =
        execute(settings, "/api/auth/me") { url -> Request.Builder().url(url).delete() }

    suspend fun usage(settings: ServerSettings): Usage = get(settings, "/api/usage")

    /**
     * A web address for paying by card, WeChat Pay or Alipay. Issued fresh each
     * time and short-lived, so it is asked for when the button is pressed
     * rather than held on to.
     */
    suspend fun payLink(settings: ServerSettings): PayLink =
        post(settings, "/api/billing/link", "{}")

    /** Opens a payment the app collects itself, without sending anyone to a browser. */
    suspend fun paymentIntent(settings: ServerSettings, priceId: String): PaymentIntent =
        post(
            settings,
            "/api/billing/stripe/intent",
            json.encodeToString(PaymentIntentRequest.serializer(), PaymentIntentRequest(priceId)),
        )

    /**
     * Hands a Play purchase to the server, which asks Google about it before
     * crediting anything. The purchase is only consumed once this returns, so
     * a crash between paying and delivering is recoverable — and the server
     * credits an order id once however often it arrives.
     */
    suspend fun verifyPlayPurchase(
        settings: ServerSettings,
        productId: String,
        purchaseToken: String,
    ): PlayVerification = post(
        settings,
        "/api/billing/play/verify",
        json.encodeToString(
            PlayVerifyRequest.serializer(),
            PlayVerifyRequest(productId, purchaseToken),
        ),
    )

    suspend fun serverConfig(settings: ServerSettings): ServerConfig =
        get(settings, "/api/config")

    suspend fun listCalls(settings: ServerSettings): List<Call> =
        get<CallsResponse>(settings, "/api/calls").calls

    suspend fun getCall(settings: ServerSettings, id: String): Call =
        get(settings, "/api/calls/$id")

    suspend fun createCall(settings: ServerSettings, request: NewCallRequest): Call =
        post(settings, "/api/calls", json.encodeToString(NewCallRequest.serializer(), request))

    suspend fun parse(settings: ServerSettings, text: String): Brief =
        post(settings, "/api/parse", json.encodeToString(ParseRequest.serializer(), ParseRequest(text)))

    suspend fun getProfile(settings: ServerSettings): Profile = get(settings, "/api/profile")

    suspend fun saveProfile(settings: ServerSettings, profile: Profile): Profile =
        put(settings, "/api/profile", json.encodeToString(Profile.serializer(), profile))

    /**
     * Caller ID: whether the business sees their number or ours. The server
     * asks Twilio on every check rather than trusting its own copy, so this is
     * also what the verify screen polls while waiting for the call to be
     * answered.
     */
    suspend fun callerId(settings: ServerSettings): CallerId = get(settings, "/api/caller-id")

    /**
     * @param force place a new call even if one is already ringing. Only for
     *   "ring me again" — without it the server hands back the code from the
     *   call already in flight rather than starting a second one.
     */
    suspend fun startCallerIdVerification(
        settings: ServerSettings,
        force: Boolean = false,
    ): CallerIdVerification = post(
        settings,
        "/api/caller-id/verify",
        json.encodeToString(ForceRequest.serializer(), ForceRequest(force)),
    )

    suspend fun releaseCallerId(settings: ServerSettings): OkResponse =
        execute(settings, "/api/caller-id") { url -> Request.Builder().url(url).delete() }

    // --- scheduled calls ---------------------------------------------------
    // None of these dial. The server marks a task ready when its time comes and
    // the app walks it through the same check step as any other call.

    suspend fun scheduled(settings: ServerSettings): List<ScheduledCall> =
        get<ScheduledResponse>(settings, "/api/scheduled").tasks

    suspend fun createScheduled(settings: ServerSettings, request: NewScheduledRequest): ScheduledCall =
        post(settings, "/api/scheduled", json.encodeToString(NewScheduledRequest.serializer(), request))

    suspend fun patchScheduled(
        settings: ServerSettings,
        id: String,
        patch: ScheduledPatch,
    ): ScheduledCall = execute(settings, "/api/scheduled/$id") { url ->
        Request.Builder().url(url)
            .patch(json.encodeToString(ScheduledPatch.serializer(), patch).toRequestBody(jsonType))
    }

    suspend fun deleteScheduled(settings: ServerSettings, id: String): OkResponse =
        execute(settings, "/api/scheduled/$id") { url -> Request.Builder().url(url).delete() }

    suspend fun hangUp(settings: ServerSettings, id: String): Call =
        post(settings, "/api/calls/$id/hangup", "{}")

    suspend fun takeOver(settings: ServerSettings, id: String): Call =
        post(settings, "/api/calls/$id/takeover", "{}")

    /** A line typed mid-call, for the assistant to act on. */
    suspend fun sendNote(settings: ServerSettings, id: String, text: String): OkResponse =
        post(settings, "/api/calls/$id/note", json.encodeToString(NoteRequest.serializer(), NoteRequest(text)))

    /**
     * Live transcript and status for one call. Emits until the socket closes;
     * reconnection is the caller's business.
     */
    fun liveFeed(settings: ServerSettings, callId: String): Flow<FeedEvent> = callbackFlow {
        // OkHttp upgrades an https:// request to a WebSocket itself — handing it
        // a wss:// URL fails to parse.
        val base = settings.normalisedBase()
            ?: throw ApiException(strings[R.string.error_need_https])

        val url = "$base/app".toHttpUrlOrNull()?.newBuilder()
            ?.addQueryParameter("ref", callId)
            ?.addQueryParameter("token", settings.apiToken)
            ?.build()
            ?: throw ApiException(strings[R.string.error_bad_url])

        val socket = http.newWebSocket(
            Request.Builder().url(url).build(),
            object : WebSocketListener() {
                override fun onMessage(webSocket: WebSocket, text: String) {
                    val event = runCatching { json.decodeFromString(FeedEvent.serializer(), text) }
                        .getOrNull() ?: return
                    trySend(event)
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    close(ApiException(t.message ?: strings[R.string.error_feed_dropped]))
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    close()
                }
            },
        )

        awaitClose { socket.cancel() }
    }

    // --- plumbing ----------------------------------------------------------

    private suspend inline fun <reified T> get(settings: ServerSettings, path: String): T =
        execute(settings, path) { url -> Request.Builder().url(url).get() }

    private suspend inline fun <reified T> post(
        settings: ServerSettings,
        path: String,
        body: String,
    ): T = execute(settings, path) { url ->
        Request.Builder().url(url).post(body.toRequestBody(jsonType))
    }

    /** A POST made before anyone is signed in. */
    private suspend inline fun <reified T> openPost(
        settings: ServerSettings,
        path: String,
        body: String,
    ): T = execute(settings, path, needsToken = false) { url ->
        Request.Builder().url(url).post(body.toRequestBody(jsonType))
    }

    private suspend inline fun <reified T> put(
        settings: ServerSettings,
        path: String,
        body: String,
    ): T = execute(settings, path) { url ->
        Request.Builder().url(url).put(body.toRequestBody(jsonType))
    }

    private suspend inline fun <reified T> execute(
        settings: ServerSettings,
        path: String,
        needsToken: Boolean = true,
        build: (String) -> Request.Builder,
    ): T {
        val base = settings.normalisedBase()
            ?: throw ApiException(strings[R.string.error_need_address])
        if (needsToken && settings.apiToken.isBlank()) throw ApiException(strings[R.string.error_need_token])

        val request = build(base + path)
            .apply { if (settings.apiToken.isNotBlank()) header("Authorization", "Bearer ${settings.apiToken}") }
            .header("Accept", "application/json")
            .build()

        val payload = withContext(Dispatchers.IO) {
            try {
                http.newCall(request).execute().use { response ->
                    // OkHttp 5 made the body non-null, so there is nothing to
                    // guard against here any more.
                    val text = response.body.string()
                    if (!response.isSuccessful) throw failure(response.code, text)
                    text
                }
            } catch (e: ApiException) {
                throw e
            } catch (e: IOException) {
                throw ApiException(
                    strings[R.string.error_unreachable, e.message ?: strings[R.string.error_network]],
                )
            }
        }

        return try {
            json.decodeFromString(payload)
        } catch (e: Exception) {
            throw ApiException(strings[R.string.error_unexpected_body, e.message.orEmpty()])
        }
    }

    private fun failure(code: Int, body: String): ApiException {
        val parsed = runCatching { json.decodeFromString(ApiError.serializer(), body) }.getOrNull()
        // The server's own message wins when it has one: it knows why it
        // refused. Those come back in English — see the note in the README.
        val message = when {
            parsed?.error != null -> parsed.error
            code == 401 -> strings[R.string.error_bad_token]
            code == 404 -> strings[R.string.error_no_such_call]
            else -> strings[R.string.error_http, code]
        }
        return ApiException(message, code, needsCredits = parsed?.needsCredits == true)
    }
}
