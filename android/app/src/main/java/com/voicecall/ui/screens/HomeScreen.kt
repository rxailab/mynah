package com.voicecall.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.voicecall.R
import com.voicecall.data.Call
import com.voicecall.data.CallStatus
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.ErrorCard
import com.voicecall.ui.FeedRow
import com.voicecall.ui.GroupLabel
import com.voicecall.ui.OutlineButton
import com.voicecall.ui.GroupedCard
import com.voicecall.ui.headline
import com.voicecall.ui.presentation
import com.voicecall.ui.subline
import com.voicecall.ui.IconCircle
import com.voicecall.ui.PulsingDot
import com.voicecall.ui.StateChip
import com.voicecall.ui.Waveform
import com.voicecall.ui.clickableNoRipple
import com.voicecall.ui.costLabel
import com.voicecall.ui.dayLabel
import com.voicecall.ui.elapsedOf
import com.voicecall.ui.formatClock
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import com.voicecall.ui.theme.Wise
import kotlinx.coroutines.delay

/** The three feed filters. Named apart from History's own, same package. */
private enum class FeedFilter(val label: Int) {
    ALL(R.string.filter_all),
    NEEDS_YOU(R.string.status_needs_you),
    DONE(R.string.status_done),
}

/**
 * Home: what the assistant has been doing.
 *
 * The old home was the composer — you arrived at a blank box and were asked to
 * think of something. This one opens on the work instead: whatever is on a call
 * right now at the top, then everything else grouped by day. Composing has moved
 * behind the bar at the foot, which is where it belongs once the app has any
 * history to show.
 *
 * There is no bottom navigation any more. Search, notifications and settings are
 * top-bar icons, and everything else is reached from a row.
 */
@Composable
fun HomeScreen(
    vm: CallsViewModel,
    onOpenCall: (String) -> Unit,
    onOpenDetail: (String) -> Unit,
    onCompose: () -> Unit,
    onSearch: () -> Unit,
    onNotifications: () -> Unit,
    onSettings: () -> Unit,
    onHistory: () -> Unit,
) {
    val state by vm.uiState.collectAsState()
    val profile by vm.profile.collectAsState()
    var filter by remember { mutableStateOf(FeedFilter.ALL) }
    val context = LocalContext.current

    LaunchedEffect(Unit) { vm.refresh(quiet = true); vm.loadProfile() }

    // Only ticks while something is actually on a call — the elapsed time on the
    // live card is the one thing here that changes on its own.
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val anyLive = state.calls.any { it.isLive }
    LaunchedEffect(anyLive) {
        while (anyLive) {
            now = System.currentTimeMillis()
            delay(1000)
        }
    }

    val live = state.calls.firstOrNull { it.isLive }
    // The live call has its own card at the top, so it is not repeated in the
    // list below it.
    val rest = state.calls.filter { it.id != live?.id }.filter { call ->
        when (filter) {
            FeedFilter.ALL -> true
            FeedFilter.NEEDS_YOU -> call.status == CallStatus.TRANSFERRING
            FeedFilter.DONE -> call.status == CallStatus.COMPLETED
        }
    }

    Column(Modifier.fillMaxSize().padding(top = statusBarPadding())) {
        // --- top bar ---
        Row(
            Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                Wordmark()
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.app_name), style = Type.Wordmark, color = Ink.Text)
            }
            IconCircle(Wise.Search, stringResource(R.string.nav_search), onSearch, size = 38.dp, iconSize = 19.dp)
            IconCircle(
                Wise.Bell,
                stringResource(R.string.nav_notifications),
                onNotifications,
                size = 38.dp,
                badge = state.calls.any { it.status == CallStatus.TRANSFERRING },
            )
            IconCircle(Wise.Gear, stringResource(R.string.nav_settings), onSettings, size = 38.dp)
        }

        // Nothing to show and no way to fetch any: the whole page says so
        // rather than an error card floating above an empty feed. Only when
        // there is genuinely nothing — with calls already in hand, the error
        // card over real history is more useful than blanking the screen.
        val offline = state.error != null && state.calls.isEmpty() && !state.loading

        Box(Modifier.weight(1f)) {
            if (offline) {
                Offline(onRetry = { vm.clearError(); vm.refresh() })
            } else {
            Column(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(start = 20.dp, end = 20.dp, top = 16.dp),
            ) {
                state.error?.let {
                    ErrorCard(it, vm::clearError)
                    Spacer(Modifier.height(14.dp))
                }

                if (live != null) {
                    LiveCallCard(live, now) { onOpenCall(live.id) }
                    Spacer(Modifier.height(18.dp))
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FeedFilter.entries.forEach { f ->
                        StateChip(stringResource(f.label), filter == f) { filter = f }
                    }
                }
                Spacer(Modifier.height(12.dp))

                if (rest.isEmpty()) {
                    EmptyFeed()
                } else {
                    // Grouped by the day they were placed, newest day first, in
                    // the order the server already returned them.
                    rest.groupBy { dayLabel(context, it.createdAt, now) }.forEach { (day, calls) ->
                        GroupLabel(day, modifier = Modifier.padding(top = 4.dp, bottom = 8.dp))
                        GroupedCard(rows = calls.map { call ->
                            {
                                FeedRow(
                                    dot = call.presentation().dot,
                                    title = call.headline(),
                                    subtitle = call.subline(),
                                    pulsing = call.isLive,
                                    onClick = {
                                        if (call.isLive) onOpenCall(call.id) else onOpenDetail(call.id)
                                    },
                                    right = {
                                        Text(
                                            formatClock(call.endedAt ?: call.createdAt),
                                            style = Type.Mono,
                                            color = Ink.Mute,
                                        )
                                        call.cost?.let {
                                            Text(costLabel(it), style = Type.Mono, color = Ink.Mute)
                                        }
                                    },
                                )
                            }
                        })
                        Spacer(Modifier.height(16.dp))
                    }

                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        Text(
                            stringResource(R.string.feed_view_all),
                            style = Type.Chip,
                            color = Ink.Deep,
                            modifier = Modifier.clickableNoRipple(onHistory).padding(vertical = 10.dp),
                        )
                    }
                }

                // Room for the composer bar to float over without covering the
                // last row.
                Spacer(Modifier.height(84.dp))
            }
            }

            // Still tappable when unverified — it leads to the composer, which
            // explains why and offers the way through. A dead bar would leave
            // someone staring at a hint with nothing to press.
            //
            // Offline is the one case where it really is dead: the composer's
            // first step is asking the server to read the request, so there is
            // nothing behind the bar to reach.
            ComposerBar(
                onClick = { if (!offline) onCompose() },
                blocked = profile?.canCall == false,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .alpha(if (offline) 0.55f else 1f),
            )
        }
    }
}

/** The three lime bars. Small enough to draw rather than ship as an asset. */
@Composable
private fun Wordmark() {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(1.dp)) {
        listOf(8.dp, 16.dp, 10.dp).forEach { h ->
            Box(Modifier.width(4.dp).height(h).background(Ink.Lime, RoundedCornerShape(99.dp)))
        }
    }
}

/**
 * The call happening right now. Black, so it reads as the one live thing on a
 * page of finished ones, and tapping anywhere on it goes to the call.
 */
@Composable
private fun LiveCallCard(call: Call, now: Long, onClick: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(Ink.Text, RoundedCornerShape(18.dp))
            .clickableNoRipple(onClick)
            .padding(18.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PulsingDot(Ink.Lime, size = 7.dp)
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.status_on_the_call), style = Type.LabelSmall, color = Ink.Lime)
            Spacer(Modifier.weight(1f))
            Text(elapsedOf(call, now), style = Type.MonoBody, color = Ink.OnDarkMute)
        }
        Spacer(Modifier.height(10.dp))
        Text(
            call.businessName.ifBlank { stringResource(R.string.status_dialing_now) },
            style = Type.ListTitle,
            color = Ink.OnDark,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            call.goal,
            style = Type.RowSub,
            color = Ink.OnDarkMute,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(14.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Waveform(Modifier.height(18.dp), barCount = 4, periodMs = 900, staggerMs = 150)
            Spacer(Modifier.width(10.dp))
            Text(
                call.transcript.lastOrNull()?.text.orEmpty(),
                style = Type.RowSub,
                color = Ink.OnDarkBody,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.feed_enter_call), style = Type.Chip, color = Ink.Lime)
        }
    }
}

/**
 * The way to start a call, floating over the foot of the feed. The gradient
 * behind it fades the list out rather than cutting it, so it reads as the page
 * continuing underneath.
 */
@Composable
private fun ComposerBar(onClick: () -> Unit, blocked: Boolean, modifier: Modifier = Modifier) {
    // The gradient runs under the system navigation bar, but the bar itself has
    // to sit above it — this floats over the list, so nothing else is going to
    // reserve that space.
    val bottomInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    Box(
        modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Transparent, Ink.Canvas, Ink.Canvas)))
            .padding(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 14.dp + bottomInset),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(Ink.Card, RoundedCornerShape(16.dp))
                .border(1.dp, Ink.Hairline, RoundedCornerShape(16.dp))
                .clickableNoRipple(onClick)
                .padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(
                    if (blocked) R.string.feed_composer_blocked else R.string.feed_composer_hint,
                ),
                style = Type.Body,
                color = if (blocked) Ink.WarningDeep else Ink.Mute,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(11.dp))
            Box(
                Modifier
                    .size(40.dp)
                    .background(if (blocked) Ink.Warning else Ink.Lime, RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (blocked) Wise.Person else Wise.Mic,
                    null,
                    tint = if (blocked) Ink.WarningInk else Ink.OnLime,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

@Composable
/**
 * The whole page, when there is nothing to show and no way to fetch any.
 *
 * Borrows the empty state's shape — grey ring, title, a line of explanation —
 * and adds the one thing an empty feed does not need: something to press. The
 * body says calls already running carry on, because that is the first worry of
 * anyone who loses signal while the assistant is mid-call, and it is true: the
 * call is between the server and the phone network, and this app is only
 * watching it.
 */
private fun Offline(onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(horizontal = 40.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(52.dp).background(Ink.CanvasSoft, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Wise.WifiOff, null, tint = Ink.Rim, modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.height(14.dp))
        Text(stringResource(R.string.offline_title), style = Type.Section, color = Ink.Text)
        Spacer(Modifier.height(6.dp))
        Text(
            stringResource(R.string.offline_body),
            style = Type.Caption,
            color = Ink.Mute,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(18.dp))
        OutlineButton(
            label = stringResource(R.string.action_retry),
            onClick = onRetry,
            height = 46.dp,
            style = Type.ButtonSmall,
            leading = { Icon(Wise.Rotate, null, tint = Ink.Text, modifier = Modifier.size(15.dp)) },
        )
    }
}

@Composable
private fun EmptyFeed() {
    Column(Modifier.fillMaxWidth().padding(top = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(52.dp).background(Ink.CanvasSoft, CircleShape), contentAlignment = Alignment.Center) {
            Icon(Wise.Phone, null, tint = Ink.Rim, modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.height(14.dp))
        Text(stringResource(R.string.feed_empty_title), style = Type.Section, color = Ink.Text)
        Spacer(Modifier.height(6.dp))
        Text(stringResource(R.string.feed_empty_body), style = Type.Caption, color = Ink.Mute)
    }
}


