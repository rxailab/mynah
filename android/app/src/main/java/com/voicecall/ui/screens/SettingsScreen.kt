package com.voicecall.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.voicecall.BuildConfig
import com.voicecall.R
import com.voicecall.data.Language
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.Legal
import com.voicecall.ui.GroupedCard
import com.voicecall.ui.LinkText
import com.voicecall.ui.PrimaryButton
import com.voicecall.ui.SettingRow
import com.voicecall.ui.Rule
import com.voicecall.ui.SectionLabel
import com.voicecall.ui.WiseCard
import com.voicecall.ui.clickableNoRipple
import com.voicecall.ui.rememberLegalOpener
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import com.voicecall.ui.theme.Wise

private val E164 = Regex("^\\+[1-9]\\d{6,14}$")

/**
 * What is left to configure once the server address is fixed at build time and
 * the session comes from signing in: the interface language, who the assistant
 * says it is calling for, and the way out.
 */
@Composable
fun SettingsScreen(
    vm: CallsViewModel,
    onVerifyNumber: () -> Unit = {},
    onTemplates: () -> Unit = {},
    onBusinesses: () -> Unit = {},
    onUsage: () -> Unit = {},
    onHelp: () -> Unit = {},
    onScheduled: () -> Unit = {},
    onWhoFor: () -> Unit = {},
    onChangePassword: () -> Unit = {},
) {
    val profile by vm.profile.collectAsState()
    val account by vm.account.collectAsState()
    val language by vm.language.collectAsState()

    var confirmingDelete by remember { mutableStateOf(false) }
    var deleteError by remember { mutableStateOf<String?>(null) }
    var pickingLanguage by remember { mutableStateOf(false) }

    val usage by vm.usage.collectAsState()
    val scheduled by vm.scheduled.collectAsState()
    LaunchedEffect(Unit) { vm.loadProfile(); vm.loadUsage(); vm.loadScheduled() }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .imePadding()
            .padding(top = statusBarPadding())
            .padding(start = 20.dp, end = 20.dp, top = 26.dp, bottom = 24.dp),
    ) {
        Text(stringResource(R.string.settings_title), style = Type.Title, color = Ink.Text)

        // The one dark card the design allows per screen: who is signed in.
        account?.let { signedIn ->
            Spacer(Modifier.height(18.dp))
            WiseCard(fill = Ink.Text) {
                Row(
                    Modifier.fillMaxWidth().padding(18.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier.size(48.dp).background(Ink.Lime, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(signedIn.initial, style = Type.Section, color = Ink.OnLime)
                    }
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(signedIn.displayName, style = Type.ListTitle, color = Ink.OnDark)
                        if (signedIn.handle.isNotBlank()) {
                            Text(signedIn.handle, style = Type.Caption, color = Ink.Lime)
                        }
                    }
                    // The month's usage rides on the account card rather than
                    // being a row of its own: it is a fact about this account,
                    // and it is the only number on the screen.
                    Spacer(Modifier.width(12.dp))
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            stringResource(R.string.settings_calls_this_month, usage.used),
                            style = Type.Mono,
                            color = Ink.OnDarkMute,
                        )
                        Text(
                            stringResource(R.string.usage_title),
                            style = Type.LabelSmall,
                            color = Ink.Lime,
                            modifier = Modifier.clickableNoRipple(onUsage).padding(top = 3.dp),
                        )
                    }
                }
            }
        }

        // --- calling ---
        // The prototype turns the middle of this screen into rows: the things
        // that used to be edited here now have screens of their own, and what is
        // left is a list of where to go.
        Spacer(Modifier.height(24.dp))
        SectionLabel(stringResource(R.string.settings_calling), Modifier.padding(start = 6.dp))
        Spacer(Modifier.height(8.dp))
        GroupedCard(rows = listOf(
            {
                SettingRow(
                    title = stringResource(R.string.settings_who),
                    subtitle = stringResource(R.string.settings_who_sub),
                    value = profile?.ownerName?.takeIf { it.isNotBlank() },
                    onClick = onWhoFor,
                )
            },
            {
                SettingRow(
                    title = stringResource(R.string.callerid_title),
                    subtitle = profile?.ownerPhone?.takeIf { it.isNotBlank() }
                        ?: stringResource(R.string.callerid_not_verified),
                    onClick = if (profile?.callerIdVerified == true) null else onVerifyNumber,
                    trailing = if (profile?.callerIdVerified == true) {
                        {
                            Text(
                                stringResource(R.string.callerid_verified_badge),
                                style = Type.LabelSmall,
                                color = Ink.PositiveDeep,
                            )
                        }
                    } else null,
                )
            },
            {
                SettingRow(
                    title = stringResource(R.string.scheduled_title),
                    subtitle = stringResource(R.string.settings_scheduled_sub),
                    value = scheduled.size.takeIf { it > 0 }?.toString(),
                    onClick = onScheduled,
                )
            },
            {
                SettingRow(
                    title = stringResource(R.string.templates_title),
                    subtitle = stringResource(R.string.settings_templates_sub),
                    onClick = onTemplates,
                )
            },
            {
                SettingRow(
                    title = stringResource(R.string.businesses_title),
                    subtitle = stringResource(R.string.settings_businesses_sub),
                    onClick = onBusinesses,
                )
            },
        ))

        // --- account ---
        // Its own group after the calling settings, holding one row for now.
        // Anything else about the account rather than about the calls belongs
        // here rather than being wedged in above.
        Spacer(Modifier.height(24.dp))
        SectionLabel(stringResource(R.string.settings_account), Modifier.padding(start = 6.dp))
        Spacer(Modifier.height(8.dp))
        GroupedCard(rows = listOf(
            {
                SettingRow(
                    title = stringResource(R.string.change_password_title),
                    subtitle = stringResource(R.string.settings_change_password_sub),
                    onClick = onChangePassword,
                )
            },
        ))

        // --- interface ---
        Spacer(Modifier.height(24.dp))
        SectionLabel(stringResource(R.string.settings_ui_language), Modifier.padding(start = 6.dp))
        Spacer(Modifier.height(8.dp))
        GroupedCard(rows = listOf(
            {
                SettingRow(
                    title = stringResource(R.string.settings_ui_language),
                    subtitle = stringResource(R.string.settings_language_row_sub),
                    value = stringResource(
                        when (language) {
                            Language.SYSTEM -> R.string.language_system
                            Language.ENGLISH -> R.string.language_english
                            Language.CHINESE -> R.string.language_chinese
                        },
                    ),
                    onClick = { pickingLanguage = true },
                )
            },
        ))
        Spacer(Modifier.height(10.dp))
        WiseCard(fill = Ink.LimePale, radius = 16.dp) {
            Column(Modifier.padding(16.dp)) {
                Text(stringResource(R.string.settings_language_note), style = Type.Caption, color = Ink.Deep)
                Spacer(Modifier.height(9.dp))
                Text(stringResource(R.string.settings_translation_note), style = Type.Fine, color = Ink.Deep)
            }
        }

        // --- notifications ---
        Spacer(Modifier.height(24.dp))
        SectionLabel(stringResource(R.string.settings_notifications), Modifier.padding(start = 6.dp))
        Spacer(Modifier.height(8.dp))
        WiseCard {
            Column(Modifier.padding(horizontal = 18.dp, vertical = 16.dp)) {
                Text(stringResource(R.string.settings_notif_title), style = Type.ListTitle, color = Ink.Text)
                Spacer(Modifier.height(4.dp))
                Text(stringResource(R.string.settings_notif_sub), style = Type.Caption, color = Ink.Body)
            }
        }
        Spacer(Modifier.height(10.dp))
        Text(
            stringResource(R.string.settings_notif_local),
            style = Type.Fine,
            color = Ink.Mute,
            modifier = Modifier.padding(horizontal = 6.dp),
        )

        // --- the published documents ---
        val openLegal = rememberLegalOpener()
        Spacer(Modifier.height(24.dp))
        SectionLabel(stringResource(R.string.legal_section), Modifier.padding(start = 6.dp))
        Spacer(Modifier.height(8.dp))
        WiseCard {
            // Help sits with the documents rather than with the calling rows:
            // all three are "go and read something".
            LegalRow(stringResource(R.string.help_title), onHelp)
            Rule()
            LegalRow(stringResource(R.string.legal_terms)) { openLegal(Legal.TERMS) }
            Rule()
            LegalRow(stringResource(R.string.legal_privacy)) { openLegal(Legal.PRIVACY) }
        }

        // The two ways out, grouped: one ends the session, one ends everything.
        Spacer(Modifier.height(24.dp))
        WiseCard {
            Text(
                stringResource(R.string.action_sign_out),
                style = Type.ListTitle,
                color = Ink.Negative,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickableNoRipple(vm::signOut)
                    .padding(vertical = 16.dp),
            )
            Rule()
            Text(
                stringResource(R.string.action_delete_account),
                style = Type.ListItem,
                color = Ink.Negative,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickableNoRipple { confirmingDelete = true }
                    .padding(vertical = 16.dp),
            )
        }

        Spacer(Modifier.height(16.dp))
        Text(
            "${stringResource(R.string.app_name)} ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
            style = Type.Fine,
            color = Ink.Mute,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )

        // A Dialog rather than an overlay in this tree: it gets its own window,
        // so the system back button dismisses it without leaving the screen.
        if (pickingLanguage) {
            LanguageDialog(
                current = language,
                onPick = { vm.setLanguage(it); pickingLanguage = false },
                onDismiss = { pickingLanguage = false },
            )
        }

        if (confirmingDelete) {
            DeleteAccountDialog(
                error = deleteError,
                onDismiss = { confirmingDelete = false; deleteError = null },
                onConfirm = { vm.deleteAccount { deleteError = it } },
            )
        }
    }
}

/**
 * The three interface languages. A dialog rather than the old inline radio
 * card: with the rest of the screen turned into rows, three permanently
 * expanded options was the one thing left shouting.
 */
@Composable
private fun LanguageDialog(current: Language, onPick: (Language) -> Unit, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        WiseCard {
            Column(Modifier.padding(vertical = 8.dp)) {
                Text(
                    stringResource(R.string.settings_ui_language),
                    style = Type.Section,
                    color = Ink.Text,
                    modifier = Modifier.padding(horizontal = 22.dp, vertical = 12.dp),
                )
                Language.entries.forEach { option ->
                    val selected = option == current
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickableNoRipple { onPick(option) }
                            .padding(horizontal = 22.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        // The design's radio: an ink ring that fills in, not a tick.
                        Box(
                            Modifier
                                .size(20.dp)
                                .border(
                                    if (selected) 6.dp else 2.dp,
                                    if (selected) Ink.Outline else Ink.RimSoft,
                                    CircleShape,
                                ),
                        )
                        Spacer(Modifier.width(14.dp))
                        Text(
                            stringResource(
                                when (option) {
                                    Language.SYSTEM -> R.string.language_system
                                    Language.ENGLISH -> R.string.language_english
                                    Language.CHINESE -> R.string.language_chinese
                                },
                            ),
                            style = Type.ListItem,
                            color = Ink.Text,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LegalRow(label: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickableNoRipple(onClick)
            .padding(horizontal = 18.dp, vertical = 15.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = Type.ListItem, color = Ink.Text, modifier = Modifier.weight(1f))
        Icon(Wise.ChevronRight, null, tint = Ink.Mute, modifier = Modifier.size(15.dp))
    }
}

/**
 * Deleting is irreversible and takes the call history with it, so the
 * confirmation spells out what goes rather than asking "are you sure".
 */
@Composable
private fun DeleteAccountDialog(error: String?, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        WiseCard {
            Column(Modifier.padding(horizontal = 22.dp, vertical = 24.dp)) {
                Text(stringResource(R.string.delete_account_title), style = Type.Section, color = Ink.Text)
                Spacer(Modifier.height(10.dp))
                Text(stringResource(R.string.delete_account_body), style = Type.Caption, color = Ink.Body)

                error?.let {
                    Spacer(Modifier.height(12.dp))
                    Text(it, style = Type.Caption, color = Ink.NegativeDeep)
                }

                Spacer(Modifier.height(20.dp))
                PrimaryButton(
                    label = stringResource(R.string.action_delete_forever),
                    onClick = onConfirm,
                    height = 48.dp,
                    container = Ink.Negative,
                    content = Ink.OnDark,
                    style = Type.ButtonSmall,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    stringResource(R.string.action_cancel),
                    style = Type.Link,
                    color = Ink.Text,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickableNoRipple(onDismiss)
                        .padding(vertical = 10.dp),
                )
            }
        }
    }
}

/** Label above, ink-outlined box, one line of support underneath. */
