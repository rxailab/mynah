package com.voicecall.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.unit.dp
import com.voicecall.R
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.LinkText
import com.voicecall.ui.PrimaryButton
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import com.voicecall.ui.wiseField

private val E164 = Regex("^\\+[1-9]\\d{6,14}$")

/**
 * The last step of signing up: the name the assistant gives when a booking
 * needs one, and the number a hand-over rings.
 *
 * Skippable on purpose. Neither field is needed to look around the app, and the
 * server refuses to dial without them anyway — so the choice is between asking
 * now and blocking, or asking now and letting them get on with it.
 *
 * [onDone] is told whether a number was actually saved. The step after this one
 * verifies that number, and there is nothing to verify for someone who skipped.
 */
@Composable
fun ProfileSetupScreen(vm: CallsViewModel, onDone: (savedNumber: Boolean) -> Unit) {
    val account by vm.account.collectAsState()
    val profile by vm.profile.collectAsState()

    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var seeded by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { vm.loadProfile() }

    // Prefill from whatever is already known — Google gave a name, or the
    // server seeded one from the pre-accounts profile. Retyping it would be a
    // strange thing to ask on the step that exists to save a step.
    LaunchedEffect(account, profile) {
        if (seeded) return@LaunchedEffect
        val known = profile?.ownerName?.takeIf { it.isNotBlank() }
            ?: account?.name?.takeIf { it.isNotBlank() }
        val knownPhone = profile?.ownerPhone?.takeIf { it.isNotBlank() }
        if (known != null || knownPhone != null) {
            name = known.orEmpty()
            phone = knownPhone.orEmpty()
            seeded = true
        }
    }

    val phoneValid = phone.isBlank() || E164.matches(phone.trim())
    val complete = name.trim().length >= 2 && E164.matches(phone.trim())

    Column(
        Modifier
            .fillMaxSize()
            .background(Ink.Card)
            .imePadding()
            .padding(top = statusBarPadding())
            .padding(bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()),
    ) {
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 28.dp, end = 28.dp, top = 44.dp),
        ) {
            Text(stringResource(R.string.profile_step_label), style = Type.LabelSmall, color = Ink.Mute)
            Spacer(Modifier.height(10.dp))
            Text(stringResource(R.string.settings_who), style = Type.Heading, color = Ink.Text)
            Spacer(Modifier.height(10.dp))
            Text(stringResource(R.string.settings_who_note), style = Type.Caption, color = Ink.Body)

            Spacer(Modifier.height(26.dp))
            Field(
                label = stringResource(R.string.field_your_name),
                value = name,
                onChange = { name = it; error = null },
                support = stringResource(R.string.support_your_name),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
            )

            Spacer(Modifier.height(16.dp))
            Field(
                label = stringResource(R.string.field_your_phone),
                value = phone,
                onChange = { phone = it; error = null },
                support = stringResource(
                    if (phoneValid) R.string.support_your_phone_ok else R.string.support_your_phone_bad,
                ),
                supportWarning = !phoneValid,
                mono = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            )

            error?.let {
                Spacer(Modifier.height(14.dp))
                Text(it, style = Type.Caption, color = Ink.NegativeDeep)
            }

            Spacer(Modifier.height(20.dp))
        }

        Column(Modifier.padding(start = 28.dp, end = 28.dp, bottom = 24.dp)) {
            PrimaryButton(
                label = stringResource(if (saving) R.string.action_saving else R.string.action_save_and_start),
                onClick = {
                    saving = true
                    error = null
                    vm.saveProfile(
                        ownerName = name,
                        ownerPhone = phone,
                        onDone = { saving = false; onDone(true) },
                        onError = { saving = false; error = it },
                    )
                },
                enabled = complete && !saving,
                modifier = Modifier.fillMaxWidth(),
                leading = if (saving) {
                    {
                        CircularProgressIndicator(
                            color = Ink.OnLime,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(15.dp),
                        )
                    }
                } else null,
            )
            Spacer(Modifier.height(16.dp))
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                // Nothing was saved, so there is no number to verify next —
                // even if one was already typed into the field above.
                LinkText(
                    stringResource(R.string.action_fill_in_later),
                    { onDone(false) },
                    style = Type.LinkSmall,
                )
            }
        }
    }
}

@Composable
private fun Field(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    support: String,
    supportWarning: Boolean = false,
    mono: Boolean = false,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
) {
    Column {
        Text(label.uppercase(), style = Type.LabelSmall, color = Ink.Mute)
        Spacer(Modifier.height(8.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .wiseField()
                .padding(horizontal = 15.dp, vertical = 14.dp),
        ) {
            BasicTextField(
                value = value,
                onValueChange = onChange,
                textStyle = (if (mono) Type.MonoBody else Type.BodyLarge).copy(color = Ink.Text),
                cursorBrush = SolidColor(Ink.Text),
                singleLine = true,
                keyboardOptions = keyboardOptions,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(support, style = Type.Fine, color = if (supportWarning) Ink.WarningDeep else Ink.Mute)
    }
}
