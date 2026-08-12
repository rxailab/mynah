package com.voicecall.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.voicecall.R
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.FieldShape
import com.voicecall.ui.LinkText
import com.voicecall.ui.NavIcon
import com.voicecall.ui.PrimaryButton
import com.voicecall.ui.Rule
import com.voicecall.ui.SignInState
import com.voicecall.ui.clickableNoRipple
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import com.voicecall.ui.theme.Wise

private val EMAIL = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")

/** The server's own rule, checked here so the one button can mean two things. */
private const val MIN_PASSWORD = 8

/**
 * One pair of fields for both signing up and signing in. The server cannot say
 * whether an address exists without leaking that it does, so the app does not
 * ask: it tries to register, and a rejected address means this is someone
 * coming back.
 */
@Composable
fun EmailSignInScreen(vm: CallsViewModel, onBack: () -> Unit, onForgot: () -> Unit = {}) {
    val state by vm.signIn.collectAsState()
    val methods by vm.authMethods.collectAsState()

    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var visible by remember { mutableStateOf(false) }

    val emailValid = EMAIL.matches(email.trim())
    val passwordValid = password.length >= MIN_PASSWORD
    val busy = state is SignInState.Running
    val canContinue = emailValid && passwordValid && !busy

    fun edited() { if (state is SignInState.Failed) vm.clearSignInError() }

    Column(
        Modifier
            .fillMaxSize()
            .background(Ink.Card)
            .imePadding()
            .padding(top = statusBarPadding())
            .padding(
                start = 28.dp, end = 28.dp, top = 16.dp,
                bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + 24.dp,
            ),
    ) {
        NavIcon(Wise.ArrowLeft, stringResource(R.string.action_back), onBack)

        Spacer(Modifier.height(18.dp))
        Text(stringResource(R.string.email_title), style = Type.Heading, color = Ink.Text)
        Spacer(Modifier.height(10.dp))
        Text(stringResource(R.string.email_sub), style = Type.Body, color = Ink.Body)

        // One box, one rule between the two rows — the prototype's joined field.
        Spacer(Modifier.height(26.dp))
        Column(
            Modifier
                .fillMaxWidth()
                .background(Ink.Card, FieldShape)
                .border(1.dp, Ink.Outline, FieldShape),
        ) {
            Box(Modifier.padding(horizontal = 16.dp, vertical = 15.dp)) {
                if (email.isEmpty()) {
                    Text(stringResource(R.string.field_email), style = Type.BodyLarge, color = Ink.Mute)
                }
                BasicTextField(
                    value = email,
                    onValueChange = { email = it; edited() },
                    textStyle = Type.BodyLarge.copy(color = Ink.Text),
                    cursorBrush = SolidColor(Ink.Text),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Email,
                        capitalization = KeyboardCapitalization.None,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Rule(Ink.Hairline)
            Row(
                Modifier.padding(horizontal = 16.dp, vertical = 15.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.weight(1f)) {
                    if (password.isEmpty()) {
                        Text(stringResource(R.string.field_password), style = Type.BodyLarge, color = Ink.Mute)
                    }
                    BasicTextField(
                        value = password,
                        onValueChange = { password = it; edited() },
                        textStyle = Type.BodyLarge.copy(color = Ink.Text),
                        cursorBrush = SolidColor(Ink.Text),
                        singleLine = true,
                        visualTransformation =
                            if (visible) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            capitalization = KeyboardCapitalization.None,
                        ),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Spacer(Modifier.width(12.dp))
                Icon(
                    if (visible) Wise.EyeOff else Wise.Eye,
                    stringResource(if (visible) R.string.action_hide_password else R.string.action_show_password),
                    tint = Ink.Mute,
                    modifier = Modifier.size(19.dp).clickableNoRipple { visible = !visible },
                )
            }
        }

        // The rule and the way out share a line. "Forgot password?" only
        // appears when the server can actually send a code — without a mail
        // provider it leads nowhere, and a dead end is worse than no link.
        Spacer(Modifier.height(10.dp))
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(
                    if (email.isNotEmpty() && !emailValid) R.string.email_bad_address
                    else R.string.email_password_rule,
                ),
                style = Type.Fine,
                color = if (email.isNotEmpty() && !emailValid) Ink.WarningDeep else Ink.Mute,
                modifier = Modifier.weight(1f),
            )
            if (methods?.passwordReset == true) {
                Spacer(Modifier.width(12.dp))
                // Sends the code from here rather than on the next screen, so
                // the address it goes to is the one on this form and nobody has
                // to type it twice. Inert until that address is a real one —
                // shown greyed rather than hidden, because a link that comes
                // and goes as you type is worse than one that waits.
                LinkText(
                    stringResource(R.string.password_forgot),
                    onClick = { if (emailValid) vm.sendResetCode(email) { onForgot() } },
                    style = Type.LinkSmall,
                    colour = if (emailValid) Ink.Deep else Ink.Rim,
                )
            }
        }

        (state as? SignInState.Failed)?.let {
            Spacer(Modifier.height(14.dp))
            Text(
                it.reason,
                style = Type.Caption,
                color = Ink.NegativeDeep,
                modifier = Modifier.padding(horizontal = 4.dp),
            )
        }

        Spacer(Modifier.weight(1f))

        PrimaryButton(
            label = stringResource(if (busy) R.string.action_signing_in else R.string.action_continue),
            onClick = { vm.signInWithEmail(email, password) },
            enabled = canContinue,
            modifier = Modifier.fillMaxWidth(),
            leading = if (busy) {
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
