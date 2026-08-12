package com.voicecall.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import com.voicecall.R
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.Legal
import com.voicecall.ui.LinkText
import com.voicecall.ui.PillShape
import com.voicecall.ui.OutlineButton
import com.voicecall.ui.PrimaryButton
import com.voicecall.ui.Rule
import com.voicecall.ui.SignInState
import com.voicecall.ui.googleIdToken
import com.voicecall.ui.rememberHostActivity
import com.voicecall.ui.rememberLegalOpener
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import kotlinx.coroutines.launch

/**
 * The way in. Google first — it is one tap and no password to invent — with
 * email underneath it as the route that always works.
 *
 * The Google button is drawn only when the server has a client id configured
 * and says so: a button that cannot possibly succeed is worse than no button.
 */
@Composable
fun SignInScreen(vm: CallsViewModel, onUseEmail: () -> Unit) {
    val methods by vm.authMethods.collectAsState()
    val state by vm.signIn.collectAsState()

    LaunchedEffect(Unit) { vm.loadAuthMethods() }

    val activity = rememberHostActivity()
    val scope = rememberCoroutineScope()
    val busy = state is SignInState.Running
    val clientId = methods?.googleClientId.orEmpty()
    val googleUsable = methods?.googleUsable == true && activity != null

    val cancelled = stringResource(R.string.auth_google_cancelled)
    val noAccount = stringResource(R.string.auth_no_google_account)
    val failed = stringResource(R.string.auth_google_failed)

    fun startGoogle() {
        val host = activity ?: return
        vm.clearSignInError()
        scope.launch {
            try {
                vm.signInWithGoogle(googleIdToken(host, clientId))
            } catch (_: GetCredentialCancellationException) {
                // Backing out of the sheet is a decision, not an error.
                vm.clearSignInError()
            } catch (_: NoCredentialException) {
                vm.failSignIn(noAccount)
            } catch (e: Exception) {
                vm.failSignIn(failed.format(e.message ?: cancelled))
            }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(Ink.Card)
            .padding(top = statusBarPadding())
            .padding(
                start = 28.dp, end = 28.dp, top = 56.dp,
                bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + 24.dp,
            ),
    ) {
        // Carries the brand across from the welcome slides, so signing in reads
        // as the next step rather than a different app.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.height(18.dp),
                horizontalArrangement = Arrangement.spacedBy(1.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                listOf(8.dp, 16.dp, 10.dp).forEach { h ->
                    Box(Modifier.width(4.dp).height(h).background(Ink.Lime, PillShape))
                }
            }
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.app_name).uppercase(), style = Type.Label, color = Ink.Mute)
        }

        Spacer(Modifier.height(22.dp))
        Text(stringResource(R.string.auth_title), style = Type.Heading, color = Ink.Text)
        Spacer(Modifier.height(10.dp))
        Text(stringResource(R.string.auth_sub), style = Type.Body, color = Ink.Body)

        Spacer(Modifier.height(30.dp))

        if (googleUsable) {
            OutlineButton(
                label = stringResource(R.string.auth_google),
                onClick = ::startGoogle,
                enabled = !busy,
                height = 52.dp,
                modifier = Modifier.fillMaxWidth(),
                leading = { GoogleG() },
            )

            Row(
                Modifier.fillMaxWidth().padding(vertical = 22.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Rule(Ink.Hairline, Modifier.weight(1f))
                Text(
                    stringResource(R.string.auth_or_email),
                    style = Type.Fine,
                    color = Ink.Mute,
                    modifier = Modifier.padding(horizontal = 12.dp),
                )
                Rule(Ink.Hairline, Modifier.weight(1f))
            }
        }

        PrimaryButton(
            label = stringResource(R.string.auth_email_button),
            onClick = onUseEmail,
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        )

        if (busy) {
            Spacer(Modifier.height(20.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                CircularProgressIndicator(color = Ink.Text, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
            }
        }

        (state as? SignInState.Failed)?.let {
            Spacer(Modifier.height(20.dp))
            Text(it.reason, style = Type.Caption, color = Ink.NegativeDeep, textAlign = TextAlign.Center)
        }

        Spacer(Modifier.weight(1f))

        // Consent sits on the button that gives it, not buried in Settings.
        val openLegal = rememberLegalOpener()
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                stringResource(R.string.auth_consent),
                style = Type.Fine,
                color = Ink.Mute,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                LinkText(
                    stringResource(R.string.legal_terms),
                    { openLegal(Legal.TERMS) },
                    style = Type.Fine.copy(fontWeight = FontWeight.SemiBold),
                )
                Text(" · ", style = Type.Fine, color = Ink.Mute)
                LinkText(
                    stringResource(R.string.legal_privacy),
                    { openLegal(Legal.PRIVACY) },
                    style = Type.Fine.copy(fontWeight = FontWeight.SemiBold),
                )
            }
        }
    }
}

/** Google's own letter, in their blue — the one mark that has to be theirs. */
@Composable
private fun GoogleG() {
    Box(Modifier.size(20.dp), contentAlignment = Alignment.Center) {
        Text("G", style = Type.Button.copy(fontSize = Type.Amount.fontSize), color = Ink.Google)
    }
}
