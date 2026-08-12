package com.voicecall.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.material3.Text
import com.voicecall.R
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import kotlin.math.roundToInt

/**
 * Where the first-run tour points. Measured on Home in window coordinates and
 * handed up, because the overlay is drawn above the navigation bar and so
 * cannot live inside the screen it is describing.
 *
 * [Rect.Zero] means "not on screen" — the mic is absent on a device with no
 * speech recogniser, and a tour step pointing at nothing is worse than one
 * fewer step.
 */
data class CoachTargets(
    val composer: Rect = Rect.Zero,
    val mic: Rect = Rect.Zero,
    val action: Rect = Rect.Zero,
)

private data class CoachStep(val target: Rect, val corner: Float, val title: Int, val body: Int)

/**
 * The three coach marks over Home: say it in one sentence, hold to speak,
 * nothing dials until you confirm.
 *
 * A 62% ink scrim with the target punched out of it and ringed in lime. The
 * hole is cut with a Clear blend inside an offscreen layer — painting four
 * rectangles around the target instead would leave seams on the corners, and
 * cannot round them.
 */
@Composable
fun HomeCoach(targets: CoachTargets, onFinished: () -> Unit) {
    val steps = remember(targets) {
        listOfNotNull(
            targets.composer.takeIf { !it.isEmpty }
                ?.let { CoachStep(it, 30f, R.string.coach_title_1, R.string.coach_body_1) },
            targets.mic.takeIf { !it.isEmpty }
                ?.let { CoachStep(it, it.height / 2f, R.string.coach_title_2, R.string.coach_body_2) },
            targets.action.takeIf { !it.isEmpty }
                ?.let { CoachStep(it, 34f, R.string.coach_title_3, R.string.coach_body_3) },
        )
    }

    var index by remember { mutableIntStateOf(0) }
    // Nothing measured yet: the first frame of Home has no bounds to point at.
    if (steps.isEmpty()) return
    val step = steps[index.coerceAtMost(steps.lastIndex)]
    val last = index >= steps.lastIndex

    val density = LocalDensity.current
    val pad = with(density) { 6.dp.toPx() }
    val hole = Rect(
        left = step.target.left - pad,
        top = step.target.top - pad,
        right = step.target.right + pad,
        bottom = step.target.bottom + pad,
    )

    Box(
        Modifier
            .fillMaxSize()
            // Swallows everything: during the tour the screen underneath is an
            // illustration, not something to poke at.
            .pointerInput(steps, index) { detectTapGestures { } }
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .drawWithContent {
                drawRect(Ink.Text.copy(alpha = 0.62f))
                drawRoundRect(
                    color = Color.Transparent,
                    topLeft = Offset(hole.left, hole.top),
                    size = Size(hole.width, hole.height),
                    cornerRadius = CornerRadius(step.corner * density.density),
                    blendMode = BlendMode.Clear,
                )
                drawContent()
            },
    ) {
        // The ring, drawn after the hole so the Clear pass cannot erase it.
        Box(
            Modifier.fillMaxSize().drawBehind {
                drawRoundRect(
                    color = Ink.Lime,
                    topLeft = Offset(hole.left, hole.top),
                    size = Size(hole.width, hole.height),
                    cornerRadius = CornerRadius(step.corner * density.density),
                    style = Stroke(width = 2.5.dp.toPx()),
                )
            },
        )

        CoachCard(
            hole = hole,
            index = index,
            total = steps.size,
            title = stringResource(step.title),
            body = stringResource(step.body),
            last = last,
            onSkip = onFinished,
            onNext = { if (last) onFinished() else index++ },
        )
    }
}

@Composable
private fun CoachCard(
    hole: Rect,
    index: Int,
    total: Int,
    title: String,
    body: String,
    last: Boolean,
    onSkip: () -> Unit,
    onNext: () -> Unit,
) {
    val density = LocalDensity.current
    var cardHeight by remember { mutableIntStateOf(0) }
    var containerHeight by remember { mutableIntStateOf(0) }

    val margin = with(density) { 24.dp.toPx() }
    val gap = with(density) { 20.dp.toPx() }

    Box(
        Modifier
            .fillMaxSize()
            .onSizeChanged { containerHeight = it.height }
            .padding(horizontal = 24.dp),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .offset {
                    // Below the hole when there is room under it, above when
                    // there is not — the card must never cover what it points at.
                    val below = hole.bottom + gap
                    val fitsBelow = below + cardHeight <= containerHeight - margin
                    val y = if (fitsBelow) below else (hole.top - gap - cardHeight)
                    IntOffset(0, y.coerceAtLeast(margin).roundToInt())
                }
                .onSizeChanged { cardHeight = it.height }
                .background(Ink.Card, CardShape)
                .padding(18.dp),
        ) {
            Column(Modifier.fillMaxWidth()) {
                Text("${index + 1} / $total", style = Type.LabelSmall, color = Ink.Mute)
                Spacer(Modifier.height(6.dp))
                Text(title, style = Type.Section, color = Ink.Text)
                Spacer(Modifier.height(6.dp))
                Text(body, style = Type.Caption, color = Ink.Body)
                Spacer(Modifier.height(14.dp))
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    // The way out is only offered while there is something left
                    // to skip.
                    if (!last) {
                        LinkText(stringResource(R.string.action_skip_tour), onSkip, style = Type.LinkSmall)
                    }
                    Spacer(Modifier.weight(1f))
                    PrimaryButton(
                        label = stringResource(if (last) R.string.action_got_it else R.string.action_next),
                        onClick = onNext,
                        height = 40.dp,
                        style = Type.ButtonSmall,
                    )
                }
            }
        }
    }
}
