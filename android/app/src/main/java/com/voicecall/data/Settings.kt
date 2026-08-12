package com.voicecall.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.voicecall.BuildConfig
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * Where the server is, and the session that proves who is asking.
 *
 * The address is fixed at build time — there is one deployment, and letting
 * someone retype it only ever produces a broken install. The token is the one
 * thing that varies: it arrives from signing in and is dropped on sign-out.
 */
data class ServerSettings(
    val baseUrl: String = BuildConfig.SERVER_URL,
    val apiToken: String = "",
) {
    val isSignedIn: Boolean get() = apiToken.isNotBlank()

    /** `https://host` with no trailing slash, or null if it is unusable. */
    fun normalisedBase(): String? {
        val trimmed = baseUrl.trim().trimEnd('/')
        if (trimmed.isEmpty()) return null
        val withScheme = if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            trimmed
        } else {
            "https://$trimmed"
        }
        return when {
            withScheme.startsWith("https://") -> withScheme
            // Debug builds may point at a dev server over plain HTTP so the app
            // can be exercised from an emulator against localhost. Release
            // builds reject cleartext outright, in the manifest and here.
            BuildConfig.DEBUG -> withScheme
            else -> null
        }
    }
}

private val Context.dataStore by preferencesDataStore(name = "voicecall-settings")

private val API_TOKEN = stringPreferencesKey("api_token")
private val LANGUAGE = stringPreferencesKey("language")
private val ONBOARDED = booleanPreferencesKey("onboarded")
private val PROFILE_PROMPTED = booleanPreferencesKey("profile_prompted")
private val COACH_SEEN = booleanPreferencesKey("coach_seen")

/**
 * The three things that only happen once. Read together because the route the
 * app opens on depends on all of them, and asking three separate flows would
 * make the first frame flicker through the wrong screen.
 *
 * All of them survive signing out: someone who has seen the carousel does not
 * want it again just because their session expired.
 */
data class FirstRun(
    val welcomeSeen: Boolean = false,
    /** The "who it calls for" step. Skipping counts as seen — it is offered once. */
    val profilePrompted: Boolean = false,
    val coachSeen: Boolean = false,
)

class SettingsStore(private val context: Context) {

    val settings: Flow<ServerSettings> = context.dataStore.data.map { prefs ->
        ServerSettings(apiToken = prefs[API_TOKEN].orEmpty())
    }

    /** Kept separate from the connection settings so it saves on its own tap. */
    val language: Flow<Language> = context.dataStore.data.map { Language.of(it[LANGUAGE]) }

    val firstRun: Flow<FirstRun> = context.dataStore.data.map { prefs ->
        FirstRun(
            welcomeSeen = prefs[ONBOARDED] ?: false,
            profilePrompted = prefs[PROFILE_PROMPTED] ?: false,
            coachSeen = prefs[COACH_SEEN] ?: false,
        )
    }

    suspend fun saveToken(token: String) {
        context.dataStore.edit { prefs -> prefs[API_TOKEN] = token.trim() }
    }

    suspend fun saveLanguage(language: Language) {
        context.dataStore.edit { prefs -> prefs[LANGUAGE] = language.id }
    }

    suspend fun markOnboarded() {
        context.dataStore.edit { prefs -> prefs[ONBOARDED] = true }
    }

    suspend fun markProfilePrompted() {
        context.dataStore.edit { prefs -> prefs[PROFILE_PROMPTED] = true }
    }

    suspend fun markCoachSeen() {
        context.dataStore.edit { prefs -> prefs[COACH_SEEN] = true }
    }
}
