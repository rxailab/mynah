package com.voicecall.data

import android.content.Context
import android.content.res.Configuration
import java.util.Locale

/**
 * Which language the app's own text is in. Deliberately separate from the
 * language the assistant speaks on a call: that has to match whoever is being
 * rung, not whoever is holding the phone.
 */
enum class Language(val id: String, private val tag: String?) {
    SYSTEM("system", null),
    ENGLISH("en", "en"),
    CHINESE("zh", "zh-CN");

    val locale: Locale? get() = tag?.let(Locale::forLanguageTag)

    companion object {
        fun of(id: String?) = entries.firstOrNull { it.id == id } ?: SYSTEM
    }
}

/**
 * A context whose resources resolve in [language]. Compose reads strings
 * through LocalContext, so providing one of these overrides the whole tree
 * without recreating the activity; the view model and API client use the same
 * helper because they raise messages from outside Compose, where
 * `stringResource` is not available.
 */
fun Context.localisedFor(language: Language): Context {
    val locale = language.locale ?: return this
    val config = Configuration(resources.configuration).apply {
        setLocale(locale)
        setLayoutDirection(locale)
    }
    return createConfigurationContext(config)
}

/** Resolves string resources in whatever language is currently selected. */
class Strings(private val app: Context, private val language: () -> Language) {
    operator fun get(id: Int, vararg args: Any): String =
        app.localisedFor(language()).getString(id, *args)
}
