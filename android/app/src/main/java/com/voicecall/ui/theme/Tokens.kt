package com.voicecall.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.voicecall.R

/**
 * The Wise-inspired design: near-black ink at heavy weights, one vivid lime
 * accent, and white rounded cards on a sage canvas. Nothing is translucent and
 * nothing is blurred — the hierarchy comes from weight and space.
 *
 * Fixed rather than following the device: lime means "this is the action",
 * amber means "you are needed", red ends a call. A wallpaper accent would
 * overwrite meaning with decoration.
 */
object Ink {
    /** The action colour. Everything important is this or sits on it. */
    val Lime = Color(0xFF9FE870)
    val LimeActive = Color(0xFFCDFFAD)
    val LimeNeutral = Color(0xFFC5EDAB)
    /** The wash behind a lime-tinted panel. */
    val LimePale = Color(0xFFE2F6D5)

    /** Near-black. Headlines, the live screen, the account card. */
    val Text = Color(0xFF0E0F0C)
    /** The green-black used for links and text on lime. */
    val Deep = Color(0xFF163300)
    val Body = Color(0xFF454745)
    val Mute = Color(0xFF868685)

    val Card = Color(0xFFFFFFFF)
    /** The page behind the cards. */
    val Canvas = Color(0xFFE8EBE6)
    /** A pressed or hovered row inside a card. */
    val CardSoft = Color(0xFFF8FAF6)
    val Divider = Color(0xFFEEF0EA)
    val Hairline = Color(0x1A0E0F0C)
    val Outline = Color(0xFF0E0F0C)
    /** The ring on an unselected control: a code box, a carousel dot. */
    val Rim = Color(0xFFC9CDC5)
    /** The same idea one step softer — an unselected radio. */
    val RimSoft = Color(0xFFB8BCB4)
    /** A disabled pill, and the rule between transcript lines. */
    val CanvasSoft = Color(0xFFF2F4EF)

    val Positive = Color(0xFF2EAD4B)
    val PositiveDeep = Color(0xFF054D28)
    val Warning = Color(0xFFFFD11A)
    val WarningDeep = Color(0xFFB86700)
    /** Text on the amber badge — amber is far too bright to carry white. */
    val WarningInk = Color(0xFF4A3B1C)
    val Negative = Color(0xFFD03238)
    val NegativeDeep = Color(0xFFA72027)
    val NegativeWash = Color(0xFFFBE4E5)

    /** Google's blue, for the one button that has to look like theirs. */
    val Google = Color(0xFF4285F4)

    val OnLime = Color(0xFF0E0F0C)
    val OnDark = Color(0xFFFFFFFF)
    /** Muted text and hairlines on the dark live screen. */
    val OnDarkMute = Color(0xFF868685)

    /** Body text on the black live card — lighter than Mute so a whole line of
     *  transcript stays readable against it. */
    val OnDarkBody = Color(0xFFB9BAB6)
    val OnDarkWash = Color(0x17FFFFFF)
    val OnDarkRim = Color(0x4DFFFFFF)
    /** The other party's bubble on the live screen. */
    val OnDarkBubble = Color(0xFF2A2A28)
}

val Inter = FontFamily(
    Font(R.font.inter_400, FontWeight.Normal),
    Font(R.font.inter_500, FontWeight.Medium),
    Font(R.font.inter_600, FontWeight.SemiBold),
    Font(R.font.inter_700, FontWeight.Bold),
    Font(R.font.inter_800, FontWeight.ExtraBold),
    Font(R.font.inter_900, FontWeight.Black),
)

val RobotoMono = FontFamily(
    Font(R.font.roboto_mono_light, FontWeight.Light),
    Font(R.font.roboto_mono_regular, FontWeight.Normal),
    Font(R.font.roboto_mono_medium, FontWeight.Medium),
)

private fun inter(weight: FontWeight, size: Double, line: Double, tracking: Double = 0.0) = TextStyle(
    fontFamily = Inter,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = line.sp,
    letterSpacing = tracking.sp,
)

/** Every type style in the design. Sizes come straight from the prototype. */
object Type {
    /** The one heavy voice: screen titles and onboarding headlines. */
    val Display = inter(FontWeight.Black, 40.0, 41.0, -0.5)
    val Title = inter(FontWeight.Black, 30.0, 34.0, -0.5)
    val Heading = inter(FontWeight.Black, 28.0, 31.0, -0.4)
    val Result = inter(FontWeight.Black, 27.0, 32.0, -0.4)

    /** The title on a pushed screen — one step down from a tab's own title. */
    val Pushed = inter(FontWeight.Black, 24.0, 28.0, -0.3)

    /** A card's own heading, and the title in a step header. */
    val Section = inter(FontWeight.ExtraBold, 19.0, 24.0, -0.2)
    val Amount = inter(FontWeight.ExtraBold, 21.0, 26.0, -0.3)
    val CallName = inter(FontWeight.ExtraBold, 21.0, 26.0, -0.2)

    /** The title on a screen pushed over the feed — smaller than a step header. */
    val ScreenTitle = inter(FontWeight.Bold, 16.5, 22.0, -0.2)

    /** The wordmark in the feed's top bar. */
    val Wordmark = inter(FontWeight.ExtraBold, 15.0, 20.0, -0.2)

    /** A row in the activity feed: title over a quieter second line. */
    val RowTitle = inter(FontWeight.SemiBold, 14.0, 19.0)
    val RowSub = inter(FontWeight.Normal, 12.5, 17.0)

    /** A row in a list: the name line. */
    val ListTitle = inter(FontWeight.Bold, 15.5, 20.0, -0.1)
    val ListItem = inter(FontWeight.Medium, 15.5, 20.0)
    val Value = inter(FontWeight.Bold, 15.0, 20.0)

    val Body = inter(FontWeight.Normal, 15.0, 22.0)
    val BodyLarge = inter(FontWeight.Normal, 16.0, 24.0)
    val Sub = inter(FontWeight.Normal, 14.0, 21.0)
    val Caption = inter(FontWeight.Normal, 13.0, 19.0)
    val Fine = inter(FontWeight.Normal, 12.0, 18.0)
    val Tiny = inter(FontWeight.Normal, 11.0, 16.0)

    /** Wide-tracked uppercase labels above a card or a group. */
    val Label = inter(FontWeight.Bold, 12.0, 16.0, 0.7)
    val LabelSmall = inter(FontWeight.Bold, 11.0, 15.0, 0.66)

    val Button = inter(FontWeight.Bold, 16.0, 20.0)
    val ButtonSmall = inter(FontWeight.Bold, 14.0, 18.0)
    val Chip = inter(FontWeight.SemiBold, 13.0, 17.0)
    /** The chip that carries a state rather than an action — a filter, a step. */
    val ChipStrong = inter(FontWeight.Bold, 13.0, 17.0)
    val NavLabel = inter(FontWeight.Bold, 11.0, 14.0)
    /** The status badge on a call. */
    val Badge = inter(FontWeight.Bold, 12.0, 16.0)
    /** The dial pad under the code boxes. */
    val Keypad = inter(FontWeight.SemiBold, 22.0, 26.0)
    /** An underlined text link, in the deep green. */
    val Link = inter(FontWeight.SemiBold, 15.0, 20.0)
    val LinkSmall = inter(FontWeight.SemiBold, 14.0, 18.0)

    /** The bubble on the live screen. */
    val Bubble = inter(FontWeight.Normal, 14.5, 21.0)
    val BubbleTranslation = inter(FontWeight.Normal, 12.5, 18.0)
    val Speaker = inter(FontWeight.Bold, 11.0, 15.0)

    /** Times, phone numbers and money — the things that must not reflow. */
    val Mono = TextStyle(
        fontFamily = RobotoMono, fontWeight = FontWeight.Normal,
        fontSize = 12.sp, lineHeight = 17.sp,
    )
    val MonoBody = TextStyle(
        fontFamily = RobotoMono, fontWeight = FontWeight.Normal,
        fontSize = 13.sp, lineHeight = 19.sp,
    )
    /** The OTP boxes. */
    val Code = inter(FontWeight.ExtraBold, 24.0, 28.0)
}
