package com.voicecall.ui.screens

import android.content.Intent
import android.provider.ContactsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.voicecall.R
import com.voicecall.data.Brief
import com.voicecall.data.languageForNumber
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.ErrorCard
import com.voicecall.ui.FilterChip
import com.voicecall.ui.LinkText
import com.voicecall.ui.OutlineButton
import com.voicecall.ui.ParseState
import com.voicecall.ui.PillSwitch
import com.voicecall.ui.PrimaryButton
import com.voicecall.ui.SettingRow
import com.voicecall.ui.StepHeader
import com.voicecall.ui.WiseCard
import com.voicecall.ui.navBarPadding
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import com.voicecall.ui.theme.Wise
import com.voicecall.ui.wiseField

private val E164 = Regex("^\\+[1-9]\\d{6,14}$")

/**
 * What the assistant understood, before anything is dialled. Every line is
 * editable, and blanks stay blank — the parser is told to leave gaps rather
 * than guess, so an empty row here is the system working.
 *
 * The prototype's review step: back arrow top-left, everything in one white
 * card on the sage canvas, and a single lime action at the foot.
 */
@Composable
fun ConfirmScreen(
    vm: CallsViewModel,
    onBack: () -> Unit,
    onPlaced: (String) -> Unit,
    onNeedsTopUp: () -> Unit = {},
    onCallLater: () -> Unit = {},
) {
    val state by vm.uiState.collectAsState()
    val parse by vm.parse.collectAsState()
    val brief = (parse as? ParseState.Ready)?.brief

    // Once the language row is set by hand, a later phone edit stops overriding it.
    var languageTouched by remember { mutableStateOf(false) }

    if (brief == null) {
        LaunchedBack(onBack)
        return
    }

    val phone = brief.phoneNumber.orEmpty().trim()
    val phoneValid = E164.matches(phone)
    val canDial = phoneValid && !state.loading

    fun edit(updated: Brief) = vm.editBrief(updated)

    val context = LocalContext.current
    val pickContact = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val uri = result.data?.data ?: return@rememberLauncherForActivityResult
        context.contentResolver.query(
            uri, arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER), null, null, null,
        )?.use { cursor ->
            if (cursor.moveToFirst()) {
                val picked = cursor.getString(0).orEmpty().replace(Regex("[\\s\\-()]"), "")
                var updated = brief.copy(phoneNumber = picked)
                if (!languageTouched) {
                    languageForNumber(picked)?.let { updated = updated.copy(language = it) }
                }
                edit(updated)
            }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .imePadding()
            .padding(top = statusBarPadding(), bottom = navBarPadding()),
    ) {
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, top = 18.dp),
        ) {
            StepHeader(
                icon = Wise.ArrowLeft,
                description = stringResource(R.string.action_back),
                onNavigate = onBack,
                title = stringResource(R.string.confirm_title),
                // Two steps, and this is the second: say it, then check it.
                // Worth stating because the button below dials.
                step = stringResource(R.string.confirm_step),
            )

            Spacer(Modifier.height(14.dp))
            WiseCard {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Field(
                        label = stringResource(R.string.field_who),
                        value = brief.businessName.orEmpty(),
                        onChange = { edit(brief.copy(businessName = it.ifBlank { null })) },
                        bold = true,
                    )
                    Field(
                        label = stringResource(R.string.field_when),
                        value = brief.`when`.orEmpty(),
                        onChange = { edit(brief.copy(`when` = it.ifBlank { null })) },
                    )
                    Field(
                        label = stringResource(R.string.field_notes),
                        value = brief.constraints.joinToString(" · "),
                        onChange = {
                            edit(
                                brief.copy(
                                    constraints = it.split("·", "\n")
                                        .map(String::trim).filter(String::isNotEmpty),
                                ),
                            )
                        },
                    )

                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                            Text(
                                stringResource(R.string.field_call_language).uppercase(),
                                style = Type.LabelSmall,
                                color = Ink.Mute,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                stringResource(R.string.field_auto_language),
                                style = Type.Fine,
                                color = Ink.Mute,
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf("en" to "English", "zh" to "中文").forEach { (id, label) ->
                                FilterChip(
                                    label = label,
                                    selected = brief.language == id,
                                    onClick = {
                                        languageTouched = true
                                        edit(brief.copy(language = id))
                                    },
                                )
                            }
                        }
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                            Text(
                                stringResource(R.string.field_phone).uppercase(),
                                style = Type.LabelSmall,
                                color = Ink.Mute,
                                modifier = Modifier.weight(1f),
                            )
                            LinkText(
                                stringResource(R.string.action_from_contacts),
                                {
                                    pickContact.launch(
                                        Intent(
                                            Intent.ACTION_PICK,
                                            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                                        ),
                                    )
                                },
                                style = Type.Fine.copy(fontWeight = FontWeight.SemiBold),
                            )
                        }
                        FieldBox {
                            BasicTextField(
                                value = phone,
                                onValueChange = {
                                    var updated = brief.copy(phoneNumber = it.ifBlank { null })
                                    if (!languageTouched) {
                                        languageForNumber(it)?.let { lang ->
                                            updated = updated.copy(language = lang)
                                        }
                                    }
                                    edit(updated)
                                },
                                textStyle = Type.MonoBody.copy(color = Ink.Text),
                                cursorBrush = SolidColor(Ink.Text),
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                Modifier
                                    .size(6.dp)
                                    .background(
                                        if (phoneValid) Ink.Positive else Ink.WarningDeep,
                                        CircleShape,
                                    ),
                            )
                            Spacer(Modifier.width(7.dp))
                            Text(
                                stringResource(
                                    if (phoneValid) R.string.phone_ok else R.string.phone_needs_code,
                                ),
                                style = Type.Fine,
                                color = if (phoneValid) Ink.PositiveDeep else Ink.WarningDeep,
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            Text(
                stringResource(R.string.confirm_blanks_note),
                style = Type.Fine,
                color = Ink.Mute,
                modifier = Modifier.padding(horizontal = 6.dp),
            )

            // Decided here because it cannot be decided later: the offer comes
            // with a few seconds to press a key, and the assistant refuses by
            // default rather than putting an unattended call on someone's phone.
            Spacer(Modifier.height(14.dp))
            WiseCard {
                SettingRow(
                    title = stringResource(R.string.callback_title),
                    subtitle = stringResource(
                        if (brief.acceptCallback) R.string.callback_on else R.string.callback_off,
                    ),
                    trailing = {
                        PillSwitch(
                            on = brief.acceptCallback,
                            onClick = { edit(brief.copy(acceptCallback = !brief.acceptCallback)) },
                        )
                    },
                )
            }

            // The pale-green panel is the design's way of previewing what the
            // assistant will actually say.
            Spacer(Modifier.height(14.dp))
            WiseCard(fill = Ink.LimePale) {
                Column(Modifier.padding(18.dp)) {
                    Text(stringResource(R.string.opener_label), style = Type.LabelSmall, color = Ink.Deep)
                    Spacer(Modifier.height(8.dp))
                    Text("“${brief.opening}”", style = Type.Body, color = Ink.Deep)
                }
            }

            state.error?.let {
                Spacer(Modifier.height(14.dp))
                ErrorCard(it, vm::clearError)
            }

            Spacer(Modifier.height(20.dp))
        }

        Column(
            Modifier.padding(start = 20.dp, end = 20.dp, top = 6.dp, bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            PrimaryButton(
                label = stringResource(
                    when {
                        state.loading -> R.string.action_dialling
                        !phoneValid -> R.string.action_need_number
                        else -> R.string.action_dial
                    },
                ),
                onClick = { vm.createCall(brief.toRequest(), onPlaced, onNeedsTopUp) },
                enabled = canDial,
                modifier = Modifier.fillMaxWidth(),
                leading = if (state.loading) {
                    {
                        CircularProgressIndicator(
                            color = Ink.OnLime,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(15.dp),
                        )
                    }
                } else {
                    { Icon(Wise.Phone, null, tint = Ink.OnLime, modifier = Modifier.size(16.dp)) }
                },
            )
            // The same brief, booked rather than dialled. Outlined so there is
            // still exactly one lime action on the screen.
            OutlineButton(
                label = stringResource(R.string.action_call_later),
                onClick = onCallLater,
                enabled = canDial,
                modifier = Modifier.fillMaxWidth(),
                leading = { Icon(Wise.Clock, null, tint = Ink.Text, modifier = Modifier.size(15.dp)) },
            )
        }
    }
}

@Composable
private fun Field(label: String, value: String, onChange: (String) -> Unit, bold: Boolean = false) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label.uppercase(), style = Type.LabelSmall, color = Ink.Mute)
        FieldBox {
            BasicTextField(
                value = value,
                onValueChange = onChange,
                textStyle = (if (bold) Type.Value else Type.BodyLarge).copy(color = Ink.Text),
                cursorBrush = SolidColor(Ink.Text),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/** The design's input: white, an ink hairline, a 12dp corner. */
@Composable
private fun FieldBox(content: @Composable () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .wiseField()
            .padding(horizontal = 15.dp, vertical = 14.dp),
    ) { content() }
}

/** The brief is gone (process death, or a cleared parse) — go back rather than blank. */
@Composable
private fun LaunchedBack(onBack: () -> Unit) {
    LaunchedEffect(Unit) { onBack() }
}
