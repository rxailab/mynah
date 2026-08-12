package com.voicecall.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.voicecall.R
import com.voicecall.data.Speaker
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.LinkText
import com.voicecall.ui.NavIcon
import com.voicecall.ui.clickableNoRipple
import com.voicecall.ui.NeedsYouCard
import com.voicecall.ui.OutlineButton
import com.voicecall.ui.Presentation
import com.voicecall.ui.Rule
import com.voicecall.ui.SectionLabel
import com.voicecall.ui.StatusBadge
import com.voicecall.ui.WiseCard
import com.voicecall.ui.costLabel
import com.voicecall.ui.durationLabel
import com.voicecall.ui.headline
import com.voicecall.ui.presentation
import com.voicecall.ui.navBarPadding
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import com.voicecall.ui.theme.Wise

/** The one-tap verdict on the detail screen; the full form lives behind a link. */
@Composable
private fun VerdictChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .background(if (selected) Ink.Text else Ink.Card, RoundedCornerShape(10.dp))
            .then(
                if (selected) Modifier
                else Modifier.border(1.dp, Ink.Hairline, RoundedCornerShape(10.dp)),
            )
            .clickableNoRipple(onClick)
            .padding(horizontal = 13.dp, vertical = 8.dp),
    ) {
        Text(label, style = Type.Chip, color = if (selected) Ink.Lime else Ink.Text, maxLines = 1)
    }
}

/** A finished call: what it got, what it said, and what it cost. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DetailScreen(
    vm: CallsViewModel,
    callId: String,
    onBack: () -> Unit,
    onRedialled: (String) -> Unit,
    onShare: () -> Unit = {},
    onFeedback: () -> Unit = {},
) {
    val call by vm.selected.collectAsState()

    DisposableEffect(callId) {
        vm.watch(callId)
        onDispose(vm::stopWatching)
    }

    val current = call
    if (current == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = Ink.Text, strokeWidth = 2.5.dp)
        }
        return
    }

    val presentation = current.presentation()
    val translate = (LocalConfiguration.current.locales[0].language == "zh") != (current.language == "zh")

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(top = statusBarPadding(), bottom = navBarPadding())
            .padding(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 28.dp),
    ) {
        // Sharing only once there is a result to share — a call still on the
        // line has nothing to put on a card.
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            NavIcon(Wise.ArrowLeft, stringResource(R.string.action_back), onBack)
            Spacer(Modifier.weight(1f))
            if (!current.isLive && current.outcome != null) {
                NavIcon(Wise.Share, stringResource(R.string.action_share), onShare)
            }
        }

        // The result leads, with the state beside it — the prototype's wrap, so
        // a long answer pushes the badge onto its own line rather than squashing.
        Spacer(Modifier.height(8.dp))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(current.headline(), style = Type.Pushed, color = Ink.Text)
            StatusBadge(presentation, Modifier.align(Alignment.CenterVertically))
        }
        Spacer(Modifier.height(4.dp))
        Text("${current.businessName} · ${current.phoneNumber}", style = Type.Caption, color = Ink.Body)

        // The assistant asked for you and the call is still open.
        if (presentation == Presentation.NEEDS_YOU) {
            Spacer(Modifier.height(16.dp))
            NeedsYouCard(
                title = stringResource(R.string.detail_needs_you),
                body = stringResource(R.string.subline_transfer),
                action = stringResource(R.string.action_bridge_me),
                onAction = { vm.takeOver(current.id) },
            )
        }

        if (current.results.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            WiseCard {
                Column(Modifier.padding(horizontal = 18.dp, vertical = 16.dp)) {
                    SectionLabel(stringResource(R.string.detail_outcome))
                    Spacer(Modifier.height(10.dp))
                    current.results.entries.forEachIndexed { index, (key, value) ->
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                            Text(
                                key.replace('_', ' ').replaceFirstChar { it.uppercase() },
                                style = Type.Body,
                                color = Ink.Body,
                            )
                            Spacer(Modifier.width(16.dp))
                            Text(
                                value,
                                style = Type.Value,
                                color = Ink.Text,
                                textAlign = TextAlign.End,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        if (index != current.results.size - 1) {
                            Spacer(Modifier.height(10.dp))
                            Rule()
                            Spacer(Modifier.height(10.dp))
                        }
                    }
                }
            }
        }

        current.summary?.takeIf { it.isNotBlank() }?.let { summary ->
            Spacer(Modifier.height(10.dp))
            WiseCard {
                Column(Modifier.padding(horizontal = 18.dp, vertical = 16.dp)) {
                    SectionLabel(stringResource(R.string.detail_summary))
                    Spacer(Modifier.height(8.dp))
                    Text(summary, style = Type.Body, color = Ink.Text)
                    val translated = current.summaryTranslation
                    if (translate && !translated.isNullOrBlank()) {
                        Spacer(Modifier.height(9.dp))
                        Rule()
                        Spacer(Modifier.height(9.dp))
                        Text(translated, style = Type.Caption, color = Ink.Body)
                    }
                }
            }
        }

        // The recording row in the prototype; here the same shape carries what
        // the call actually cost, which is the number this app can produce.
        Spacer(Modifier.height(10.dp))
        WiseCard {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 15.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.size(38.dp).background(Ink.Text, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Wise.Phone, null, tint = Ink.Lime, modifier = Modifier.size(15.dp))
                }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.detail_cost), style = Type.ListItem, color = Ink.Text)
                    // Says which part of the money bought nothing. Only when
                    // there was a queue — on a call that went straight through,
                    // a "0s queueing" line is noise.
                    if (current.holdSeconds > 0) {
                        Text(
                            stringResource(
                                R.string.detail_of_which_queued,
                                durationLabel(current.holdSeconds),
                            ),
                            style = Type.Fine,
                            color = Ink.Mute,
                        )
                    }
                }
                Text(
                    current.cost?.let { costLabel(it) } ?: stringResource(R.string.cost_calculating),
                    style = Type.MonoBody,
                    color = if (current.cost != null) Ink.Text else Ink.Mute,
                )
            }
        }

        // Asked once the call is over, and placed above the transcript so it is
        // not something you have to scroll past a conversation to reach. One
        // tap is the whole answer; the link is there for anyone with more to
        // say. Once answered it says thank you rather than asking again.
        if (!current.isLive) {
            Spacer(Modifier.height(10.dp))
            WiseCard {
                Column(Modifier.padding(horizontal = 18.dp, vertical = 16.dp)) {
                    Text(
                        stringResource(
                            if (current.feedback != null) R.string.feedback_thanks
                            else R.string.feedback_prompt,
                        ),
                        style = Type.ListTitle,
                        color = Ink.Text,
                    )
                    Spacer(Modifier.height(12.dp))
                    Row(
                        Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        VerdictChip(
                            stringResource(R.string.feedback_good),
                            current.feedback?.verdict == "good",
                        ) { vm.sendFeedback(current.id, "good") }
                        Spacer(Modifier.width(8.dp))
                        VerdictChip(
                            stringResource(R.string.feedback_bad),
                            current.feedback?.verdict == "bad",
                        ) { vm.sendFeedback(current.id, "bad") }
                        Spacer(Modifier.weight(1f))
                        LinkText(
                            stringResource(R.string.feedback_detail),
                            onClick = onFeedback,
                            style = Type.LinkSmall,
                        )
                    }
                }
            }
        }

        if (current.transcript.isNotEmpty()) {
            Spacer(Modifier.height(20.dp))
            SectionLabel(stringResource(R.string.detail_transcript), Modifier.padding(start = 6.dp))
            Spacer(Modifier.height(8.dp))
            WiseCard {
                Column(Modifier.padding(horizontal = 18.dp)) {
                    current.transcript.forEachIndexed { index, entry ->
                        val assistant = entry.speaker == Speaker.AGENT
                        val who = when (entry.speaker) {
                            Speaker.AGENT -> stringResource(R.string.speaker_assistant)
                            Speaker.CALLER -> current.businessName.uppercase()
                            Speaker.OWNER -> stringResource(R.string.speaker_owner)
                            else -> stringResource(R.string.speaker_system)
                        }
                        Column(Modifier.padding(vertical = 12.dp)) {
                            Text(
                                who,
                                style = Type.Speaker,
                                color = if (assistant) Ink.PositiveDeep else Ink.Mute,
                                maxLines = 1,
                            )
                            Spacer(Modifier.height(3.dp))
                            Text(entry.text, style = Type.Body, color = Ink.Body)
                            val translated = entry.translation
                            if (translate && !translated.isNullOrBlank()) {
                                Spacer(Modifier.height(2.dp))
                                Text(translated, style = Type.BubbleTranslation, color = Ink.Mute)
                            }
                        }
                        if (index != current.transcript.lastIndex) Rule(Ink.CanvasSoft)
                    }
                }
            }
        }

        if (presentation == Presentation.NO_ANSWER || presentation == Presentation.DONE) {
            Spacer(Modifier.height(20.dp))
            OutlineButton(
                label = stringResource(R.string.action_redial_same),
                onClick = { vm.redial(current) { id -> onRedialled(id) } },
                modifier = Modifier.fillMaxWidth(),
                style = Type.ButtonSmall,
                leading = { Icon(Wise.Rotate, null, tint = Ink.Text, modifier = Modifier.size(15.dp)) },
            )
        }
    }
}
