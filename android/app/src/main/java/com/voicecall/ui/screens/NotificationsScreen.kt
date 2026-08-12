package com.voicecall.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.voicecall.R
import com.voicecall.data.Call
import com.voicecall.data.CallStatus
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.FeedRow
import com.voicecall.ui.GroupLabel
import com.voicecall.ui.GroupedCard
import com.voicecall.ui.ScreenHeader
import com.voicecall.ui.clickableNoRipple
import com.voicecall.ui.dayLabel
import com.voicecall.ui.formatClock
import com.voicecall.ui.navBarPadding
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import com.voicecall.ui.theme.Wise

/**
 * What the assistant wants you to know.
 *
 * Derived from the calls rather than stored: every notification the prototype
 * shows — started, finished, nobody answered, needs you — is a transition this
 * app can already see in the call list, so there is nothing here the server has
 * to remember on our behalf.
 *
 * The one thing that genuinely needs storage is read state, and rather than fake
 * it this screen leaves it out: the hand-over banner stays at the top for as
 * long as the call is actually waiting, which is the only "unread" that matters.
 */
@Composable
fun NotificationsScreen(
    vm: CallsViewModel,
    onBack: () -> Unit,
    onOpenCall: (String) -> Unit,
    onOpenDetail: (String) -> Unit,
) {
    val state by vm.uiState.collectAsState()
    val context = LocalContext.current
    val now = remember { System.currentTimeMillis() }

    LaunchedEffect(Unit) { vm.refresh(quiet = true) }

    val waiting = state.calls.filter { it.status == CallStatus.TRANSFERRING }
    val rest = state.calls.filterNot { it.status == CallStatus.TRANSFERRING }

    Column(
        Modifier
            .fillMaxSize()
            .padding(top = statusBarPadding(), bottom = navBarPadding()),
    ) {
        ScreenHeader(title = stringResource(R.string.nav_notifications), onBack = onBack)

        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 24.dp),
        ) {
            // A call holding the line for you is not a list item. It is the
            // reason the app has a notification screen at all.
            waiting.forEach { call ->
                HandoverBanner(call) { onOpenCall(call.id) }
                Spacer(Modifier.height(12.dp))
            }

            if (rest.isEmpty() && waiting.isEmpty()) {
                Text(stringResource(R.string.notifs_empty), style = Type.Caption, color = Ink.Mute)
            }

            rest.groupBy { dayLabel(context, it.createdAt, now) }.forEach { (day, calls) ->
                GroupLabel(day, modifier = Modifier.padding(top = 6.dp, bottom = 8.dp))
                GroupedCard(rows = calls.map { call ->
                    {
                        FeedRow(
                            dot = dotFor(call),
                            title = headlineFor(call),
                            subtitle = call.summary?.ifBlank { null } ?: call.goal,
                            pulsing = call.isLive,
                            onClick = { if (call.isLive) onOpenCall(call.id) else onOpenDetail(call.id) },
                            right = {
                                Text(
                                    formatClock(call.endedAt ?: call.createdAt),
                                    style = Type.Mono,
                                    color = Ink.Rim,
                                )
                            },
                        )
                    }
                })
                Spacer(Modifier.height(16.dp))
            }
        }
    }
}

/** Amber, loud, and the only thing on the screen with a button in it. */
@Composable
private fun HandoverBanner(call: Call, onOpen: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(Ink.Warning, RoundedCornerShape(16.dp))
            .padding(16.dp),
    ) {
        Row {
            Box(
                Modifier.padding(top = 6.dp).size(8.dp).background(Ink.WarningDeep, CircleShape),
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    stringResource(R.string.headline_needs_you, call.businessName),
                    style = Type.RowTitle,
                    color = Ink.WarningInk,
                )
                Spacer(Modifier.height(3.dp))
                Text(
                    stringResource(R.string.subline_transfer),
                    style = Type.RowSub,
                    color = Ink.WarningInk,
                )
                Spacer(Modifier.height(10.dp))
                Row(
                    Modifier
                        .border(1.5.dp, Ink.WarningInk, RoundedCornerShape(10.dp))
                        .clickableNoRipple(onOpen)
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Wise.Phone, null, tint = Ink.WarningInk, modifier = Modifier.size(13.dp))
                    Spacer(Modifier.width(7.dp))
                    Text(
                        stringResource(R.string.action_bridge_me),
                        style = Type.ChipStrong,
                        color = Ink.WarningInk,
                    )
                }
            }
        }
    }
}

private fun dotFor(call: Call): Color = when {
    call.isLive -> Ink.Lime
    call.status == CallStatus.FAILED -> Ink.Negative
    call.outcome == "failed" -> Ink.Negative
    call.status == CallStatus.COMPLETED -> Ink.Positive
    else -> Ink.Rim
}

@Composable
private fun headlineFor(call: Call): String = when {
    call.isLive -> stringResource(R.string.notifs_started, call.businessName)
    call.status == CallStatus.FAILED -> stringResource(R.string.notifs_no_answer, call.businessName)
    else -> stringResource(R.string.notifs_finished, call.businessName)
}
