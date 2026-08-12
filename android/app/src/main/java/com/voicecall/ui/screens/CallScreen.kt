package com.voicecall.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.voicecall.R
import com.voicecall.data.Call
import com.voicecall.data.CallStatus
import com.voicecall.data.Speaker
import com.voicecall.data.Step
import com.voicecall.data.TranscriptEntry
import com.voicecall.ui.ButtonShape
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.CardShape
import com.voicecall.ui.LinkText
import com.voicecall.ui.PillShape
import com.voicecall.ui.OutlineButton
import com.voicecall.ui.PrimaryButton
import com.voicecall.ui.PulseRings
import com.voicecall.ui.PulsingDot
import com.voicecall.ui.Rule
import com.voicecall.ui.WiseCard
import com.voicecall.ui.clickableNoRipple
import com.voicecall.ui.costLabel
import com.voicecall.ui.durationLabel
import com.voicecall.ui.elapsedOf
import com.voicecall.ui.holdElapsedOf
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.DarkSystemBars
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import com.voicecall.ui.theme.Wise
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

/**
 * The call as it happens. This is the one screen the design takes into the
 * dark: near-black canvas, lime for whatever the assistant says, and the two
 * things you can do about it sitting side by side at the bottom.
 */
@Composable
fun CallScreen(vm: CallsViewModel, callId: String, onFinished: (String) -> Unit, onClose: () -> Unit) {
    val call by vm.selected.collectAsState()

    DisposableEffect(callId) {
        vm.watch(callId)
        onDispose(vm::stopWatching)
    }

    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val live = call?.isLive == true
    LaunchedEffect(live) {
        while (live) {
            now = System.currentTimeMillis()
            delay(1000)
        }
    }

    val current = call
    // The result sheet is white, so the bars only flip while the dark screen
    // is the thing being looked at.
    if (current == null || current.isLive) DarkSystemBars()

    if (current == null) {
        Box(
            Modifier.fillMaxSize().background(Ink.Text),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(color = Ink.Lime, strokeWidth = 2.5.dp)
        }
        return
    }

    Box(Modifier.fillMaxSize().background(Ink.Text)) {
        Column(
            Modifier
                .fillMaxSize()
                .imePadding()
                .padding(top = statusBarPadding())
                .padding(
                    start = 20.dp, end = 20.dp, top = 22.dp,
                    bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + 20.dp,
                ),
        ) {
            LiveHeader(current, now)

            val dialling = current.status == CallStatus.QUEUED || current.status == CallStatus.DIALING
            if (dialling) Ringing(current) else Conversation(current, Modifier.weight(1f))

            if (!dialling) {
                Spacer(Modifier.height(12.dp))
                InterjectBar(callId = current.id, vm = vm)
            }

            Spacer(Modifier.height(14.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (!dialling) {
                    DarkButton(
                        label = stringResource(R.string.action_take_over),
                        onClick = { vm.takeOver(current.id) },
                        modifier = Modifier.weight(1f),
                    )
                }
                PrimaryButton(
                    label = stringResource(R.string.action_hangup),
                    onClick = { vm.hangUp(current.id) },
                    modifier = Modifier.weight(1f),
                    height = 50.dp,
                    container = Ink.Negative,
                    content = Ink.OnDark,
                    style = Type.ButtonSmall,
                )
            }
        }

        if (current.status == CallStatus.TRANSFERRING) {
            TakeoverDialog(onHangUp = { vm.hangUp(current.id) })
        }

        if (!current.isLive) {
            ResultSheet(
                call = current,
                onViewRecord = { onFinished(current.id) },
                onDone = onClose,
            )
        }
    }
}

/** Who is being called, and the status capsule that says where the call is up to. */
@Composable
private fun LiveHeader(call: Call, now: Long) {
    val connecting = call.status == CallStatus.QUEUED || call.status == CallStatus.DIALING
    val holding = call.onHold && call.isLive
    val status = stringResource(
        when {
            call.status == CallStatus.QUEUED -> R.string.status_dialing_now
            call.status == CallStatus.DIALING -> R.string.status_ringing
            call.status == CallStatus.TRANSFERRING -> R.string.status_needs_you
            // Said in the main capsule rather than only in the amber strip
            // below, because a silent transcript and "On the call" together read
            // as a stall — which is the one thing this is not.
            holding -> R.string.status_on_hold
            else -> R.string.status_on_the_call
        },
    )

    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            call.businessName,
            style = Type.Amount,
            color = Ink.OnDark,
            maxLines = 1,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(2.dp))
        Text(call.phoneNumber, style = Type.MonoBody, color = Ink.OnDarkMute)
        Spacer(Modifier.height(12.dp))
        Row(
            Modifier.background(Ink.OnDarkWash, PillShape).padding(horizontal = 15.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PulsingDot(if (connecting || holding) Ink.Warning else Ink.Lime, 7.dp)
            Spacer(Modifier.width(7.dp))
            Text(status, style = Type.Chip, color = Ink.OnDark)
            Spacer(Modifier.width(7.dp))
            Text(elapsedOf(call, now), style = Type.MonoBody, color = Ink.OnDarkMute)
        }
        if (holding) {
            Spacer(Modifier.height(10.dp))
            HoldStrip(call, now)
        }
    }
}

/**
 * The queue, given its own strip rather than a word in the capsule above.
 *
 * It carries the one number that decides anything — how long this has been
 * waiting, ticking locally between server pushes — and says out loud that the
 * meter is running, because the honest answer to a long queue is often to hang
 * up, and nothing else on this screen would tell them that.
 */
@Composable
private fun HoldStrip(call: Call, now: Long) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(Ink.Warning.copy(alpha = 0.16f), CardShape)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(R.string.hold_queueing).uppercase(),
                style = Type.LabelSmall,
                color = Ink.Warning,
            )
            Spacer(Modifier.width(9.dp))
            Text(holdElapsedOf(call, now), style = Type.MonoBody, color = Ink.OnDark)
        }
        Spacer(Modifier.height(5.dp))
        Text(
            stringResource(R.string.hold_note),
            style = Type.Fine,
            color = Ink.OnDarkMute,
            textAlign = TextAlign.Center,
        )
    }
}

/** Nobody has picked up yet: the callee's initial, with rings going out. */
@Composable
private fun ColumnScope.Ringing(call: Call) {
    Column(
        Modifier.weight(1f).fillMaxWidth(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(126.dp), contentAlignment = Alignment.Center) {
            PulseRings(Modifier.size(126.dp), colour = Ink.Lime)
            Box(
                Modifier.size(96.dp).background(Ink.OnDarkWash, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    call.businessName.trim().take(1).uppercase().ifBlank { "?" },
                    style = Type.Title,
                    color = Ink.Lime,
                )
            }
        }
        Spacer(Modifier.height(20.dp))
        Text(
            stringResource(R.string.transcript_waiting),
            style = Type.Body,
            color = Ink.OnDarkMute,
            textAlign = TextAlign.Center,
        )
    }
}

/** The checklist and the conversation, which is most of the screen. */
@Composable
private fun Conversation(call: Call, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth()) {
        if (call.steps.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(Ink.OnDarkWash, CardShape)
                    .padding(horizontal = 18.dp, vertical = 16.dp),
            ) {
                Text(
                    stringResource(R.string.call_goals).uppercase(),
                    style = Type.LabelSmall,
                    color = Ink.OnDarkMute,
                )
                Spacer(Modifier.height(11.dp))
                Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    call.steps.forEachIndexed { index, step ->
                        // The first step not yet done is the one being worked on.
                        val active = !step.done && call.steps.take(index).all { it.done }
                        ChecklistRow(step, active)
                    }
                }
            }
        }

        Transcript(call, Modifier.weight(1f))
    }
}

@Composable
private fun ChecklistRow(step: Step, active: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        when {
            step.done -> Box(
                Modifier.size(20.dp).background(Ink.Lime, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Wise.Check, null, tint = Ink.OnLime, modifier = Modifier.size(11.dp))
            }
            active -> Box(
                Modifier.size(20.dp).border(1.5.dp, Ink.Lime, CircleShape),
                contentAlignment = Alignment.Center,
            ) { PulsingDot(Ink.Lime, 8.dp) }
            else -> Box(Modifier.size(20.dp).border(1.5.dp, Ink.OnDarkRim, CircleShape))
        }
        Spacer(Modifier.width(11.dp))
        Text(
            step.label,
            style = if (active) Type.Value else Type.Body,
            color = if (active) Ink.OnDark else Ink.OnDarkMute,
        )
    }
}

@Composable
private fun Transcript(call: Call, modifier: Modifier = Modifier) {
    val listState = rememberLazyListState()
    val translate = (LocalConfiguration.current.locales[0].language == "zh") != (call.language == "zh")

    LaunchedEffect(call.transcript.size) {
        if (call.transcript.isEmpty()) return@LaunchedEffect
        try {
            listState.animateScrollToItem(call.transcript.lastIndex)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
        }
    }

    if (call.transcript.isEmpty()) {
        Box(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Text(stringResource(R.string.transcript_waiting), style = Type.Body, color = Ink.OnDarkMute)
        }
        return
    }

    LazyColumn(
        state = listState,
        modifier = modifier.fillMaxWidth().padding(top = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(call.transcript, key = { it.at }) { entry -> Bubble(entry, call, translate) }
    }
}

/**
 * Lime on the right is the assistant, charcoal on the left is the other party —
 * the design's own pairing. Facts you type in are neither: they were never
 * spoken aloud, so they sit centred in a plain capsule.
 */
@Composable
private fun Bubble(entry: TranscriptEntry, call: Call, translate: Boolean) {
    val translated = entry.translation?.takeIf { translate && it.isNotBlank() }

    if (entry.speaker == Speaker.OWNER) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            Row(
                Modifier.background(Ink.OnDarkWash, PillShape).padding(horizontal = 14.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Wise.ArrowUp, null, tint = Ink.Lime, modifier = Modifier.size(11.dp))
                Spacer(Modifier.width(7.dp))
                Text(
                    "${stringResource(R.string.bubble_noted)}: ${entry.text}",
                    style = Type.Fine,
                    color = Ink.OnDark,
                )
            }
        }
        return
    }

    val assistant = entry.speaker == Speaker.AGENT
    val who = when (entry.speaker) {
        Speaker.AGENT -> stringResource(R.string.speaker_assistant)
        Speaker.CALLER -> call.businessName.uppercase()
        else -> stringResource(R.string.speaker_system)
    }

    Column(
        Modifier.fillMaxWidth(),
        horizontalAlignment = if (assistant) Alignment.End else Alignment.Start,
    ) {
        Text(
            who,
            style = Type.Speaker,
            color = Ink.OnDarkMute,
            maxLines = 1,
            modifier = Modifier.padding(horizontal = 8.dp),
        )
        Spacer(Modifier.height(3.dp))
        Column(
            Modifier
                .widthIn(max = 300.dp)
                .background(if (assistant) Ink.Lime else Ink.OnDarkBubble, RoundedCornerShape(18.dp))
                .padding(horizontal = 15.dp, vertical = 11.dp),
        ) {
            Text(entry.text, style = Type.Bubble, color = if (assistant) Ink.OnLime else Ink.OnDark)
            translated?.let {
                Spacer(Modifier.height(5.dp))
                Rule(if (assistant) Ink.OnLime.copy(alpha = 0.15f) else Ink.OnDarkRim)
                Spacer(Modifier.height(5.dp))
                Text(
                    it,
                    style = Type.BubbleTranslation,
                    color = if (assistant) Ink.Deep else Ink.OnDarkMute,
                )
            }
        }
    }
}

/** Type a fact; the assistant weaves it into what it says next. */
@Composable
private fun InterjectBar(callId: String, vm: CallsViewModel) {
    var draft by remember { mutableStateOf("") }
    val canSend = draft.isNotBlank()

    fun send() {
        if (!canSend) return
        vm.sendNote(callId, draft)
        draft = ""
    }

    Row(
        Modifier
            .fillMaxWidth()
            .background(Ink.OnDarkWash, PillShape)
            .padding(start = 18.dp, end = 5.dp, top = 5.dp, bottom = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.weight(1f)) {
            if (draft.isEmpty()) {
                Text(
                    stringResource(R.string.interject_placeholder),
                    style = Type.Caption,
                    color = Ink.OnDarkMute,
                    maxLines = 1,
                )
            }
            BasicTextField(
                value = draft,
                onValueChange = { draft = it },
                textStyle = Type.Caption.copy(color = Ink.OnDark),
                cursorBrush = SolidColor(Ink.Lime),
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { send() }),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Spacer(Modifier.width(8.dp))
        Box(
            Modifier
                .size(38.dp)
                .background(if (canSend) Ink.Lime else Ink.OnDarkWash, CircleShape)
                .clickableNoRipple { send() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Wise.ArrowUp,
                stringResource(R.string.coach_send),
                tint = if (canSend) Ink.OnLime else Ink.OnDarkMute,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

/** The secondary action on the dark screen: an outline in white, not ink. */
@Composable
private fun DarkButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier
            .height(50.dp)
            .border(1.dp, Ink.OnDarkRim, ButtonShape)
            .clickableNoRipple(onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = Type.ButtonSmall, color = Ink.OnDark, maxLines = 1)
    }
}

/** The assistant has handed over: your phone is ringing. */
@Composable
private fun TakeoverDialog(onHangUp: () -> Unit) {
    Box(
        Modifier
            .fillMaxSize()
            .background(Ink.Text.copy(alpha = 0.72f))
            .clickableNoRipple { }
            .padding(28.dp),
        contentAlignment = Alignment.Center,
    ) {
        WiseCard {
            Column(Modifier.padding(horizontal = 22.dp, vertical = 24.dp)) {
                Text(stringResource(R.string.takeover_calling), style = Type.Section, color = Ink.Text)
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.takeover_calling_sub), style = Type.Caption, color = Ink.Body)
                Spacer(Modifier.height(18.dp))
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(
                        color = Ink.Text,
                        strokeWidth = 2.5.dp,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.weight(1f))
                    LinkText(
                        stringResource(R.string.action_hangup),
                        onHangUp,
                        colour = Ink.Negative,
                    )
                }
            }
        }
    }
}

/**
 * The call is over. The design gives the result its own white screen: a lime
 * disc, the answer in one heavy line, the details in a sage card underneath.
 */
@Composable
private fun ResultSheet(call: Call, onViewRecord: () -> Unit, onDone: () -> Unit) {
    val failed = call.status == CallStatus.FAILED

    Column(
        Modifier
            .fillMaxSize()
            .background(Ink.Card)
            .verticalScroll(rememberScrollState())
            .padding(top = statusBarPadding())
            .padding(
                start = 28.dp, end = 28.dp, top = 52.dp,
                bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + 24.dp,
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(62.dp).background(if (failed) Ink.Negative else Ink.Lime, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (failed) Wise.Close else Wise.Check,
                null,
                tint = if (failed) Ink.OnDark else Ink.OnLime,
                modifier = Modifier.size(if (failed) 24.dp else 28.dp),
            )
        }
        Spacer(Modifier.height(18.dp))
        Text(
            call.summary ?: call.error ?: call.goal,
            style = Type.Result,
            color = Ink.Text,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            call.businessName,
            style = Type.Body,
            color = Ink.Body,
            textAlign = TextAlign.Center,
        )

        // What was agreed, and what it cost, in one card. The cost belongs with
        // the facts rather than in a footnote: it is the last line of the same
        // answer, and the design puts it there.
        val hasCard = call.results.isNotEmpty() || call.cost != null || call.holdSeconds > 0
        if (hasCard) {
            Spacer(Modifier.height(26.dp))
            WiseCard(fill = Ink.CanvasSoft, radius = 16.dp) {
                call.results.entries.forEach { (key, value) ->
                    ResultRow(
                        label = key.replace('_', ' ').replaceFirstChar { it.uppercase() },
                        value = value,
                    )
                    Rule(Ink.Hairline)
                }
                // Queue time earns its own line rather than hiding inside the
                // duration: it is the part of the bill that bought nothing, and
                // seeing it is what makes redialling at a quieter hour an
                // obvious thing to do.
                if (call.holdSeconds > 0) {
                    ResultRow(
                        label = stringResource(R.string.detail_queued),
                        value = durationLabel(call.holdSeconds),
                        mono = true,
                    )
                    if (call.cost != null) Rule(Ink.Hairline)
                }
                call.cost?.let {
                    ResultRow(
                        label = stringResource(R.string.detail_cost),
                        value = "${durationLabel(it.durationSeconds)} · ${costLabel(it)}",
                        mono = true,
                    )
                }
            }
        }

        // Twilio rates a call minutes after it ends, so the money is genuinely
        // not known yet — say so rather than showing a figure that will change.
        if (call.cost == null) {
            Spacer(Modifier.height(14.dp))
            Text(
                stringResource(R.string.cost_pending),
                style = Type.Fine,
                color = Ink.Mute,
                textAlign = TextAlign.Center,
            )
        }

        Spacer(Modifier.height(28.dp))
        OutlineButton(
            label = stringResource(R.string.action_view_record),
            onClick = onViewRecord,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(10.dp))
        PrimaryButton(
            label = stringResource(R.string.action_finish),
            onClick = onDone,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** One agreed fact, label left and value right, as the result card lists them. */
@Composable
private fun ResultRow(label: String, value: String, mono: Boolean = false) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 13.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text(label, style = Type.Sub, color = Ink.Body)
        Spacer(Modifier.width(16.dp))
        Text(
            value,
            style = if (mono) Type.MonoBody else Type.Value,
            color = Ink.Text,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(1f),
        )
    }
}

