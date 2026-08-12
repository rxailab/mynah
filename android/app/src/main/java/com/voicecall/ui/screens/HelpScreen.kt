package com.voicecall.ui.screens

import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.voicecall.R
import com.voicecall.ui.GroupedCard
import com.voicecall.ui.ScreenHeader
import com.voicecall.ui.WiseCard
import com.voicecall.ui.clickableNoRipple
import com.voicecall.ui.navBarPadding
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import com.voicecall.ui.theme.Wise

private val FAQ = listOf(
    R.string.faq_q_guessing to R.string.faq_a_guessing,
    R.string.faq_q_caller_id to R.string.faq_a_caller_id,
    R.string.faq_q_recordings to R.string.faq_a_recordings,
    R.string.faq_q_handover to R.string.faq_a_handover,
    R.string.faq_q_cost to R.string.faq_a_cost,
)

/**
 * The five questions the app raises by existing.
 *
 * Answered here rather than linked out: every one of them is about what the
 * assistant will and will not do on a live call, and someone asking has a phone
 * in their hand, not a browser.
 */
@Composable
fun HelpScreen(onBack: () -> Unit, onContact: () -> Unit) {
    // One open at a time, the first by default — the answer to "does it make
    // things up" is the one worth putting in front of everybody.
    var open by remember { mutableIntStateOf(0) }

    Column(
        Modifier
            .fillMaxSize()
            .padding(top = statusBarPadding(), bottom = navBarPadding()),
    ) {
        ScreenHeader(title = stringResource(R.string.help_title), onBack = onBack)

        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 24.dp),
        ) {
            GroupedCard(rows = FAQ.mapIndexed { index, (question, answer) ->
                {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .clickableNoRipple { open = if (open == index) -1 else index }
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                stringResource(question),
                                style = Type.RowTitle,
                                color = Ink.Text,
                                modifier = Modifier.weight(1f),
                            )
                            Spacer(Modifier.width(10.dp))
                            Icon(
                                Wise.ChevronRight,
                                null,
                                tint = Ink.Mute,
                                modifier = Modifier.size(14.dp).rotate(if (open == index) 90f else 0f),
                            )
                        }
                        AnimatedVisibility(open == index) {
                            Column {
                                Spacer(Modifier.height(8.dp))
                                Text(stringResource(answer), style = Type.Caption, color = Ink.Body)
                            }
                        }
                    }
                }
            })

            Spacer(Modifier.height(14.dp))
            WiseCard(radius = 16.dp) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(R.string.help_contact_title), style = Type.RowTitle, color = Ink.Text)
                        Text(stringResource(R.string.help_contact_body), style = Type.RowSub, color = Ink.Mute)
                    }
                    Spacer(Modifier.width(12.dp))
                    Text(
                        stringResource(R.string.help_contact_action),
                        style = Type.Chip,
                        color = Ink.Deep,
                        modifier = Modifier.clickableNoRipple(onContact),
                    )
                }
            }
        }
    }
}
