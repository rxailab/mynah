package com.voicecall.ui

import android.content.Context
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.StartOffset
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.voicecall.R
import com.voicecall.data.Call
import com.voicecall.data.CallStatus
import com.voicecall.data.Cost
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import com.voicecall.ui.theme.Wise
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.max

// --- the shapes the whole design is cut from -------------------------------

/** 24dp everywhere: cards, the lime capsule, the dark panels. */
val CardShape = RoundedCornerShape(24.dp)
val ButtonShape = RoundedCornerShape(24.dp)
val FieldShape = RoundedCornerShape(12.dp)

/** Anything the design wants read as "interactive" is fully round. */
val PillShape = RoundedCornerShape(percent = 50)

// --- how a call presents itself -------------------------------------------

/**
 * @param dot the bead in a list row — the whole state, read before any words.
 */
enum class Presentation(val label: Int, val ink: Color, val wash: Color, val dot: Color) {
    NEEDS_YOU(R.string.status_needs_you, Ink.WarningInk, Ink.Warning, Ink.WarningDeep),

    // Live and dialling borrow the dark panel: on a page of white cards, ink is
    // the loudest surface there is, and lime on it is the same pairing the call
    // screen itself uses.
    LIVE(R.string.status_on_the_call, Ink.Lime, Ink.Text, Ink.Lime),
    DIALLING(R.string.status_dialling, Ink.Warning, Ink.Text, Ink.Warning),

    DONE(R.string.status_done, Ink.PositiveDeep, Ink.LimePale, Ink.Positive),
    NO_ANSWER(R.string.status_no_answer, Ink.NegativeDeep, Ink.NegativeWash, Ink.Negative),
}

fun Call.presentation(): Presentation = when (status) {
    CallStatus.TRANSFERRING -> Presentation.NEEDS_YOU
    CallStatus.IN_PROGRESS -> Presentation.LIVE
    CallStatus.QUEUED, CallStatus.DIALING -> Presentation.DIALLING
    CallStatus.FAILED -> Presentation.NO_ANSWER
    else -> Presentation.DONE
}

/**
 * A finished card leads with the answer, not with who was called — that is the
 * whole point of the history. Fall back down the chain when there is nothing
 * better to lead with.
 */
@Composable
fun Call.headline(): String = when (presentation()) {
    Presentation.DONE -> results.values.firstOrNull()?.takeIf { it.isNotBlank() }
        ?: summary?.takeIf { it.isNotBlank() }
        ?: businessName
    Presentation.NO_ANSWER -> stringResource(R.string.status_no_answer)
    Presentation.NEEDS_YOU -> stringResource(R.string.headline_needs_you, businessName)
    else -> goal
}

@Composable
fun Call.subline(): String = when (presentation()) {
    Presentation.DONE -> summary?.takeIf { it.isNotBlank() && it != headline() } ?: businessName
    Presentation.NO_ANSWER -> error ?: stringResource(R.string.subline_did_not_connect)
    Presentation.NEEDS_YOU -> stringResource(R.string.subline_transfer)
    Presentation.DIALLING -> stringResource(R.string.subline_ringing)
    Presentation.LIVE -> goal
}

private val clock = SimpleDateFormat("HH:mm", Locale.getDefault())

fun formatClock(epochMillis: Long): String = clock.format(Date(epochMillis))

fun elapsedOf(call: Call, now: Long): String {
    val until = call.endedAt ?: now
    val seconds = max(0L, (until - call.createdAt) / 1000)
    return "%02d:%02d".format(seconds / 60, seconds % 60)
}

/**
 * How long this call has been queueing, in the same mm:ss the call's own timer
 * uses — two clocks side by side only read as a comparison if they are written
 * the same way.
 */
fun holdElapsedOf(call: Call, now: Long): String {
    val seconds = call.holdSoFarSeconds(now)
    return "%02d:%02d".format(seconds / 60, seconds % 60)
}

/** "2m 06s" — the shape the design writes finished durations in. */
fun durationLabel(seconds: Int): String =
    if (seconds >= 60) "%dm %02ds".format(seconds / 60, seconds % 60) else "${seconds}s"

/** "Today" / "Yesterday" / "14 May" — the headers history groups under. */
fun dayLabel(context: Context, epochMillis: Long, now: Long): String {
    val startOfToday = Calendar.getInstance().apply {
        timeInMillis = now
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis
    val day = 24L * 60 * 60 * 1000
    return when {
        epochMillis >= startOfToday -> context.getString(R.string.day_today)
        epochMillis >= startOfToday - day -> context.getString(R.string.day_yesterday)
        else -> {
            val locale = context.resources.configuration.locales[0]
            SimpleDateFormat(if (locale.language == "zh") "M月d日" else "d MMMM", locale)
                .format(Date(epochMillis))
        }
    }
}

/** "£0.14 · 2m 06s" — what Twilio charged, once it has rated the call. */
fun costLabel(cost: Cost): String {
    val symbol = when (cost.unit.uppercase()) {
        "GBP" -> "£"; "USD" -> "$"; "EUR" -> "€"; else -> ""
    }
    val amount = cost.price.trimEnd('0').trimEnd('.').ifEmpty { "0" }
    val money = if (symbol.isEmpty()) "$amount ${cost.unit}" else "$symbol$amount"
    val s = cost.durationSeconds
    return "$money · ${s / 60}m ${"%02d".format(s % 60)}s"
}

// --- the surface ----------------------------------------------------------

/**
 * The page. Sage, flat, and completely plain: in this design the hierarchy is
 * carried by the contrast between the canvas and the white cards sitting on it,
 * so there is nothing to blur, tint or shade behind them.
 */
@Composable
fun AppBackdrop(
    modifier: Modifier = Modifier,
    colour: Color = Ink.Canvas,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(modifier.fillMaxSize().background(colour), content = content)
}

/** The one repeated surface: white, 24dp, no shadow and no rim. */
@Composable
fun WiseCard(
    modifier: Modifier = Modifier,
    fill: Color = Ink.Card,
    radius: Dp = 24.dp,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(radius)
    Column(
        modifier
            .fillMaxWidth()
            .background(fill, shape)
            .then(if (onClick != null) Modifier.clickableNoRipple(onClick) else Modifier),
        content = content,
    )
}

/** A row inside a card, with the rule the design puts between rows. */
@Composable
fun CardRow(
    modifier: Modifier = Modifier,
    divider: Boolean = true,
    onClick: (() -> Unit)? = null,
    padding: PaddingValues = PaddingValues(horizontal = 18.dp, vertical = 14.dp),
    dividerColour: Color = Ink.Divider,
    content: @Composable RowScope.() -> Unit,
) {
    Column(modifier) {
        Row(
            Modifier
                .fillMaxWidth()
                .then(if (onClick != null) Modifier.clickableNoRipple(onClick) else Modifier)
                .padding(padding),
            verticalAlignment = Alignment.CenterVertically,
            content = content,
        )
        if (divider) Rule(dividerColour)
    }
}

@Composable
fun Rule(colour: Color = Ink.Divider, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(1.dp).background(colour))
}

/** The Wise input: white, an ink hairline, and a 12dp corner. Never filled. */
fun Modifier.wiseField(shape: Shape = FieldShape): Modifier = this
    .background(Ink.Card, shape)
    .border(1.dp, Ink.Outline, shape)

// --- actions --------------------------------------------------------------

/**
 * The lime capsule. There is at most one of these on a screen — it is what the
 * screen is for. Disabled it goes flat sage with muted text rather than fading,
 * because a translucent lime still reads as the thing to press.
 */
@Composable
fun PrimaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    height: Dp = 52.dp,
    container: Color = Ink.Lime,
    content: Color = Ink.OnLime,
    disabledContainer: Color = Ink.CanvasSoft,
    disabledContent: Color = Ink.Mute,
    style: TextStyle = Type.Button,
    leading: @Composable (() -> Unit)? = null,
) {
    Row(
        modifier
            .height(height)
            .pressable(enabled, onClick)
            .background(if (enabled) container else disabledContainer, ButtonShape)
            .padding(horizontal = 22.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leading != null) {
            leading()
            Spacer(Modifier.width(9.dp))
        }
        Text(label, style = style, color = if (enabled) content else disabledContent, maxLines = 1)
    }
}

/** White with an ink outline — the secondary action. "Call again", "Manage". */
@Composable
fun OutlineButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    height: Dp = 50.dp,
    colour: Color = Ink.Text,
    fill: Color = Ink.Card,
    border: Color = Ink.Outline,
    style: TextStyle = Type.Button,
    leading: @Composable (() -> Unit)? = null,
) {
    Row(
        modifier
            .height(height)
            .alpha(if (enabled) 1f else 0.4f)
            .pressable(enabled, onClick)
            .background(fill, ButtonShape)
            .border(1.dp, border, ButtonShape)
            .padding(horizontal = 20.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leading != null) {
            leading()
            Spacer(Modifier.width(8.dp))
        }
        Text(label, style = style, color = colour, maxLines = 1)
    }
}

/** An underlined link in the deep green. The design's third level of action. */
@Composable
fun LinkText(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    style: TextStyle = Type.Link,
    colour: Color = Ink.Deep,
) {
    Text(
        text,
        style = style.copy(textDecoration = TextDecoration.Underline),
        color = colour,
        modifier = modifier.clickableNoRipple(onClick),
    )
}

/** A white pill that fills something in for you — an example, a template. */
@Composable
fun SuggestionChip(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    fill: Color = Ink.Card,
    colour: Color = Ink.Text,
) {
    Box(
        modifier
            .background(fill, PillShape)
            .clickableNoRipple(onClick)
            .padding(horizontal = 15.dp, vertical = 9.dp),
    ) {
        Text(label, style = Type.Chip, color = colour, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/**
 * The Material filter chip, in Wise's clothes: the live one goes ink with lime
 * text, which is the same "dark card" move the account and usage panels make.
 */
@Composable
fun FilterChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier
            .background(if (selected) Ink.Text else Ink.Card, PillShape)
            .clickableNoRipple(onClick)
            .padding(horizontal = 15.dp, vertical = 8.dp),
    ) {
        Text(
            label,
            style = Type.ChipStrong,
            color = if (selected) Ink.Lime else Ink.Text,
            maxLines = 1,
        )
    }
}

/** DONE / NEEDS YOU / ON THE CALL, as the design's rounded badge. */
@Composable
fun StatusBadge(presentation: Presentation, modifier: Modifier = Modifier) {
    Box(
        modifier
            .background(presentation.wash, PillShape)
            .padding(horizontal = 11.dp, vertical = 5.dp),
    ) {
        Text(stringResource(presentation.label), style = Type.Badge, color = presentation.ink)
    }
}

/** The bead at the head of a list row. It breathes while the call is running. */
@Composable
fun StatusDot(presentation: Presentation, modifier: Modifier = Modifier, size: Dp = 8.dp) {
    val live = presentation == Presentation.LIVE || presentation == Presentation.DIALLING
    if (live) PulsingDot(presentation.dot, size, modifier)
    else Box(modifier.size(size).background(presentation.dot, CircleShape))
}

/** The wide-tracked uppercase label that titles a group. */
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier, colour: Color = Ink.Mute) {
    Text(text.uppercase(), style = Type.Label, color = colour, modifier = modifier)
}

/**
 * Back, or ✕ on a full-screen dialog. Android puts it top-left; the negative
 * inset lines the glyph up with the text below rather than the 40dp target.
 */
@Composable
fun NavIcon(
    icon: ImageVector,
    description: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tint: Color = Ink.Text,
    size: Dp = 21.dp,
) {
    Box(
        modifier
            .offset(x = (-8).dp)
            .size(40.dp)
            .clickableNoRipple(onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, description, tint = tint, modifier = Modifier.size(size))
    }
}

/** The header on a step of the new-call flow: ✕ or ←, a title, and "2 / 3". */
@Composable
fun StepHeader(
    icon: ImageVector,
    description: String,
    onNavigate: () -> Unit,
    title: String,
    step: String? = null,
    modifier: Modifier = Modifier,
) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        NavIcon(icon, description, onNavigate)
        Spacer(Modifier.width(4.dp))
        Text(
            title,
            style = Type.Section,
            color = Ink.Text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        if (step != null) {
            Spacer(Modifier.weight(1f))
            Text(step, style = Type.LinkSmall, color = Ink.Mute)
        }
    }
}

// --- motion ---------------------------------------------------------------

/**
 * Bars that rise and fall: the one thing that says a call is happening now.
 * The staggered lime bars are the prototype's welcome animation, reused
 * wherever the app is listening or on a line.
 */
@Composable
fun Waveform(
    modifier: Modifier = Modifier,
    barCount: Int = 3,
    barWidth: Dp = 3.dp,
    gap: Dp = 2.5.dp,
    periodMs: Int = 1000,
    staggerMs: Int = 200,
    colour: Color = Ink.Lime,
) {
    val transition = rememberInfiniteTransition(label = "waveform")
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(gap), verticalAlignment = Alignment.CenterVertically) {
        repeat(barCount) { i ->
            val scale by transition.animateFloat(
                initialValue = 0.3f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(periodMs),
                    repeatMode = RepeatMode.Reverse,
                    initialStartOffset = StartOffset(i * staggerMs),
                ),
                label = "bar$i",
            )
            Box(
                Modifier
                    .width(barWidth)
                    .fillMaxHeight()
                    .scale(scaleX = 1f, scaleY = scale)
                    .background(colour, RoundedCornerShape(3.dp)),
            )
        }
    }
}

/** A dot that breathes, for anything waiting on someone. */
@Composable
fun PulsingDot(colour: Color, size: Dp = 7.dp, modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "pulse")
    val alpha by transition.animateFloat(
        initialValue = 1f,
        targetValue = 0.3f,
        animationSpec = infiniteRepeatable(tween(600), RepeatMode.Reverse),
        label = "alpha",
    )
    Box(modifier.size(size).alpha(alpha).background(colour, CircleShape))
}

/** Rings expanding outward — dialling, and the mic while it listens. */
@Composable
fun PulseRings(modifier: Modifier = Modifier, colour: Color = Ink.Lime, periodMs: Int = 1800) {
    val transition = rememberInfiniteTransition(label = "rings")
    Box(modifier, contentAlignment = Alignment.Center) {
        repeat(2) { i ->
            val progress by transition.animateFloat(
                initialValue = 0f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(periodMs),
                    initialStartOffset = StartOffset(i * periodMs / 3),
                ),
                label = "ring$i",
            )
            Box(
                Modifier
                    .fillMaxSize()
                    .scale(0.9f + progress * 0.6f)
                    .alpha((1f - progress) * 0.6f)
                    .border(2.dp, colour, CircleShape),
            )
        }
    }
}

// --- plumbing -------------------------------------------------------------

/**
 * The design presses its buttons by shrinking them slightly. Material's ripple
 * would be the wrong idiom on a flat lime capsule, so it is turned off here and
 * the scale carries the feedback instead.
 */
@Composable
fun Modifier.pressable(enabled: Boolean = true, onClick: () -> Unit): Modifier {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.97f else 1f, label = "press")
    return this
        .scale(scale)
        .clickable(interactionSource = interaction, indication = null, enabled = enabled, onClick = onClick)
}

/** Taps with no ripple, for rows and cards that shouldn't move under a finger. */
@Composable
fun Modifier.clickableNoRipple(onClick: () -> Unit): Modifier = this.clickable(
    interactionSource = remember { MutableInteractionSource() },
    indication = null,
    onClick = onClick,
)

@Composable
fun OneLine(text: String, style: TextStyle, colour: Color, modifier: Modifier = Modifier) {
    Text(text, style = style, color = colour, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = modifier)
}

/**
 * Something went wrong. A white card with red text rather than a red card: in
 * this palette the semantic colours only ever carry state, never a surface.
 */
@Composable
fun ErrorCard(message: String, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
    WiseCard(modifier) {
        Column(Modifier.padding(horizontal = 18.dp, vertical = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).background(Ink.Negative, CircleShape))
                Spacer(Modifier.width(9.dp))
                Text(message, style = Type.Caption, color = Ink.Body, modifier = Modifier.weight(1f))
            }
            Spacer(Modifier.height(10.dp))
            LinkText(
                stringResource(R.string.action_dismiss),
                onDismiss,
                style = Type.LinkSmall,
                modifier = Modifier.padding(start = 17.dp),
            )
        }
    }
}

/** The amber panel: the assistant has stopped and is waiting on you. */
@Composable
fun NeedsYouCard(
    title: String,
    body: String,
    action: String,
    onAction: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier
            .fillMaxWidth()
            .background(Ink.Warning, CardShape)
            .padding(18.dp),
    ) {
        Text(title, style = Type.Section, color = Ink.WarningInk)
        Spacer(Modifier.height(6.dp))
        Text(body, style = Type.Caption, color = Ink.WarningInk)
        Spacer(Modifier.height(14.dp))
        OutlineButton(
            label = action,
            onClick = onAction,
            height = 46.dp,
            fill = Color.Transparent,
            border = Ink.WarningInk,
            colour = Ink.WarningInk,
            style = Type.ButtonSmall,
            leading = { Icon(Wise.Phone, null, tint = Ink.WarningInk, modifier = Modifier.size(15.dp)) },
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

// --- the redesign's shared furniture ------------------------------------------
// Every screen pushed over the feed opens the same way, and the feed itself is
// three shapes repeated: an icon button, a filter chip, and a row in a grouped
// white card. They live here so the twenty screens that use them cannot drift.

/** Back arrow, title, and optionally something on the right. */
@Composable
fun ScreenHeader(
    title: String,
    onBack: () -> Unit,
    trailing: @Composable (() -> Unit)? = null,
) {
    Row(
        Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconCircle(Wise.ArrowLeft, stringResource(R.string.action_back), onBack)
        Spacer(Modifier.width(4.dp))
        Text(title, style = Type.ScreenTitle, color = Ink.Text, modifier = Modifier.weight(1f))
        trailing?.invoke()
    }
}

/** A 40dp tap target with no chrome until you touch it. */
@Composable
fun IconCircle(
    icon: ImageVector,
    description: String,
    onClick: () -> Unit,
    size: Dp = 40.dp,
    iconSize: Dp = 20.dp,
    tint: Color = Ink.Text,
    badge: Boolean = false,
) {
    Box(
        Modifier.size(size).clip(CircleShape).clickableNoRipple(onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, description, tint = tint, modifier = Modifier.size(iconSize))
        if (badge) {
            // Offset rather than aligned to a corner: the dot belongs to the
            // bell's shoulder, not to the tap target's edge.
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 7.dp, end = 8.dp)
                    .size(7.dp)
                    .background(Ink.Negative, CircleShape),
            )
        }
    }
}

/** A pill that seeds something rather than filtering it. */
@Composable
fun OutlineChip(label: String, onClick: () -> Unit) {
    Box(
        Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(Ink.Card, RoundedCornerShape(10.dp))
            .border(1.dp, Ink.Hairline, RoundedCornerShape(10.dp))
            .clickableNoRipple(onClick)
            .padding(horizontal = 13.dp, vertical = 8.dp),
    ) {
        Text(label, style = Type.Chip, color = Ink.Text)
    }
}

/** One of the feed's 全部 / 需要你 / 已完成 chips. Selected goes solid ink. */
@Composable
fun StateChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) Ink.Text else Ink.Card, RoundedCornerShape(10.dp))
            .then(
                if (selected) Modifier
                else Modifier.border(1.dp, Ink.Hairline, RoundedCornerShape(10.dp)),
            )
            .clickableNoRipple(onClick)
            .padding(horizontal = 13.dp, vertical = 7.dp),
    ) {
        Text(
            label,
            style = if (selected) Type.ChipStrong else Type.Chip,
            color = if (selected) Ink.OnDark else Ink.Text,
        )
    }
}

/** The uppercase group label above a card — "今天", "本月明细". */
@Composable
fun GroupLabel(text: String, trailing: String? = null, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.Bottom) {
        Text(text, style = Type.Label, color = Ink.Mute)
        if (trailing != null) {
            Spacer(Modifier.width(6.dp))
            Text(trailing, style = Type.Mono, color = Ink.Rim)
        }
    }
}

/**
 * A white card that groups rows, with hairlines between them and none at the
 * ends. Takes the rows as a list so it can place the dividers itself — every
 * caller otherwise gets it subtly wrong at the last row.
 */
@Composable
fun GroupedCard(modifier: Modifier = Modifier, rows: List<@Composable () -> Unit>) {
    WiseCard(modifier, radius = 16.dp) {
        rows.forEachIndexed { index, row ->
            if (index > 0) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                        .height(1.dp)
                        .background(Ink.Divider),
                )
            }
            row()
        }
    }
}

/** A row in the activity feed: status dot, two lines, and a right-hand column. */
@Composable
fun FeedRow(
    dot: Color,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    pulsing: Boolean = false,
    right: @Composable (ColumnScope.() -> Unit)? = null,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickableNoRipple(onClick)
            .padding(horizontal = 16.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (pulsing) PulsingDot(dot, size = 8.dp) else Box(Modifier.size(8.dp).background(dot, CircleShape))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = Type.RowTitle, color = Ink.Text, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (subtitle.isNotBlank()) {
                Text(subtitle, style = Type.RowSub, color = Ink.Mute, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (right != null) {
            Spacer(Modifier.width(10.dp))
            Column(horizontalAlignment = Alignment.End, content = right)
        }
    }
}

/** A settings-style row: label over a hint, a value, and a chevron. */
@Composable
fun SettingRow(
    title: String,
    subtitle: String? = null,
    value: String? = null,
    onClick: (() -> Unit)? = null,
    trailing: @Composable (() -> Unit)? = null,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickableNoRipple(onClick) else Modifier)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = Type.ListItem, color = Ink.Text)
            if (subtitle != null) Text(subtitle, style = Type.Fine, color = Ink.Mute)
        }
        if (value != null) {
            Spacer(Modifier.width(10.dp))
            Text(value, style = Type.Caption, color = Ink.Body)
        }
        trailing?.invoke()
        if (onClick != null && trailing == null) {
            Spacer(Modifier.width(8.dp))
            Icon(Wise.ChevronRight, null, tint = Ink.Mute, modifier = Modifier.size(14.dp))
        }
    }
}

/** The prototype's pill switch: ink when on, stone when off. */
@Composable
fun PillSwitch(on: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val offset by animateDpAsState(if (on) 19.dp else 3.dp, label = "knob")
    Box(
        modifier
            .size(width = 40.dp, height = 24.dp)
            .background(if (on) Ink.Text else Ink.Rim, PillShape)
            .clickableNoRipple(onClick),
    ) {
        Box(
            Modifier
                .padding(start = offset, top = 3.dp)
                .size(18.dp)
                .background(if (on) Ink.Lime else Ink.Card, CircleShape),
        )
    }
}
