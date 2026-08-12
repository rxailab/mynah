package com.voicecall

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.voicecall.ui.VoiceCallApp
import com.voicecall.ui.theme.VoiceCallTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // A notification tap lands here with the call it was about.
        val callId = intent.getStringExtra(CallWatchService.EXTRA_CALL_ID)
        setContent {
            VoiceCallTheme {
                VoiceCallApp(initialCallId = callId)
            }
        }
    }
}
