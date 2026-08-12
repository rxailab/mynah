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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.voicecall.R
import com.voicecall.data.Call
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.GroupedCard
import com.voicecall.ui.ScreenHeader
import com.voicecall.ui.clickableNoRipple
import com.voicecall.ui.dayLabel
import com.voicecall.ui.navBarPadding
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type

/** A place that has been called, and how often. */
private data class Business(
    val name: String,
    val number: String,
    val calls: Int,
    val lastAt: Long,
    val lastGoal: String,
)

/**
 * The places you call.
 *
 * Nothing is saved to build this — it is the call history grouped by number.
 * That matches what the design promises ("numbers you have called end up here")
 * and means there is no second list to keep in step with the first, and nothing
 * to clean up when an account is deleted.
 *
 * Picking one seeds the composer with what was asked for last time, which is
 * usually most of what you want to ask for again.
 */
@Composable
fun BusinessesScreen(vm: CallsViewModel, onBack: () -> Unit, onCompose: () -> Unit) {
    val state by vm.uiState.collectAsState()
    val context = LocalContext.current
    val now = remember { System.currentTimeMillis() }

    LaunchedEffect(Unit) { vm.refresh(quiet = true) }

    val businesses = remember(state.calls) {
        state.calls
            .filter { it.phoneNumber.isNotBlank() }
            .groupBy { it.phoneNumber }
            .map { (number, calls) ->
                val newest = calls.maxBy { it.createdAt }
                Business(
                    // The most recent name wins: businesses get renamed in the
                    // brief more often than they change number.
                    name = newest.businessName.ifBlank { number },
                    number = number,
                    calls = calls.size,
                    lastAt = newest.createdAt,
                    lastGoal = newest.goal,
                )
            }
            .sortedByDescending { it.lastAt }
    }

    Column(
        Modifier
            .fillMaxSize()
            .padding(top = statusBarPadding(), bottom = navBarPadding()),
    ) {
        ScreenHeader(title = stringResource(R.string.businesses_title), onBack = onBack)

        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 24.dp),
        ) {
            Text(stringResource(R.string.businesses_intro), style = Type.Caption, color = Ink.Body)
            Spacer(Modifier.height(12.dp))

            if (businesses.isEmpty()) {
                Text(stringResource(R.string.businesses_empty), style = Type.Caption, color = Ink.Mute)
            } else {
                GroupedCard(rows = businesses.map { business ->
                    {
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickableNoRipple {
                                    vm.seedComposer(business.lastGoal)
                                    onCompose()
                                }
                                .padding(horizontal = 16.dp, vertical = 13.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                Modifier.size(38.dp).background(Ink.LimePale, CircleShape),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    business.name.trim().take(1).uppercase(),
                                    style = Type.ListTitle,
                                    color = Ink.Deep,
                                )
                            }
                            Spacer(Modifier.width(13.dp))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    business.name,
                                    style = Type.RowTitle,
                                    color = Ink.Text,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(business.number, style = Type.Mono, color = Ink.Mute)
                            }
                            Spacer(Modifier.width(10.dp))
                            Column(horizontalAlignment = Alignment.End) {
                                Text(
                                    stringResource(R.string.businesses_call_count, business.calls),
                                    style = Type.Tiny,
                                    color = Ink.Mute,
                                )
                                Text(
                                    dayLabel(context, business.lastAt, now),
                                    style = Type.Tiny,
                                    color = Ink.Rim,
                                )
                            }
                        }
                    }
                })
            }
        }
    }
}
