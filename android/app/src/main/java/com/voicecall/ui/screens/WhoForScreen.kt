package com.voicecall.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.voicecall.R
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.LinkText
import com.voicecall.ui.PrimaryButton
import com.voicecall.ui.ScreenHeader
import com.voicecall.ui.WiseCard
import com.voicecall.ui.clickableNoRipple
import com.voicecall.ui.navBarPadding
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.wiseField
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type

private val E164 = Regex("^\\+[1-9]\\d{6,14}$")

/**
 * The name the assistant gives when a booking needs one, and the number a
 * hand-over rings.
 *
 * Its own screen in the redesign. These two fields carry more weight than
 * anything else in Settings — one of them is spoken aloud to strangers and the
 * other is where the phone rings when the assistant will not go on alone — and
 * they were previously buried between a language picker and a sign-out button.
 */
@Composable
fun WhoForScreen(
    vm: CallsViewModel,
    onBack: () -> Unit,
    onVerifyNumber: () -> Unit,
) {
    val profile by vm.profile.collectAsState()

    var ownerName by remember { mutableStateOf("") }
    var ownerPhone by remember { mutableStateOf("") }
    var seeded by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { vm.loadProfile() }
    LaunchedEffect(profile) {
        val p = profile
        if (p != null && !seeded) {
            ownerName = p.ownerName
            ownerPhone = p.ownerPhone
            seeded = true
        }
    }

    val phoneValid = ownerPhone.isBlank() || E164.matches(ownerPhone.trim())
    val canSave = ownerName.trim().length >= 2 && E164.matches(ownerPhone.trim()) && !saving
    val verified = profile?.callerIdVerified == true

    Column(
        Modifier
            .fillMaxSize()
            .imePadding()
            .padding(top = statusBarPadding(), bottom = navBarPadding()),
    ) {
        ScreenHeader(title = stringResource(R.string.settings_who), onBack = onBack)

        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, top = 14.dp),
        ) {
            Text(stringResource(R.string.settings_who_note), style = Type.Caption, color = Ink.Body)
            Spacer(Modifier.height(20.dp))

            WiseCard(radius = 16.dp) {
                Column(
                    Modifier.padding(horizontal = 16.dp, vertical = 18.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    SettingField(
                        label = stringResource(R.string.field_your_name),
                        value = ownerName,
                        onChange = { ownerName = it; saveError = null; saved = false },
                        support = stringResource(R.string.support_your_name),
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
                    )
                    SettingField(
                        label = stringResource(R.string.field_your_phone),
                        value = ownerPhone,
                        onChange = { ownerPhone = it; saveError = null; saved = false },
                        support = stringResource(
                            if (phoneValid) R.string.support_your_phone_ok else R.string.support_your_phone_bad,
                        ),
                        supportColour = if (phoneValid) Ink.Mute else Ink.WarningDeep,
                        mono = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    )
                }
            }

            // The caller ID sits with the number it belongs to, not three
            // sections away in a list of unrelated switches.
            Spacer(Modifier.height(12.dp))
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(
                        if (verified) Ink.LimePale else Ink.CardSoft,
                        RoundedCornerShape(14.dp),
                    )
                    // Verified is a state, not a button; there is only something
                    // to tap when it is not.
                    .then(if (verified) Modifier else Modifier.clickableNoRipple(onVerifyNumber))
                    .padding(horizontal = 16.dp, vertical = 13.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.callerid_title), style = Type.RowTitle, color = Ink.Text)
                    Text(
                        if (verified) {
                            stringResource(R.string.callerid_done_body, profile?.ownerPhone.orEmpty())
                        } else {
                            stringResource(R.string.callerid_not_verified)
                        },
                        style = Type.RowSub,
                        color = Ink.Body,
                    )
                }
                Spacer(Modifier.width(12.dp))
                Text(
                    stringResource(
                        if (verified) R.string.callerid_verified_badge else R.string.callerid_start,
                    ),
                    style = Type.LabelSmall,
                    color = if (verified) Ink.PositiveDeep else Ink.Deep,
                )
            }

            if (verified) {
                // Spelled out because it is not obvious: this is not a display
                // preference, it is the thing that lets the app call at all.
                Spacer(Modifier.height(10.dp))
                Text(
                    stringResource(R.string.callerid_remove_warning),
                    style = Type.Fine,
                    color = Ink.Mute,
                    modifier = Modifier.padding(horizontal = 4.dp),
                )
                Spacer(Modifier.height(8.dp))
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    LinkText(
                        stringResource(R.string.callerid_remove),
                        { vm.releaseCallerId() },
                        style = Type.LinkSmall,
                        colour = Ink.NegativeDeep,
                    )
                }
            }

            val notice: Pair<String, Color>? = when {
                saveError != null -> saveError!! to Ink.Negative
                saved -> stringResource(R.string.settings_saved) to Ink.Positive
                else -> null
            }
            notice?.let { (message, colour) ->
                Spacer(Modifier.height(14.dp))
                Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp)) {
                    Box(Modifier.width(3.dp).height(38.dp).background(colour, RoundedCornerShape(2.dp)))
                    Spacer(Modifier.width(12.dp))
                    Text(message, style = Type.Caption, color = Ink.Body)
                }
            }

            Spacer(Modifier.height(24.dp))
        }

        Box(Modifier.padding(start = 20.dp, end = 20.dp, bottom = 24.dp)) {
            PrimaryButton(
                label = stringResource(if (saving) R.string.action_saving else R.string.action_save),
                onClick = {
                    saving = true
                    saveError = null
                    vm.saveProfile(
                        ownerName = ownerName,
                        ownerPhone = ownerPhone,
                        onDone = { saving = false; saved = true },
                        onError = { saving = false; saveError = it },
                    )
                },
                enabled = canSave,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/**
 * A labelled field with its supporting line. Lives here rather than in
 * Components because this is now the only screen with text fields in it — the
 * rest of Settings became rows.
 */
@Composable
private fun SettingField(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    support: String? = null,
    supportColour: Color = Ink.Mute,
    mono: Boolean = false,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label.uppercase(), style = Type.LabelSmall, color = Ink.Mute)
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
        support?.let { Text(it, style = Type.Fine, color = supportColour) }
    }
}
