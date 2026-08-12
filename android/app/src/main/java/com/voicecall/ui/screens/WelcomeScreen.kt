package com.voicecall.ui.screens

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.voicecall.R
import com.voicecall.ui.CardShape
import com.voicecall.ui.LinkText
import com.voicecall.ui.PillShape
import com.voicecall.ui.PrimaryButton
import com.voicecall.ui.PulsingDot
import com.voicecall.ui.Rule
import com.voicecall.ui.WiseCard
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import kotlinx.coroutines.launch

private const val SLIDES = 3

/**
 * Three slides before the sign-in screen.
 *
 * The illustrations are the app's own call screen and confirm card, rebuilt at
 * a smaller size — the design is explicit that onboarding must not introduce a
 * graphic language the rest of the app then fails to live up to. What you are
 * shown here is what you get.
 */
@Composable
fun WelcomeScreen(onDone: () -> Unit) {
    val pager = rememberPagerState(pageCount = { SLIDES })
    val scope = rememberCoroutineScope()
    val last = pager.currentPage == SLIDES - 1

    Column(
        Modifier
            .fillMaxSize()
            .padding(top = statusBarPadding())
            .padding(bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, top = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BrandMark(Modifier.weight(1f))
            // Gone on the last slide: there is nothing left to skip past.
            if (!last) {
                LinkText(stringResource(R.string.action_skip), onDone, style = Type.LinkSmall)
            }
        }

        HorizontalPager(state = pager, modifier = Modifier.weight(1f)) { page ->
            Column(Modifier.fillMaxSize()) {
                Box(
                    Modifier.weight(1f).fillMaxWidth().padding(horizontal = 28.dp, vertical = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    when (page) {
                        0 -> LiveCallSample()
                        1 -> ConfirmSample()
                        else -> BilingualSample()
                    }
                }
                Column(Modifier.padding(horizontal = 28.dp)) {
                    Text(
                        stringResource(
                            when (page) {
                                0 -> R.string.welcome_title_1
                                1 -> R.string.welcome_title_2
                                else -> R.string.welcome_title_3
                            },
                        ),
                        style = Type.Display,
                        color = Ink.Text,
                    )
                    Spacer(Modifier.height(14.dp))
                    Text(
                        stringResource(
                            when (page) {
                                0 -> R.string.welcome_body_1
                                1 -> R.string.welcome_body_2
                                else -> R.string.welcome_body_3
                            },
                        ),
                        style = Type.Body,
                        color = Ink.Body,
                    )
                }
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(top = 24.dp, bottom = 20.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            repeat(SLIDES) { i ->
                val active = i == pager.currentPage
                // The active dot stretches into a bar rather than a new shape
                // appearing, so the row never jumps.
                val width by animateDpAsState(if (active) 20.dp else 7.dp, label = "dot$i")
                Box(
                    Modifier
                        .padding(horizontal = 3.5.dp)
                        .width(width)
                        .height(7.dp)
                        .background(if (active) Ink.Text else Ink.Rim, PillShape),
                )
            }
        }

        Box(Modifier.padding(start = 20.dp, end = 20.dp, bottom = 24.dp)) {
            PrimaryButton(
                label = stringResource(if (last) R.string.action_get_started else R.string.action_next),
                onClick = {
                    if (last) onDone() else scope.launch { pager.animateScrollToPage(pager.currentPage + 1) }
                },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/** The lime bars and the wordmark, as the design's top-left brand row. */
@Composable
private fun BrandMark(modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Row(
            Modifier.height(18.dp),
            horizontalArrangement = Arrangement.spacedBy(1.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            listOf(8.dp, 16.dp, 10.dp).forEach { h ->
                Box(Modifier.width(4.dp).height(h).background(Ink.Lime, PillShape))
            }
        }
        Spacer(Modifier.width(8.dp))
        Text(
            stringResource(R.string.app_name).uppercase(),
            style = Type.Label,
            color = Ink.Mute,
        )
    }
}

// --- the three illustrations ----------------------------------------------

@Composable
private fun LiveCallSample() {
    DarkPanel {
        Row(
            Modifier
                .align(Alignment.CenterHorizontally)
                .background(Ink.OnDarkWash, PillShape)
                .padding(horizontal = 15.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PulsingDot(Ink.Lime, 7.dp)
            Spacer(Modifier.width(7.dp))
            Text(stringResource(R.string.status_on_the_call), style = Type.Chip, color = Ink.OnDark)
            Spacer(Modifier.width(7.dp))
            Text("02:41", style = Type.MonoBody, color = Ink.OnDarkMute)
        }
        Spacer(Modifier.height(16.dp))
        SampleBubble(
            speaker = stringResource(R.string.speaker_assistant),
            text = stringResource(R.string.welcome_line_assistant_1),
            translation = stringResource(R.string.welcome_line_assistant_1_sub),
            fromAssistant = true,
        )
        Spacer(Modifier.height(10.dp))
        SampleBubble(
            speaker = "THE IVY",
            text = stringResource(R.string.welcome_line_business_1),
            translation = stringResource(R.string.welcome_line_business_1_sub),
            fromAssistant = false,
        )
    }
}

@Composable
private fun BilingualSample() {
    DarkPanel {
        Box(
            Modifier
                .align(Alignment.CenterHorizontally)
                .background(Ink.OnDarkWash, PillShape)
                .padding(horizontal = 15.dp, vertical = 7.dp),
        ) {
            Text(stringResource(R.string.welcome_subtitle_pill), style = Type.Fine, color = Ink.OnDark)
        }
        Spacer(Modifier.height(16.dp))
        SampleBubble(
            speaker = "THE IVY",
            text = stringResource(R.string.welcome_line_business_2),
            translation = stringResource(R.string.welcome_line_business_2_sub),
            fromAssistant = false,
        )
        Spacer(Modifier.height(10.dp))
        SampleBubble(
            speaker = stringResource(R.string.speaker_assistant),
            text = stringResource(R.string.welcome_line_assistant_2),
            translation = stringResource(R.string.welcome_line_assistant_2_sub),
            fromAssistant = true,
        )
    }
}

/** The confirm screen's card, shrunk: three rows and the one lime action. */
@Composable
private fun ConfirmSample() {
    WiseCard {
        SampleRow(stringResource(R.string.field_who), "The Ivy", bold = true)
        Rule()
        SampleRow(stringResource(R.string.field_when), stringResource(R.string.welcome_sample_when), bold = true)
        Rule()
        SampleRow(stringResource(R.string.field_phone), "+44 20 7836 4751", mono = true)
        Box(Modifier.padding(start = 18.dp, end = 18.dp, top = 6.dp, bottom = 18.dp)) {
            PrimaryButton(
                label = stringResource(R.string.action_dial),
                onClick = {},
                enabled = false,
                height = 46.dp,
                // Inert, but it must not look disabled — this is a picture of
                // the real button, not a dead one.
                disabledContainer = Ink.Lime,
                disabledContent = Ink.OnLime,
                style = Type.ButtonSmall,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun DarkPanel(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxWidth().background(Ink.Text, CardShape).padding(20.dp),
        content = content,
    )
}

@Composable
private fun SampleRow(label: String, value: String, bold: Boolean = false, mono: Boolean = false) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = Type.Body, color = Ink.Body, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(12.dp))
        Text(
            value,
            style = if (mono) Type.MonoBody else if (bold) Type.Value else Type.Body,
            color = Ink.Text,
        )
    }
}

@Composable
private fun ColumnScope.SampleBubble(
    speaker: String,
    text: String,
    translation: String,
    fromAssistant: Boolean,
) {
    Column(
        Modifier.fillMaxWidth(),
        horizontalAlignment = if (fromAssistant) Alignment.End else Alignment.Start,
    ) {
        Text(
            speaker,
            style = Type.Speaker,
            color = Ink.OnDarkMute,
            modifier = Modifier.padding(horizontal = 8.dp),
        )
        Spacer(Modifier.height(3.dp))
        Column(
            Modifier
                .widthIn(max = 270.dp)
                .background(if (fromAssistant) Ink.Lime else Ink.OnDarkBubble, RoundedCornerShape(18.dp))
                .padding(horizontal = 15.dp, vertical = 11.dp),
        ) {
            Text(text, style = Type.Bubble, color = if (fromAssistant) Ink.OnLime else Ink.OnDark)
            Spacer(Modifier.height(5.dp))
            Rule(if (fromAssistant) Ink.OnLime.copy(alpha = 0.15f) else Ink.OnDarkRim)
            Spacer(Modifier.height(5.dp))
            Text(
                translation,
                style = Type.BubbleTranslation,
                color = if (fromAssistant) Ink.Deep else Ink.OnDarkMute,
            )
        }
    }
}
