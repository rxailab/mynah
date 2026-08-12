package com.voicecall.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.voicecall.R
import com.voicecall.ui.CallerIdState
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.LinkText
import com.voicecall.ui.PrimaryButton
import com.voicecall.ui.PulsingDot
import com.voicecall.ui.SectionLabel
import com.voicecall.ui.WiseCard
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type

/**
 * Clearing their own number to be shown to the businesses the assistant calls.
 *
 * Twilio will only present a number it has confirmed the account holds, and it
 * confirms it the only way a voice line can be proved: by ringing the number
 * and having whoever answers key a six-digit code in. That is an awkward thing
 * to ask of the people this app is for — an unannounced call from a US number
 * asking for digits is precisely the shape of a scam, and the ones most likely
 * to hang up are the ones most likely to need the app.
 *
 * So the screen does the announcing. The code and the number that is about to
 * ring go up first, and the server holds the call back for a few seconds to
 * make room for that. The rest is saying plainly what will and will not happen.
 *
 * Skippable only in the sense that you can go and look around the app first.
 * Calls go out under your own number or they do not go out, so nothing can be
 * dialled until this is done — the copy says so rather than letting someone
 * discover it at the end of writing a brief.
 */
@Composable
fun VerifyNumberScreen(vm: CallsViewModel, onDone: () -> Unit) {
    val state by vm.callerId.collectAsState()

    LaunchedEffect(Unit) { vm.loadCallerId() }
    // The verification carries on at Twilio's end either way; this only stops
    // the polling, which has nothing left to tell anyone once nobody is here.
    DisposableEffect(Unit) { onDispose { vm.stopWatchingCallerId() } }

    Column(
        Modifier
            .fillMaxSize()
            .background(Ink.Card)
            .padding(top = statusBarPadding())
            .padding(bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()),
    ) {
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 28.dp, end = 28.dp, top = 44.dp),
        ) {
            when (val s = state) {
                is CallerIdState.Waiting -> Waiting(s)
                CallerIdState.Verified -> Verified(vm)
                is CallerIdState.Failed -> Intro(phone = s.phone, error = s.reason)
                is CallerIdState.Ready -> Intro(phone = s.phone, error = null)
                CallerIdState.Loading -> Intro(phone = "", error = null, busy = true)
            }
            Spacer(Modifier.height(20.dp))
        }

        Column(Modifier.padding(start = 28.dp, end = 28.dp, bottom = 24.dp)) {
            when (val s = state) {
                CallerIdState.Verified -> {
                    PrimaryButton(
                        label = stringResource(R.string.action_done),
                        onClick = onDone,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                is CallerIdState.Waiting -> {
                    // No primary action while the call is in flight — pressing
                    // something here would only re-ring a phone that is already
                    // ringing. Retry lives under it for when it did not arrive.
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        PulsingDot(colour = Ink.Positive, size = 8.dp)
                        Spacer(Modifier.width(9.dp))
                        Text(
                            stringResource(R.string.callerid_waiting_status),
                            style = Type.Caption,
                            color = Ink.Body,
                        )
                    }
                    Spacer(Modifier.height(16.dp))
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        // The one place a second call is the right answer: they
                        // are telling us the first one never arrived.
                        LinkText(
                            stringResource(R.string.callerid_retry),
                            { vm.startCallerIdVerification(force = true) },
                            style = Type.LinkSmall,
                        )
                    }
                }

                else -> {
                    val busy = s is CallerIdState.Loading
                    PrimaryButton(
                        label = stringResource(
                            if (busy) R.string.callerid_starting else R.string.callerid_start,
                        ),
                        onClick = { vm.startCallerIdVerification() },
                        enabled = !busy && phoneOf(s).isNotBlank(),
                        modifier = Modifier.fillMaxWidth(),
                        leading = if (busy) {
                            {
                                CircularProgressIndicator(
                                    color = Ink.OnLime,
                                    strokeWidth = 2.dp,
                                    modifier = Modifier.size(15.dp),
                                )
                            }
                        } else null,
                    )
                }
            }

            if (state !is CallerIdState.Verified) {
                Spacer(Modifier.height(16.dp))
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    LinkText(
                        stringResource(R.string.action_skip_for_now),
                        onDone,
                        style = Type.LinkSmall,
                    )
                }
            }
        }
    }
}

private fun phoneOf(state: CallerIdState): String = when (state) {
    is CallerIdState.Ready -> state.phone
    is CallerIdState.Waiting -> state.phone
    is CallerIdState.Failed -> state.phone
    else -> ""
}

@Composable
private fun Intro(phone: String, error: String?, busy: Boolean = false) {
    Text(stringResource(R.string.callerid_step_label), style = Type.LabelSmall, color = Ink.Mute)
    Spacer(Modifier.height(10.dp))
    Text(stringResource(R.string.callerid_title), style = Type.Heading, color = Ink.Text)
    Spacer(Modifier.height(10.dp))
    Text(stringResource(R.string.callerid_body), style = Type.Caption, color = Ink.Body)

    if (phone.isNotBlank()) {
        Spacer(Modifier.height(24.dp))
        WiseCard(fill = Ink.CardSoft, radius = 18.dp) {
            Column(Modifier.padding(horizontal = 18.dp, vertical = 16.dp)) {
                SectionLabel(stringResource(R.string.callerid_your_number))
                Spacer(Modifier.height(6.dp))
                Text(phone, style = Type.MonoBody, color = Ink.Text)
            }
        }
    }

    Spacer(Modifier.height(18.dp))
    Text(stringResource(R.string.callerid_heads_up), style = Type.Fine, color = Ink.Mute)

    if (!busy && error != null) {
        Spacer(Modifier.height(14.dp))
        Text(error, style = Type.Caption, color = Ink.NegativeDeep)
    }
}

@Composable
private fun Waiting(state: CallerIdState.Waiting) {
    Text(stringResource(R.string.callerid_step_label), style = Type.LabelSmall, color = Ink.Mute)
    Spacer(Modifier.height(10.dp))
    Text(
        stringResource(
            if (state.resumed) R.string.callerid_resumed_title else R.string.callerid_waiting_title,
        ),
        style = Type.Heading,
        color = Ink.Text,
    )

    // Coming back to a phone that is already ringing, the first thing to settle
    // is that this is the same call and the same digits — otherwise the obvious
    // reading is that we rang them twice.
    if (state.resumed) {
        Spacer(Modifier.height(10.dp))
        Text(stringResource(R.string.callerid_resumed_note), style = Type.Caption, color = Ink.Body)
    }

    Spacer(Modifier.height(26.dp))

    // The number first, then the code: that is the order they are needed in.
    WiseCard(fill = Ink.CardSoft, radius = 18.dp) {
        Column(Modifier.padding(horizontal = 18.dp, vertical = 16.dp)) {
            SectionLabel(stringResource(R.string.callerid_incoming_label))
            Spacer(Modifier.height(6.dp))
            Text(state.callingFrom, style = Type.MonoBody, color = Ink.Text)
        }
    }

    Spacer(Modifier.height(12.dp))

    WiseCard(fill = Ink.LimePale, radius = 18.dp) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            SectionLabel(stringResource(R.string.callerid_code_label), colour = Ink.Deep)
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                state.code.forEach { digit ->
                    Box(
                        Modifier
                            .size(width = 38.dp, height = 50.dp)
                            .background(Ink.Card, RoundedCornerShape(10.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(digit.toString(), style = Type.Pushed, color = Ink.Text)
                    }
                }
            }
        }
    }

    Spacer(Modifier.height(18.dp))
    Text(stringResource(R.string.callerid_waiting_note), style = Type.Fine, color = Ink.Mute)
}

@Composable
private fun Verified(vm: CallsViewModel) {
    val profile by vm.profile.collectAsState()

    Box(
        Modifier.size(44.dp).background(Ink.Lime, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text("✓", style = Type.Section, color = Ink.OnLime)
    }
    Spacer(Modifier.height(18.dp))
    Text(stringResource(R.string.callerid_done_title), style = Type.Heading, color = Ink.Text)
    Spacer(Modifier.height(10.dp))
    Text(
        stringResource(R.string.callerid_done_body, profile?.ownerPhone.orEmpty()),
        style = Type.Caption,
        color = Ink.Body,
    )
}
