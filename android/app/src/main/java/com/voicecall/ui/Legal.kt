package com.voicecall.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import com.voicecall.BuildConfig

/**
 * The published terms and privacy policy.
 *
 * They live on the server rather than in the APK for two reasons: a store
 * listing has to link to the privacy policy at a public URL, and a correction
 * has to reach people who are not going to install an update to read it.
 */
object Legal {
    const val TERMS = "terms"
    const val PRIVACY = "privacy"
}

/**
 * Opens one of the documents in the browser, in whichever language the app is
 * currently showing.
 *
 * Returns a callback rather than doing the work, because every caller is a
 * click handler and the language has to be read during composition.
 */
@Composable
fun rememberLegalOpener(): (String) -> Unit {
    val context = LocalContext.current
    val chinese = LocalConfiguration.current.locales[0].language == "zh"
    return { document -> openLegal(context, document, chinese) }
}

private fun openLegal(context: Context, document: String, chinese: Boolean) {
    val url = "${BuildConfig.SERVER_URL}/legal/$document?lang=${if (chinese) "zh" else "en"}"
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        // LocalContext here is a configuration wrapper, not an activity, so the
        // browser needs a task of its own to start in.
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(intent)
    } catch (_: ActivityNotFoundException) {
        // A device with no browser at all. Nothing useful to say about it.
    }
}
