package com.voicecall

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.voicecall.data.Call
import com.voicecall.data.CallStatus
import com.voicecall.data.ServerSettings
import com.voicecall.data.SettingsStore
import com.voicecall.data.Strings
import com.voicecall.data.VoiceCallApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Follows one live call so the phone can say "you're needed" without the app
 * being on screen. Started when a call is placed or opened; posts a
 * high-priority notification the moment the assistant starts transferring to
 * you, a summary when the call ends, and then stops itself.
 *
 * This is a plain foreground service, not push: if Android kills the process,
 * the watch dies with it. For a call you just placed from your own phone that
 * trade is fine, and it needs no Firebase account.
 */
class CallWatchService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var job: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_LIVE, getString(R.string.notif_channel_live), NotificationManager.IMPORTANCE_LOW),
        )
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ALERTS, getString(R.string.notif_channel_alerts), NotificationManager.IMPORTANCE_HIGH),
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val callId = intent?.getStringExtra(EXTRA_CALL_ID)
        if (callId == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        startForeground(ID_ONGOING, ongoing(intent.getStringExtra(EXTRA_NAME) ?: "", callId))

        job?.cancel()
        job = scope.launch { follow(callId) }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private suspend fun follow(callId: String) {
        val store = SettingsStore(applicationContext)
        val settings: ServerSettings = store.settings.first()
        if (!settings.isSignedIn) {
            stopSelf(); return
        }
        // The service outlives any screen, so resolve text in the saved language.
        val language = store.language.first()
        val s = Strings(applicationContext) { language }
        val api = VoiceCallApi(s)

        var transferNotified = false
        var backoffMs = 2000L

        while (currentCoroutineContext().isActive) {
            val snapshot = runCatching { api.getCall(settings, callId) }.getOrNull()
            if (snapshot != null) {
                if (react(snapshot, s, transferNotified)) transferNotified = true
                if (!snapshot.isLive) break
            }

            var finished = false
            runCatching {
                api.liveFeed(settings, callId).collect { event ->
                    val call = event.call ?: return@collect
                    if (call.id != callId) return@collect
                    if (react(call, s, transferNotified)) transferNotified = true
                    if (!call.isLive) {
                        finished = true
                        throw kotlinx.coroutines.CancellationException("call finished")
                    }
                }
            }
            if (finished) break

            // Socket dropped on a call that may still be running: check again.
            delay(backoffMs)
            backoffMs = (backoffMs * 2).coerceAtMost(15000L)
        }

        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    /** Returns true when the needs-you alert was just posted. */
    private fun react(call: Call, s: Strings, alreadyNotified: Boolean): Boolean {
        val notifier = NotificationManagerCompat.from(this)

        when {
            call.status == CallStatus.TRANSFERRING && !alreadyNotified -> {
                notifier.safeNotify(ID_ALERT, NotificationCompat.Builder(this, CHANNEL_ALERTS)
                    .setSmallIcon(android.R.drawable.stat_sys_phone_call)
                    .setContentTitle(s[R.string.notif_needs_you_title, call.businessName])
                    .setContentText(s[R.string.subline_transfer])
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setAutoCancel(true)
                    .setContentIntent(openDetail(call.id))
                    .build())
                return true
            }

            !call.isLive -> {
                notifier.cancel(ID_ALERT)
                val failed = call.status == CallStatus.FAILED
                val title = if (failed) s[R.string.notif_no_answer_title, call.businessName]
                            else s[R.string.notif_done_title, call.businessName]
                val body = call.summary ?: call.error ?: call.goal
                notifier.safeNotify(ID_RESULT, NotificationCompat.Builder(this, CHANNEL_ALERTS)
                    .setSmallIcon(android.R.drawable.stat_sys_phone_call)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                    .setAutoCancel(true)
                    .setContentIntent(openDetail(call.id))
                    .build())
            }

            else -> notifier.safeNotify(ID_ONGOING, ongoing(call.businessName, call.id))
        }
        return false
    }

    private fun ongoing(businessName: String, callId: String) =
        NotificationCompat.Builder(this, CHANNEL_LIVE)
            .setSmallIcon(android.R.drawable.stat_sys_phone_call)
            .setContentTitle(getString(R.string.notif_ongoing, businessName.ifBlank { "…" }))
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(openDetail(callId))
            .build()

    private fun openDetail(callId: String): PendingIntent =
        PendingIntent.getActivity(
            this,
            callId.hashCode(),
            Intent(this, MainActivity::class.java)
                .putExtra(EXTRA_CALL_ID, callId)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

    /** On 13+ notifying without permission is a silent no-op; keep it that way. */
    private fun NotificationManagerCompat.safeNotify(id: Int, notification: android.app.Notification) {
        try {
            notify(id, notification)
        } catch (_: SecurityException) {
        }
    }

    companion object {
        const val EXTRA_CALL_ID = "callId"
        private const val EXTRA_NAME = "businessName"
        private const val CHANNEL_LIVE = "live"
        private const val CHANNEL_ALERTS = "alerts"
        private const val ID_ONGOING = 1
        private const val ID_ALERT = 2
        private const val ID_RESULT = 3

        fun start(context: Context, callId: String, businessName: String) {
            ContextCompat.startForegroundService(
                context,
                Intent(context, CallWatchService::class.java)
                    .putExtra(EXTRA_CALL_ID, callId)
                    .putExtra(EXTRA_NAME, businessName),
            )
        }
    }
}
