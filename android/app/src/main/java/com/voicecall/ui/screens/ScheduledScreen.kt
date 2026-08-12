package com.voicecall.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.voicecall.R
import com.voicecall.data.ScheduledCall
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.GroupedCard
import com.voicecall.ui.OutlineButton
import com.voicecall.ui.PillSwitch
import com.voicecall.ui.ScreenHeader
import com.voicecall.ui.clickableNoRipple
import com.voicecall.ui.dayLabel
import com.voicecall.ui.formatClock
import com.voicecall.ui.navBarPadding
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import com.voicecall.ui.theme.Wise
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.remember

/**
 * Calls set to happen later.
 *
 * Note what the primary action on a due task is: "check and call", not "calling
 * now". Nothing on this screen dials — the server marks a task ready when its
 * time comes and it waits here until a person walks it through the same check
 * step as any other call. The line at the top says so, because a screen full of
 * timers is exactly where someone would assume otherwise.
 */
@Composable
fun ScheduledScreen(
    vm: CallsViewModel,
    onBack: () -> Unit,
    onCompose: () -> Unit,
    onConfirm: (ScheduledCall) -> Unit,
) {
    val tasks by vm.scheduled.collectAsState()
    val context = LocalContext.current
    val now = remember { System.currentTimeMillis() }

    LaunchedEffect(Unit) { vm.loadScheduled() }

    Column(
        Modifier
            .fillMaxSize()
            .padding(top = statusBarPadding(), bottom = navBarPadding()),
    ) {
        ScreenHeader(title = stringResource(R.string.scheduled_title), onBack = onBack)

        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 24.dp),
        ) {
            Text(stringResource(R.string.scheduled_intro), style = Type.Caption, color = Ink.Body)
            Spacer(Modifier.height(12.dp))

            if (tasks.isEmpty()) {
                Text(stringResource(R.string.scheduled_empty), style = Type.Caption, color = Ink.Mute)
            } else {
                GroupedCard(rows = tasks.map { task ->
                    { TaskRow(task, context, now, vm, onConfirm) }
                })
            }

            Spacer(Modifier.height(14.dp))
            OutlineButton(
                label = stringResource(R.string.scheduled_new),
                onClick = onCompose,
                modifier = Modifier.fillMaxWidth(),
                leading = { Icon(Wise.Plus, null, tint = Ink.Text, modifier = Modifier.size(15.dp)) },
            )
        }
    }
}

@Composable
private fun TaskRow(
    task: ScheduledCall,
    context: android.content.Context,
    now: Long,
    vm: CallsViewModel,
    onConfirm: (ScheduledCall) -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            // A paused task stays legible but stops asking for attention.
            .alpha(if (task.enabled) 1f else 0.55f)
            .padding(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.width(48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(formatClock(task.runAt), style = Type.MonoBody, color = Ink.Text)
                Text(
                    dayLabel(context, task.runAt, now),
                    style = Type.Tiny,
                    color = Ink.Mute,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(12.dp))
            Box(Modifier.width(1.dp).height(34.dp).background(Ink.Divider))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    task.goal,
                    style = Type.RowTitle,
                    color = Ink.Text,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(subtitleFor(task), style = Type.RowSub, color = Ink.Mute)
            }
            Spacer(Modifier.width(10.dp))
            PillSwitch(
                on = task.enabled,
                onClick = { vm.setScheduledEnabled(task.id, !task.enabled) },
            )
        }

        // Its time has come. The only way forward is the check step.
        if (task.isReady) {
            Spacer(Modifier.height(12.dp))
            Row {
                Box(
                    Modifier
                        .background(Ink.Lime, RoundedCornerShape(10.dp))
                        .clickableNoRipple { onConfirm(task) }
                        .padding(horizontal = 14.dp, vertical = 9.dp),
                ) {
                    Text(stringResource(R.string.scheduled_check_and_call), style = Type.ChipStrong, color = Ink.OnLime)
                }
                Spacer(Modifier.width(10.dp))
                Box(
                    Modifier
                        .clickableNoRipple { vm.dismissScheduled(task.id) }
                        .padding(horizontal = 6.dp, vertical = 9.dp),
                ) {
                    Text(stringResource(R.string.scheduled_skip), style = Type.Chip, color = Ink.Body)
                }
            }
        }
    }
}

/**
 * Repeat labels are still read because rows written before repeats were removed
 * still carry them, and a task that says "daily" should keep saying so until it
 * retires. Nothing can create one any more — see NewScheduledRequest.
 */
@Composable
private fun subtitleFor(task: ScheduledCall): String = when {
    !task.enabled -> stringResource(R.string.scheduled_paused)
    task.isReady -> stringResource(R.string.scheduled_ready)
    task.repeatDays == 1 -> stringResource(R.string.scheduled_daily)
    task.repeatDays == 7 -> stringResource(R.string.scheduled_weekly)
    task.repeatDays > 0 -> stringResource(R.string.scheduled_every_days, task.repeatDays)
    task.businessName.isNotBlank() -> task.businessName
    else -> stringResource(R.string.scheduled_once)
}
