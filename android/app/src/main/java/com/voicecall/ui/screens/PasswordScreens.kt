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
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
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

/** The server's own rule, checked here so the button can be honest about it. */
private const val MIN_PASSWORD = 8
private const val CODE_LENGTH = 6

/**
 * Getting back in without the password, and changing it once you are.
 *
 * The three screens live together because they are one flow wearing different
 * hats — enter a code, set a password, and the in-app version of the same
 * thing — and because they share the field styling with the email sign-in
 * screen next door rather than with anything else in the app.
 */

/**
 * The code from the email.
 *
 * Nothing is checked here. There is no endpoint that validates a code on its
 * own, deliberately: one would be a way to grind through six-digit guesses
 * without ever committing to a password. The code is carried forward and spent
 * once, on the next screen, together with the new password — so a wrong code
 * is reported there.
 */
@Composable
fun ResetCodeScreen(
    vm: CallsViewModel,
    onBack: () -> Unit,
    onEntered: () -> Unit,
) {
    val email by vm.resetEmail.collectAsState()
    val state by vm.signIn.collectAsState()

    var code by remember { mutableStateOf("") }
    var resent by remember { mutableStateOf(false) }

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
        Text(stringResource(R.string.reset_code_title), style = Type.Heading, color = Ink.Text)
        Spacer(Modifier.height(10.dp))
        Text(
            stringResource(R.string.reset_code_sub, email),
            style = Type.Body,
            color = Ink.Body,
        )

        Spacer(Modifier.height(26.dp))
        CodeField(code) { code = it.filter(Char::isDigit).take(CODE_LENGTH); resent = false }

        Spacer(Modifier.height(16.dp))
        Row(Modifier.padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(if (resent) R.string.reset_code_sent_again else R.string.reset_code_none),
                style = Type.Caption,
                color = if (resent) Ink.PositiveDeep else Ink.Mute,
            )
            if (!resent) {
                Spacer(Modifier.width(8.dp))
                LinkText(
                    stringResource(R.string.reset_code_resend),
                    onClick = { vm.sendResetCode(email) { resent = true } },
                    style = Type.LinkSmall,
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
            label = stringResource(R.string.action_continue),
            onClick = { vm.holdResetCode(code); onEntered() },
            enabled = code.length == CODE_LENGTH,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/**
 * Six boxes that are really one field.
 *
 * A single hidden text field behind six drawn cells, rather than six fields
 * wired together: it gets keyboard handling, paste of a whole code, and
 * backspace for free, none of which is worth reimplementing.
 */
@Composable
private fun CodeField(code: String, onChange: (String) -> Unit) {
    Box {
        BasicTextField(
            value = code,
            onValueChange = onChange,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            // Drawn by the cells below; this exists to own the keyboard.
            decorationBox = { },
            modifier = Modifier.fillMaxWidth().height(56.dp),
            textStyle = Type.BodyLarge.copy(color = Color.Transparent),
            cursorBrush = SolidColor(Color.Transparent),
        )
        Row(Modifier.fillMaxWidth()) {
            repeat(CODE_LENGTH) { index ->
                if (index > 0) Spacer(Modifier.width(8.dp))
                val filled = index < code.length
                val here = index == code.length
                Box(
                    Modifier
                        .weight(1f)
                        .height(56.dp)
                        // The cell being typed into takes the heavier line, an
                        // empty one the pale ring — so the caret's position is
                        // visible without drawing a caret.
                        .border(
                            if (here) 2.dp else 1.dp,
                            if (filled || here) Ink.Outline else Ink.Rim,
                            RoundedCornerShape(12.dp),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    if (filled) {
                        Text(code[index].toString(), style = Type.Title, color = Ink.Text)
                    }
                }
            }
        }
    }
}

/** The new password, which also signs them in — no trip back to the sign-in screen. */
@Composable
fun NewPasswordScreen(
    vm: CallsViewModel,
    onBack: () -> Unit,
    onDone: () -> Unit,
) {
    val email by vm.resetEmail.collectAsState()
    val state by vm.signIn.collectAsState()

    var password by remember { mutableStateOf("") }
    var visible by remember { mutableStateOf(false) }
    val busy = state is SignInState.Running

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
        Text(stringResource(R.string.reset_new_title), style = Type.Heading, color = Ink.Text)
        Spacer(Modifier.height(10.dp))
        Text(stringResource(R.string.reset_new_sub, email), style = Type.Body, color = Ink.Body)

        Spacer(Modifier.height(26.dp))
        Column(
            Modifier
                .fillMaxWidth()
                .background(Ink.Card, FieldShape)
                .border(1.dp, Ink.Outline, FieldShape),
        ) {
            PasswordRow(
                value = password,
                onChange = { password = it; if (state is SignInState.Failed) vm.clearSignInError() },
                placeholder = stringResource(R.string.field_password),
                visible = visible,
                onToggle = { visible = !visible },
            )
        }

        Spacer(Modifier.height(10.dp))
        Text(
            stringResource(R.string.email_password_rule),
            style = Type.Fine,
            color = Ink.Mute,
            modifier = Modifier.padding(horizontal = 4.dp),
        )

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
            label = stringResource(if (busy) R.string.action_signing_in else R.string.reset_save),
            onClick = { vm.resetPassword(password, onDone) },
            enabled = password.length >= MIN_PASSWORD && !busy,
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

/**
 * Changing it from inside the app. Two rows in one box, the way the sign-in
 * screen joins its address and password.
 *
 * @param onForgot the way out for somebody who opened this and then realised
 *   they do not know the current one. It leaves for the emailed-code flow
 *   rather than leaving them stuck on a form they cannot fill in.
 */
@Composable
fun ChangePasswordScreen(
    vm: CallsViewModel,
    onBack: () -> Unit,
    onForgot: () -> Unit,
) {
    val methods by vm.authMethods.collectAsState()

    var current by remember { mutableStateOf("") }
    var fresh by remember { mutableStateOf("") }
    var visible by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var done by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val canSave = current.isNotEmpty() && fresh.length >= MIN_PASSWORD && !saving

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
        Text(stringResource(R.string.change_password_title), style = Type.Heading, color = Ink.Text)
        Spacer(Modifier.height(10.dp))
        Text(stringResource(R.string.change_password_sub), style = Type.Body, color = Ink.Body)

        Spacer(Modifier.height(26.dp))
        Column(
            Modifier
                .fillMaxWidth()
                .background(Ink.Card, FieldShape)
                .border(1.dp, Ink.Outline, FieldShape),
        ) {
            PasswordRow(
                value = current,
                onChange = { current = it; error = null; done = false },
                placeholder = stringResource(R.string.change_password_current),
                visible = visible,
                onToggle = { visible = !visible },
            )
            Rule(Ink.Hairline)
            PasswordRow(
                value = fresh,
                onChange = { fresh = it; error = null; done = false },
                placeholder = stringResource(R.string.change_password_new),
                visible = visible,
                onToggle = { visible = !visible },
            )
        }

        Spacer(Modifier.height(10.dp))
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(R.string.change_password_rule),
                style = Type.Fine,
                color = Ink.Mute,
                modifier = Modifier.weight(1f),
            )
            if (methods?.passwordReset == true) {
                Spacer(Modifier.width(12.dp))
                LinkText(
                    stringResource(R.string.change_password_forgot),
                    onClick = onForgot,
                    style = Type.LinkSmall,
                )
            }
        }

        val notice: Pair<String, Color>? = when {
            error != null -> error!! to Ink.NegativeDeep
            done -> stringResource(R.string.change_password_done) to Ink.PositiveDeep
            else -> null
        }
        notice?.let { (message, colour) ->
            Spacer(Modifier.height(14.dp))
            Text(
                message,
                style = Type.Caption,
                color = colour,
                modifier = Modifier.padding(horizontal = 4.dp),
            )
        }

        Spacer(Modifier.weight(1f))

        PrimaryButton(
            label = stringResource(if (saving) R.string.action_saving else R.string.action_save),
            onClick = {
                saving = true
                error = null
                vm.changePassword(
                    currentPassword = current,
                    newPassword = fresh,
                    onDone = { saving = false; done = true; current = ""; fresh = "" },
                    onError = { saving = false; error = it },
                )
            },
            enabled = canSave,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun PasswordRow(
    value: String,
    onChange: (String) -> Unit,
    placeholder: String,
    visible: Boolean,
    onToggle: () -> Unit,
) {
    Row(
        Modifier.padding(horizontal = 16.dp, vertical = 15.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) {
                Text(placeholder, style = Type.BodyLarge, color = Ink.Mute)
            }
            BasicTextField(
                value = value,
                onValueChange = onChange,
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
            modifier = Modifier.size(19.dp).clickableNoRipple(onToggle),
        )
    }
}
