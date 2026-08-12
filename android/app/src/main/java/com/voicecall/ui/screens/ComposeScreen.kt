package com.voicecall.ui.screens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.voicecall.R
import com.voicecall.data.Brief
import com.voicecall.ui.clickableNoRipple
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.CoachTargets
import com.voicecall.ui.ErrorCard
import com.voicecall.ui.OutlineChip
import com.voicecall.ui.ParseState
import com.voicecall.ui.PrimaryButton
import com.voicecall.ui.PulseRings
import com.voicecall.ui.ScreenHeader
import com.voicecall.ui.Waveform
import com.voicecall.ui.WiseCard
import com.voicecall.ui.navBarPadding
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import com.voicecall.ui.theme.Wise

/**
 * Say what needs doing, in one sentence.
 *
 * This used to be the home screen. In the redesign home is the feed of what the
 * assistant has been doing, and composing a call is a thing you go and do — so
 * the composer moved here, behind the bar at the foot of the feed.
 *
 * Nothing is dialled from here: the sentence goes to the server to be turned
 * into a brief, and the brief is checked on the next screen before anything
 * rings.
 *
 * @param seed text to start with, from a template or a saved business.
 * @param onCoachTargets measured here, drawn by the app shell. The first-run
 *   tour is about the composer, so it followed the composer to this screen.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ComposeScreen(
    vm: CallsViewModel,
    onBack: () -> Unit,
    onParsed: () -> Unit,
    seed: String? = null,
    onVerifyNumber: () -> Unit = {},
    onCoachTargets: (CoachTargets) -> Unit = {},
) {
    val state by vm.uiState.collectAsState()
    val parse by vm.parse.collectAsState()
    val pendingSeed by vm.composerSeed.collectAsState()
    var text by remember { mutableStateOf(seed.orEmpty()) }

    // A template or a saved business left something for us. Taken once and
    // cleared, so coming back to this screen does not retype it over an edit.
    LaunchedEffect(pendingSeed) {
        pendingSeed?.let {
            text = it
            vm.clearComposerSeed()
        }
    }

    // A parse that succeeds moves on; the confirm screen reads the same state.
    // Guarded, because coming back from Confirm recomposes this while the state
    // is still Ready — without it you bounce straight forward again.
    var navigatedFor by remember { mutableStateOf<Brief?>(null) }
    LaunchedEffect(parse) {
        val ready = (parse as? ParseState.Ready)?.brief
        if (ready == null) {
            navigatedFor = null
        } else if (ready != navigatedFor) {
            navigatedFor = ready
            onParsed()
        }
    }

    // --- press-and-hold dictation ------------------------------------------
    val context = LocalContext.current
    val recognitionAvailable = remember { SpeechRecognizer.isRecognitionAvailable(context) }
    var listening by remember { mutableStateOf(false) }
    var dictationBase by remember { mutableStateOf("") }
    val currentText by rememberUpdatedState(text)
    val speechLocale = LocalConfiguration.current.locales[0]

    val recognizer = remember(recognitionAvailable) {
        if (recognitionAvailable) SpeechRecognizer.createSpeechRecognizer(context) else null
    }
    DisposableEffect(recognizer) {
        recognizer?.setRecognitionListener(object : RecognitionListener {
            private fun merge(results: Bundle?) {
                val heard = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull() ?: return
                text = (dictationBase + heard).trimStart()
            }
            override fun onPartialResults(partialResults: Bundle?) = merge(partialResults)
            override fun onResults(results: Bundle?) { merge(results); listening = false }
            override fun onError(error: Int) { listening = false }
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        onDispose { recognizer?.destroy() }
    }

    fun beginDictation() {
        dictationBase = if (currentText.isBlank()) "" else currentText.trimEnd() + " "
        recognizer?.startListening(
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, speechLocale.toLanguageTag())
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            },
        )
        listening = true
    }

    val askMic = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) beginDictation()
    }

    val parsing = parse is ParseState.Running
    val canParse = text.trim().length >= 5 && !parsing

    // Calls go out under your own number or not at all, so there is no point
    // letting someone write a brief the server will refuse to dial. Said here,
    // at the top, rather than as an error after they have done the work.
    val profile by vm.profile.collectAsState()
    val blocked = profile != null && !profile!!.canCall

    // Reported as a set so the overlay never sees a half-measured screen.
    var targets by remember { mutableStateOf(CoachTargets()) }
    fun report(update: CoachTargets.() -> CoachTargets) {
        targets = targets.update()
        onCoachTargets(targets)
    }

    Column(
        Modifier
            .fillMaxSize()
            .imePadding()
            .padding(top = statusBarPadding(), bottom = navBarPadding()),
    ) {
        ScreenHeader(title = stringResource(R.string.compose_title), onBack = onBack)

        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, top = 14.dp),
        ) {
            if (blocked) {
                VerifyFirstCard(onVerify = onVerifyNumber)
                Spacer(Modifier.height(14.dp))
            }

            WiseCard(
                modifier = Modifier.onGloballyPositioned {
                    report { copy(composer = it.boundsInWindow()) }
                },
                radius = 16.dp,
            ) {
                Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 12.dp)) {
                    Box {
                        if (text.isEmpty()) {
                            Text(
                                stringResource(R.string.home_placeholder),
                                style = Type.Body,
                                color = Ink.Mute,
                            )
                        }
                        BasicTextField(
                            value = text,
                            onValueChange = { text = it; if (parse !is ParseState.Idle) vm.clearParse() },
                            textStyle = Type.Body.copy(color = Ink.Text),
                            cursorBrush = SolidColor(Ink.Text),
                            modifier = Modifier.fillMaxWidth().heightIn(min = 96.dp),
                        )
                    }

                    Spacer(Modifier.height(8.dp))
                    Box(Modifier.fillMaxWidth().height(1.dp).background(Ink.Divider))
                    Spacer(Modifier.height(8.dp))

                    // The promise and the microphone share a line: the reason to
                    // keep talking sits right next to the way to do it.
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        if (listening) {
                            Waveform(Modifier.height(13.dp), barCount = 4, periodMs = 900, staggerMs = 150)
                            Spacer(Modifier.width(9.dp))
                            Text(
                                stringResource(R.string.mic_release),
                                style = Type.Tiny,
                                color = Ink.Deep,
                                modifier = Modifier.weight(1f),
                            )
                        } else {
                            Text(
                                stringResource(R.string.compose_no_guessing),
                                style = Type.Tiny,
                                color = Ink.Mute,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        if (recognitionAvailable) {
                            Spacer(Modifier.width(10.dp))
                            Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) {
                                if (listening) PulseRings(Modifier.size(40.dp), periodMs = 1400)
                                Box(
                                    Modifier
                                        .size(36.dp)
                                        .onGloballyPositioned { report { copy(mic = it.boundsInWindow()) } }
                                        .background(if (listening) Ink.Lime else Ink.CanvasSoft, CircleShape)
                                        .pointerInput(Unit) {
                                            detectTapGestures(onPress = {
                                                val granted = ContextCompat.checkSelfPermission(
                                                    context, Manifest.permission.RECORD_AUDIO,
                                                ) == PackageManager.PERMISSION_GRANTED
                                                if (granted) {
                                                    beginDictation()
                                                    tryAwaitRelease()
                                                    recognizer?.stopListening()
                                                } else {
                                                    askMic.launch(Manifest.permission.RECORD_AUDIO)
                                                    tryAwaitRelease()
                                                }
                                            })
                                        },
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(
                                        Wise.Mic,
                                        stringResource(R.string.mic_hold),
                                        tint = Ink.Text,
                                        modifier = Modifier.size(17.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(7.dp),
                verticalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                val ex1 = stringResource(R.string.home_example_1)
                val ex2 = stringResource(R.string.home_example_2)
                OutlineChip(ex1) { text = ex1 }
                OutlineChip(ex2) { text = ex2 }
            }

            (parse as? ParseState.Failed)?.let {
                Spacer(Modifier.height(14.dp))
                ErrorCard(it.reason, vm::clearParse)
            }
            state.error?.let {
                Spacer(Modifier.height(14.dp))
                ErrorCard(it, vm::clearError)
            }

            Spacer(Modifier.height(24.dp))
        }

        Box(Modifier.padding(start = 20.dp, end = 20.dp, bottom = 24.dp)) {
            PrimaryButton(
                label = stringResource(if (parsing) R.string.action_parsing else R.string.action_next_check),
                onClick = { vm.parseRequest(text.trim()) },
                enabled = canParse && !blocked,
                modifier = Modifier
                    .fillMaxWidth()
                    .onGloballyPositioned { report { copy(action = it.boundsInWindow()) } },
                leading = if (parsing) {
                    {
                        CircularProgressIndicator(
                            color = Ink.OnLime,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(15.dp),
                        )
                    }
                } else null,
            )
        }
    }
}

/**
 * Shown when the account has no verified number.
 *
 * Amber rather than red: nothing has gone wrong, there is simply a step missing,
 * and it explains why the step exists rather than just demanding it. Under this
 * design there is no shared number to fall back on — a business rung by the
 * assistant has to be able to ring back and reach a person.
 */
@Composable
private fun VerifyFirstCard(onVerify: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(Ink.Warning, RoundedCornerShape(16.dp))
            .padding(16.dp),
    ) {
        Text(
            stringResource(R.string.compose_needs_callerid_title),
            style = Type.RowTitle,
            color = Ink.WarningInk,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            stringResource(R.string.compose_needs_callerid_body),
            style = Type.RowSub,
            color = Ink.WarningInk,
        )
        Spacer(Modifier.height(12.dp))
        Box(
            Modifier
                .border(1.5.dp, Ink.WarningInk, RoundedCornerShape(10.dp))
                .clickableNoRipple(onVerify)
                .padding(horizontal = 14.dp, vertical = 8.dp),
        ) {
            Text(
                stringResource(R.string.callerid_start),
                style = Type.ChipStrong,
                color = Ink.WarningInk,
            )
        }
    }
}
