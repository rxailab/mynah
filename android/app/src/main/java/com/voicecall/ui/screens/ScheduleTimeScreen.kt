package com.voicecall.ui.screens

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.voicecall.R
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.ParseState
import com.voicecall.ui.PrimaryButton
import com.voicecall.ui.ScreenHeader
import com.voicecall.ui.WiseCard
import com.voicecall.ui.clickableNoRipple
import com.voicecall.ui.navBarPadding
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import com.voicecall.ui.theme.Wise
import java.util.Calendar

/** The hours worth one tap. Anything else goes through the custom picker. */
private val HOURS = listOf(8, 9, 10, 12, 14, 16, 18)

/**
 * When to make the call — a date and an hour, and nothing else.
 *
 * There is no repeat option on this screen and there is no room for one. A
 * standing rule that rings a stranger every morning is a robocall from their
 * end whatever it was set up for, and the server refuses to store one, so
 * offering it here would only be a way to reach an error message.
 *
 * Chips rather than wheels: seven hours cover almost every real answer, and the
 * two that do not open the platform pickers. The pale green card restates what
 * "scheduled" means here, because it is not what the word usually means — the
 * assistant does not dial when the time comes, it asks.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ScheduleTimeScreen(vm: CallsViewModel, onBack: () -> Unit, onScheduled: () -> Unit) {
    val parse by vm.parse.collectAsState()
    val brief = (parse as? ParseState.Ready)?.brief

    // The brief is gone (process death, or a cleared parse) — go back rather
    // than show a screen with nothing to schedule.
    if (brief == null) {
        LaunchedEffect(Unit) { onBack() }
        return
    }

    val context = LocalContext.current
    val now = remember { Calendar.getInstance() }

    // Day and hour are held apart until the button is pressed: picking "today"
    // and then an hour that has gone is a mistake worth catching at the point
    // of booking rather than by silently moving the date.
    var day by remember { mutableStateOf(startOfDay(now.timeInMillis)) }
    var hour by remember { mutableStateOf<Int?>(null) }
    var minute by remember { mutableStateOf(0) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val today = remember { startOfDay(now.timeInMillis) }
    val tomorrow = remember { today + 86_400_000L }
    val runAt = hour?.let { day + it * 3_600_000L + minute * 60_000L }

    Column(
        Modifier
            .fillMaxSize()
            .padding(top = statusBarPadding(), bottom = navBarPadding()),
    ) {
        ScreenHeader(title = stringResource(R.string.schedule_title), onBack = onBack)

        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, top = 14.dp),
        ) {
            WiseCard(radius = 24.dp) {
                Column(Modifier.padding(20.dp)) {
                    Text(
                        stringResource(R.string.schedule_date).uppercase(),
                        style = Type.LabelSmall,
                        color = Ink.Mute,
                    )
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Chip(stringResource(R.string.schedule_today), day == today) {
                            day = today; error = null
                        }
                        Chip(
                            stringResource(R.string.schedule_tomorrow, dayLabel(tomorrow)),
                            day == tomorrow,
                        ) { day = tomorrow; error = null }
                        Chip(
                            if (day != today && day != tomorrow) dayLabel(day)
                            else stringResource(R.string.schedule_pick_date),
                            day != today && day != tomorrow,
                        ) {
                            val c = Calendar.getInstance().apply { timeInMillis = day }
                            DatePickerDialog(
                                context,
                                { _, y, m, d ->
                                    day = startOfDay(
                                        Calendar.getInstance().apply { set(y, m, d, 0, 0, 0) }.timeInMillis,
                                    )
                                    error = null
                                },
                                c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH),
                            ).apply {
                                // Yesterday is never a valid answer here.
                                datePicker.minDate = today
                            }.show()
                        }
                    }

                    Spacer(Modifier.height(16.dp))
                    Box(Modifier.fillMaxWidth().height(1.dp).background(Ink.Divider))
                    Spacer(Modifier.height(16.dp))

                    Text(
                        stringResource(R.string.schedule_time).uppercase(),
                        style = Type.LabelSmall,
                        color = Ink.Mute,
                    )
                    Spacer(Modifier.height(10.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        HOURS.forEach { h ->
                            Chip("%02d:00".format(h), hour == h && minute == 0, mono = true) {
                                hour = h; minute = 0; error = null
                            }
                        }
                        Chip(
                            if (hour != null && (minute != 0 || hour !in HOURS)) {
                                "%02d:%02d".format(hour, minute)
                            } else {
                                stringResource(R.string.schedule_custom_time)
                            },
                            hour != null && (minute != 0 || hour !in HOURS),
                        ) {
                            TimePickerDialog(
                                context,
                                { _, h, m -> hour = h; minute = m; error = null },
                                hour ?: 9, minute, true,
                            ).show()
                        }
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .background(Ink.LimePale, RoundedCornerShape(16.dp))
                    .padding(16.dp),
            ) {
                Text(stringResource(R.string.schedule_note), style = Type.Caption, color = Ink.Deep)
            }

            error?.let {
                Spacer(Modifier.height(12.dp))
                Text(
                    it,
                    style = Type.Caption,
                    color = Ink.NegativeDeep,
                    modifier = Modifier.padding(horizontal = 6.dp),
                )
            }

            Spacer(Modifier.height(24.dp))
        }

        Box(Modifier.padding(start = 20.dp, end = 20.dp, bottom = 20.dp)) {
            PrimaryButton(
                label = runAt?.let { stringResource(R.string.schedule_confirm, whenLabel(it, today, tomorrow)) }
                    ?: stringResource(R.string.schedule_no_time),
                onClick = {
                    val at = runAt ?: return@PrimaryButton
                    // Caught here rather than at the server, which would say the
                    // same thing a round trip later.
                    if (at <= System.currentTimeMillis()) {
                        error = context.getString(R.string.schedule_past)
                        return@PrimaryButton
                    }
                    saving = true
                    error = null
                    vm.scheduleCall(
                        request = brief.toScheduledRequest(at),
                        onDone = { saving = false; vm.clearParse(); onScheduled() },
                        onError = { saving = false; error = it },
                    )
                },
                enabled = runAt != null && !saving,
                modifier = Modifier.fillMaxWidth(),
                leading = {
                    Icon(Wise.Clock, null, tint = Ink.OnLime, modifier = Modifier.size(16.dp))
                },
            )
        }
    }
}

@Composable
private fun Chip(label: String, selected: Boolean, mono: Boolean = false, onClick: () -> Unit) {
    Box(
        Modifier
            .background(
                if (selected) Ink.Text else Ink.Card,
                RoundedCornerShape(10.dp),
            )
            .then(
                if (selected) Modifier
                else Modifier.border(1.dp, Ink.Hairline, RoundedCornerShape(10.dp)),
            )
            .clickableNoRipple(onClick)
            .padding(horizontal = 13.dp, vertical = 7.dp),
    ) {
        Text(
            label,
            style = if (mono) Type.Mono else Type.Chip,
            color = if (selected) Ink.Lime else Ink.Text,
            maxLines = 1,
            textAlign = TextAlign.Center,
        )
    }
}

private fun startOfDay(at: Long): Long = Calendar.getInstance().apply {
    timeInMillis = at
    set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
}.timeInMillis

private fun dayLabel(at: Long): String = Calendar.getInstance().apply { timeInMillis = at }.let {
    "%d/%d".format(it.get(Calendar.MONTH) + 1, it.get(Calendar.DAY_OF_MONTH))
}

/** "09:00" for today, "12/8 09:00" for anything further out. */
private fun whenLabel(at: Long, today: Long, tomorrow: Long): String {
    val clock = Calendar.getInstance().apply { timeInMillis = at }.let {
        "%02d:%02d".format(it.get(Calendar.HOUR_OF_DAY), it.get(Calendar.MINUTE))
    }
    val day = startOfDay(at)
    return if (day == today || day == tomorrow) clock else "${dayLabel(at)} $clock"
}
