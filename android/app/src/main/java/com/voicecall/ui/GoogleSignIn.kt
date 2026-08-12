package com.voicecall.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalView
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

/**
 * Google sign-in, as far as this app is concerned: hand Credential Manager the
 * server's client id, get an ID token back, and let the server decide whether
 * it means anything. Nothing here establishes identity — the token is verified
 * against Google on the other end.
 */

/**
 * The activity to hang the credential sheet on.
 *
 * `LocalContext` is no good for this: the whole tree is wrapped in a
 * configuration context for the language override, and `createConfigurationContext`
 * returns a context that neither is an Activity nor unwraps to one. The view's
 * context is the one the activity created.
 */
@Composable
fun rememberHostActivity(): Activity? {
    val view = LocalView.current
    return remember(view) { view.context.findActivity() }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

/** Raised when Google answered, but not with something we can use. */
class GoogleSignInFailed(message: String) : Exception(message)

/**
 * @param serverClientId the *Web* OAuth client id, which is what the ID token's
 *   audience will be set to — the same value the server compares it against.
 * @throws androidx.credentials.exceptions.GetCredentialCancellationException if
 *   the person dismissed the sheet, which is not a failure worth reporting.
 */
suspend fun googleIdToken(activity: Activity, serverClientId: String): String {
    val request = GetCredentialRequest.Builder()
        .addCredentialOption(GetSignInWithGoogleOption.Builder(serverClientId).build())
        .build()

    val credential = CredentialManager.create(activity)
        .getCredential(activity, request)
        .credential

    if (credential !is CustomCredential ||
        credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
    ) {
        throw GoogleSignInFailed("Unexpected credential type ${credential.type}.")
    }

    return GoogleIdTokenCredential.createFrom(credential.data).idToken
}
