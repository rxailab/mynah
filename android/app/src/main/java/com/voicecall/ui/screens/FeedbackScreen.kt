package com.voicecall.ui.screens

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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.voicecall.R
import com.voicecall.data.FeedbackReason
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.PrimaryButton
import com.voicecall.ui.ScreenHeader
import com.voicecall.ui.WiseCard
import com.voicecall.ui.clickableNoRipple
import com.voicecall.ui.navBarPadding
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type

/** The label for each reason the server will accept. */
@Composable
private fun labelFor(reason: String): String = stringResource(
    when (reason) {
        FeedbackReason.WRONG_DETAILS -> R.string.feedback_reason_wrong_details
        FeedbackReason.MISHEARD -> R.string.feedback_reason_misheard
        FeedbackReason.TOO_WORDY -> R.string.feedback_reason_too_wordy
        FeedbackReason.QUEUED_TOO_LONG -> R.string.feedback_reason_queued_too_long
        else -> R.string.feedback_reason_other
    },
)

/**
 * What the person made of the call.
 *
 * Three layers, each of which can be skipped: did it work, what went wrong, and
 * anything else. Only the first is required — a form that demands reasons gets
 * fewer verdicts, and the verdict is the part worth having.
 *
 * The line at the foot is not decoration. "Feedback" on a screen about a phone
 * call to a real business could reasonably be read as a complaint going to that
 * business, or as a request to try again; it does neither, and says so.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FeedbackScreen(
    vm: CallsViewModel,
    callId: String,
    onBack: () -> Unit,
    onSent: () -> Unit,
) {
    val state by vm.uiState.collectAsState()
    val call = state.calls.firstOrNull { it.id == callId }

    var verdict by remember { mutableStateOf(call?.feedback?.verdict.orEmpty()) }
    val reasons = remember { mutableStateListOf<String>().apply { addAll(call?.feedback?.reasons.orEmpty()) } }
    var note by remember { mutableStateOf(call?.feedback?.note.orEmpty()) }
    var sending by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxSize()
            .imePadding()
            .padding(top = statusBarPadding(), bottom = navBarPadding()),
    ) {
        ScreenHeader(title = stringResource(R.string.feedback_title), onBack = onBack)

        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, top = 14.dp),
        ) {
            call?.let {
                Text(
                    it.businessName.ifBlank { it.phoneNumber },
                    style = Type.Caption,
                    color = Ink.Body,
                )
                Spacer(Modifier.height(12.dp))
            }

            WiseCard(radius = 24.dp) {
                Column(Modifier.padding(18.dp)) {
                    Text(
                        stringResource(R.string.feedback_verdict_label).uppercase(),
                        style = Type.LabelSmall,
                        color = Ink.Mute,
                    )
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Choice(stringResource(R.string.feedback_good), verdict == "good") {
                            verdict = "good"
                        }
                        Choice(stringResource(R.string.feedback_bad), verdict == "bad") {
                            verdict = "bad"
                        }
                    }

                    Spacer(Modifier.height(16.dp))
                    Box(Modifier.fillMaxWidth().height(1.dp).background(Ink.Divider))
                    Spacer(Modifier.height(16.dp))

                    Text(
                        stringResource(R.string.feedback_reasons_label).uppercase(),
                        style = Type.LabelSmall,
                        color = Ink.Mute,
                    )
                    Spacer(Modifier.height(10.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        FeedbackReason.ALL.forEach { reason ->
                            Choice(labelFor(reason), reasons.contains(reason)) {
                                if (!reasons.remove(reason)) reasons.add(reason)
                            }
                        }
                    }

                    Spacer(Modifier.height(16.dp))
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 110.dp)
                            .border(1.dp, Ink.Outline, RoundedCornerShape(12.dp))
                            .padding(horizontal = 15.dp, vertical = 14.dp),
                    ) {
                        if (note.isEmpty()) {
                            Text(
                                stringResource(R.string.feedback_note_hint),
                                style = Type.Body,
                                color = Ink.Mute,
                            )
                        }
                        BasicTextField(
                            value = note,
                            onValueChange = { note = it.take(2000) },
                            textStyle = Type.Body.copy(color = Ink.Text),
                            cursorBrush = SolidColor(Ink.Text),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            Text(
                stringResource(R.string.feedback_note),
                style = Type.Fine,
                color = Ink.Mute,
                modifier = Modifier.padding(horizontal = 6.dp),
            )
            Spacer(Modifier.height(24.dp))
        }

        Box(Modifier.padding(start = 20.dp, end = 20.dp, bottom = 20.dp)) {
            PrimaryButton(
                label = stringResource(R.string.feedback_send),
                onClick = {
                    sending = true
                    vm.sendFeedback(callId, verdict, reasons.toList(), note) { onSent() }
                },
                enabled = verdict.isNotEmpty() && !sending,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/** The design's small pill: ink when chosen, hairline outline when not. */
@Composable
private fun Choice(label: String, selected: Boolean, onClick: () -> Unit) {
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
