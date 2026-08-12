package com.voicecall.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.voicecall.R
import com.voicecall.data.Call
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.ErrorCard
import com.voicecall.ui.FeedRow
import com.voicecall.ui.GroupLabel
import com.voicecall.ui.GroupedCard
import com.voicecall.ui.IconCircle
import com.voicecall.ui.Presentation
import com.voicecall.ui.ScreenHeader
import com.voicecall.ui.StateChip
import com.voicecall.ui.costLabel
import com.voicecall.ui.dayLabel
import com.voicecall.ui.elapsedOf
import com.voicecall.ui.formatClock
import com.voicecall.ui.headline
import com.voicecall.ui.navBarPadding
import com.voicecall.ui.presentation
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.subline
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import com.voicecall.ui.theme.Wise
import kotlinx.coroutines.delay

/** The chips across the top. One more than the feed's: history is where you go looking for the one that failed. */
private enum class HistoryFilter(val label: Int) {
    ALL(R.string.filter_all),
    NEEDS_YOU(R.string.status_needs_you),
    DONE(R.string.status_done),
    NO_ANSWER(R.string.status_no_answer),
    ;

    fun accepts(call: Call, presentation: Presentation): Boolean = when (this) {
        ALL -> true
        NEEDS_YOU -> presentation == Presentation.NEEDS_YOU
        // Strictly the ones that got there. A call that rang out is not "done",
        // and it has its own chip now.
        DONE -> presentation == Presentation.DONE
        NO_ANSWER -> presentation == Presentation.NO_ANSWER
    }
}

/**
 * Everything the assistant has done, newest first, grouped by day.
 *
 * A pushed screen in the redesign rather than a tab, so it opens with a back
 * arrow and a way into search. Each day carries its own count and cost, which is
 * the question this screen actually gets asked: not "what happened" — the feed
 * answers that — but "how much of this have I been doing".
 */
@Composable
fun HistoryScreen(
    vm: CallsViewModel,
    onBack: () -> Unit,
    onSearch: () -> Unit,
    onOpen: (String, Boolean) -> Unit,
) {
    val state by vm.uiState.collectAsState()
    val settings by vm.settings.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(settings) {
        if (settings?.isSignedIn == true) vm.refresh()
    }

    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val anyLive = state.calls.any { it.isLive }
    LaunchedEffect(anyLive) {
        while (anyLive) {
            now = System.currentTimeMillis()
            delay(1000)
            vm.refresh(quiet = true)
        }
    }

    var filter by remember { mutableStateOf(HistoryFilter.ALL) }
    val shown = state.calls.filter { filter.accepts(it, it.presentation()) }

    Column(
        Modifier
            .fillMaxSize()
            .padding(top = statusBarPadding(), bottom = navBarPadding()),
    ) {
        ScreenHeader(
            title = stringResource(R.string.history_title),
            onBack = onBack,
            trailing = {
                IconCircle(Wise.Search, stringResource(R.string.nav_search), onSearch, iconSize = 19.dp)
            },
        )

        Row(
            Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            HistoryFilter.entries.forEach { option ->
                StateChip(stringResource(option.label), option == filter) { filter = option }
            }
        }

        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 24.dp),
        ) {
            state.error?.let {
                ErrorCard(it, vm::clearError)
                Spacer(Modifier.height(12.dp))
            }

            if (shown.isEmpty()) {
                Spacer(Modifier.height(30.dp))
                Text(stringResource(R.string.history_empty), style = Type.Section, color = Ink.Text)
                Spacer(Modifier.height(6.dp))
                Text(stringResource(R.string.history_empty_body), style = Type.Caption, color = Ink.Mute)
            }

            shown.groupBy { dayLabel(context, it.createdAt, now) }.forEach { (day, calls) ->
                GroupLabel(
                    day,
                    trailing = dayTotals(calls),
                    modifier = Modifier.padding(top = 8.dp, bottom = 8.dp),
                )
                GroupedCard(rows = calls.map { call ->
                    {
                        FeedRow(
                            dot = call.presentation().dot,
                            title = call.headline(),
                            subtitle = call.subline(),
                            pulsing = call.isLive,
                            onClick = { onOpen(call.id, call.isLive) },
                            right = {
                                Text(
                                    if (call.isLive) elapsedOf(call, now)
                                    else formatClock(call.endedAt ?: call.createdAt),
                                    style = Type.Mono,
                                    color = if (call.isLive) Ink.Deep else Ink.Mute,
                                )
                                call.cost?.let { Text(costLabel(it), style = Type.Mono, color = Ink.Mute) }
                            },
                        )
                    }
                })
            }
        }
    }
}

/**
 * "3 calls · £0.14" beside the day. Money only appears once something has been
 * rated — a day that shows £0.00 because Twilio has not caught up yet would be
 * telling a small lie every morning.
 */
@Composable
private fun dayTotals(calls: List<Call>): String {
    val count = stringResource(R.string.businesses_call_count, calls.size)
    val priced = calls.mapNotNull { it.cost }
    if (priced.isEmpty()) return "· $count"

    val total = priced.sumOf { it.price.toDoubleOrNull() ?: 0.0 }
    val symbol = when (priced.first().unit.uppercase()) {
        "GBP" -> "£"; "USD" -> "$"; "EUR" -> "€"; else -> ""
    }
    return "· $count · $symbol${"%.2f".format(total)}"
}
