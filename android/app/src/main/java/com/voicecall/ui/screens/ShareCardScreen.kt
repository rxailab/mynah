package com.voicecall.ui.screens

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.provider.MediaStore
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.drawscope.draw
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.voicecall.R
import com.voicecall.data.Call
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.OutlineButton
import com.voicecall.ui.PrimaryButton
import com.voicecall.ui.ScreenHeader
import com.voicecall.ui.navBarPadding
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import kotlinx.coroutines.launch
import java.io.File
import java.util.Calendar

/**
 * The result of a call as a picture worth sending to somebody.
 *
 * What is deliberately not in it: the phone number and the transcript. A card
 * shared into a group chat is out of the sharer's hands the moment it lands,
 * and the transcript is a recording of a stranger at work — it belongs to the
 * person who placed the call, not to whoever they show the good news to. So the
 * card carries the outcome and the facts the assistant wrote down, and nothing
 * that identifies the line it happened on. The caption says so, because a
 * promise nobody can see is not one anybody can rely on.
 *
 * Rendered by drawing the same composable into a graphics layer, so the image
 * is the card on screen rather than a second implementation of it that could
 * drift.
 */
@Composable
fun ShareCardScreen(vm: CallsViewModel, callId: String, onBack: () -> Unit) {
    val state by vm.uiState.collectAsState()
    val call = state.calls.firstOrNull { it.id == callId }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val graphicsLayer = rememberGraphicsLayer()

    var notice by remember { mutableStateOf<String?>(null) }
    val savedLabel = stringResource(R.string.share_saved)
    val failedLabel = stringResource(R.string.share_failed)

    // Gone from the list (process death, or a cleared history) — nothing to share.
    if (call == null) {
        LaunchedEffect(Unit) { onBack() }
        return
    }

    /** Draws the card as it stands and hands back a PNG on disk. */
    suspend fun render(): Bitmap? = runCatching {
        graphicsLayer.toImageBitmap().asAndroidBitmap()
    }.getOrNull()

    Column(
        Modifier
            .fillMaxSize()
            .padding(top = statusBarPadding(), bottom = navBarPadding()),
    ) {
        ScreenHeader(title = stringResource(R.string.share_title), onBack = onBack)

        Column(
            Modifier
                .weight(1f)
                .padding(20.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                Modifier.drawWithContent {
                    // Recorded on every draw, so whatever is on screen is what
                    // gets shared — no second copy of the layout to keep in step.
                    graphicsLayer.record { this@drawWithContent.drawContent() }
                    drawLayer(graphicsLayer)
                },
            ) {
                ShareCard(call)
            }

            Spacer(Modifier.height(12.dp))
            Text(
                notice ?: stringResource(R.string.share_no_number),
                style = Type.Fine,
                color = if (notice != null) Ink.PositiveDeep else Ink.Mute,
                textAlign = TextAlign.Center,
            )
        }

        Column(
            Modifier.padding(start = 20.dp, end = 20.dp, bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            PrimaryButton(
                label = stringResource(R.string.share_image),
                onClick = {
                    scope.launch {
                        val bitmap = render()
                        notice = if (bitmap != null && shareImage(context, bitmap)) null else failedLabel
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlineButton(
                label = stringResource(R.string.share_save),
                onClick = {
                    scope.launch {
                        val bitmap = render()
                        notice = if (bitmap != null && saveToPhotos(context, bitmap)) savedLabel else failedLabel
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/** The home screen's live card, holding a finished result instead. */
@Composable
private fun ShareCard(call: Call) {
    Column(
        Modifier
            .width(320.dp)
            .background(Ink.Text, RoundedCornerShape(24.dp))
            .padding(22.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(horizontalArrangement = Arrangement.spacedBy(1.dp)) {
                listOf(8, 16, 10).forEach { tall ->
                    Box(Modifier.width(4.dp).height(tall.dp).background(Ink.Lime, CircleShape))
                }
            }
            Spacer(Modifier.width(8.dp))
            Text("Mynah", style = Type.ListTitle, color = Ink.OnDark)
            Spacer(Modifier.weight(1f))
            if (call.outcome != null) {
                Box(
                    Modifier
                        .background(Ink.OnDarkWash, CircleShape)
                        .padding(horizontal = 11.dp, vertical = 5.dp),
                ) {
                    Text(
                        stringResource(R.string.status_done),
                        style = Type.LabelSmall,
                        color = Ink.Lime,
                    )
                }
            }
        }

        Spacer(Modifier.height(16.dp))
        Text(
            call.summary.orEmpty().ifBlank { call.goal },
            style = Type.Title,
            color = Ink.OnDark,
        )
        Spacer(Modifier.height(6.dp))
        // The business and the date — never the number it was reached on.
        Text(
            listOfNotNull(
                call.businessName.takeIf { it.isNotBlank() },
                shortDay(call.createdAt),
            ).joinToString(" · "),
            style = Type.Fine,
            color = Ink.OnDarkMute,
        )

        if (call.results.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            Box(Modifier.fillMaxWidth().height(1.dp).background(Ink.OnDarkWash))
            Spacer(Modifier.height(16.dp))
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                call.results.entries.take(5).forEach { (key, value) ->
                    Row {
                        Text(
                            key.replace('_', ' '),
                            style = Type.Caption,
                            color = Ink.OnDarkMute,
                            modifier = Modifier.weight(1f),
                        )
                        Spacer(Modifier.width(12.dp))
                        Text(value, style = Type.Caption, color = Ink.OnDark)
                    }
                }
            }
        }

        Spacer(Modifier.height(18.dp))
        Text(stringResource(R.string.share_card_footer), style = Type.Tiny, color = Ink.Lime)
    }
}

/**
 * Hands the image to the system share sheet. The sheet is where the person
 * picks who gets it — this only ever offers, and the grant covers the one file.
 */
private fun shareImage(context: Context, bitmap: Bitmap): Boolean = runCatching {
    val dir = File(context.cacheDir, "shared").apply { mkdirs() }
    // One name, overwritten each time: the cache should not fill up with every
    // card anyone ever looked at.
    val file = File(dir, "mynah-result.png")
    file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }

    val uri = FileProvider.getUriForFile(context, "${context.packageName}.shares", file)
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "image/png"
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(send, null))
    true
}.getOrDefault(false)

/** Into the photo library, via MediaStore so no storage permission is needed. */
private fun saveToPhotos(context: Context, bitmap: Bitmap): Boolean = runCatching {
    val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, "mynah-${System.currentTimeMillis()}.png")
        put(MediaStore.Images.Media.MIME_TYPE, "image/png")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Mynah")
        }
    }
    val uri = context.contentResolver
        .insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
        ?: return false
    context.contentResolver.openOutputStream(uri)?.use {
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
    } ?: return false
    true
}.getOrDefault(false)

private fun shortDay(at: Long): String = Calendar.getInstance().apply { timeInMillis = at }.let {
    "%d/%d".format(it.get(Calendar.MONTH) + 1, it.get(Calendar.DAY_OF_MONTH))
}
