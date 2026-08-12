package com.voicecall.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/**
 * A fixed light scheme in both system modes. The colours are load-bearing —
 * lime is the one action, amber is "you are needed", red ends a call — so
 * following the device's dark theme or its wallpaper would say the wrong thing.
 */
private val Scheme = lightColorScheme(
    primary = Ink.Lime,
    onPrimary = Ink.OnLime,
    secondary = Ink.Deep,
    onSecondary = Ink.OnDark,
    error = Ink.Negative,
    onError = Ink.OnDark,
    errorContainer = Ink.LimePale,
    onErrorContainer = Ink.NegativeDeep,
    background = Ink.Canvas,
    onBackground = Ink.Text,
    surface = Ink.Card,
    onSurface = Ink.Text,
    surfaceVariant = Ink.CardSoft,
    onSurfaceVariant = Ink.Body,
    outline = Ink.Outline,
    outlineVariant = Ink.Divider,
)

@Composable
fun SystemBars(dark: Boolean) {
    val view = LocalView.current
    if (view.isInEditMode) return
    SideEffect {
        val window = (view.context as Activity).window
        WindowCompat.getInsetsController(window, view).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }
}

/**
 * The live call is near-black edge to edge, so it flips the bar icons to light
 * for as long as it is on top — and puts them back on the way out, which a
 * SideEffect in the theme above would not do on its own.
 */
@Composable
fun DarkSystemBars() {
    val view = LocalView.current
    if (view.isInEditMode) return
    DisposableEffect(Unit) {
        val controller = WindowCompat.getInsetsController((view.context as Activity).window, view)
        controller.isAppearanceLightStatusBars = false
        controller.isAppearanceLightNavigationBars = false
        onDispose {
            controller.isAppearanceLightStatusBars = true
            controller.isAppearanceLightNavigationBars = true
        }
    }
}

@Composable
fun VoiceCallTheme(
    @Suppress("UNUSED_PARAMETER") darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    SystemBars(dark = false)
    MaterialTheme(colorScheme = Scheme, content = content)
}
