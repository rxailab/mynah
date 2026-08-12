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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.voicecall.R
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.ScreenHeader
import com.voicecall.ui.WiseCard
import com.voicecall.ui.clickableNoRipple
import com.voicecall.ui.navBarPadding
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import com.voicecall.ui.theme.Wise

/**
 * The kinds of call the assistant already knows the shape of.
 *
 * Nothing is stored for these: a template is an example sentence and the
 * server-side template note that goes with it. Picking one fills the composer
 * and leaves you to edit it, which is the point — the sentence is still yours.
 */
private data class Template(
    val title: Int,
    val blurb: Int,
    val seed: Int,
    val icon: ImageVector,
)

private val TEMPLATES = listOf(
    Template(R.string.tpl_booking, R.string.tpl_booking_blurb, R.string.tpl_booking_seed, Wise.Phone),
    Template(R.string.tpl_appointment, R.string.tpl_appointment_blurb, R.string.tpl_appointment_seed, Wise.Clock),
    Template(R.string.tpl_parcel, R.string.tpl_parcel_blurb, R.string.tpl_parcel_seed, Wise.Search),
    Template(R.string.tpl_bank, R.string.tpl_bank_blurb, R.string.tpl_bank_seed, Wise.Person),
)

@Composable
fun TemplatesScreen(vm: CallsViewModel, onBack: () -> Unit, onCompose: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(top = statusBarPadding(), bottom = navBarPadding()),
    ) {
        ScreenHeader(title = stringResource(R.string.templates_title), onBack = onBack)

        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 24.dp),
        ) {
            Text(stringResource(R.string.templates_intro), style = Type.Caption, color = Ink.Body)
            Spacer(Modifier.height(14.dp))

            TEMPLATES.forEach { template ->
                val seed = stringResource(template.seed)
                WiseCard(radius = 16.dp, onClick = { vm.seedComposer(seed); onCompose() }) {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 15.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Box(
                            Modifier.size(38.dp).background(Ink.LimePale, RoundedCornerShape(12.dp)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(template.icon, null, tint = Ink.Deep, modifier = Modifier.size(18.dp))
                        }
                        Spacer(Modifier.width(13.dp))
                        Column(Modifier.weight(1f)) {
                            Text(stringResource(template.title), style = Type.RowTitle, color = Ink.Text)
                            Spacer(Modifier.height(3.dp))
                            Text(stringResource(template.blurb), style = Type.RowSub, color = Ink.Mute)
                        }
                        Spacer(Modifier.width(10.dp))
                        Icon(
                            Wise.ChevronRight,
                            null,
                            tint = Ink.Mute,
                            modifier = Modifier.padding(top = 3.dp).size(14.dp),
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
            }

            // Dashed, because it is the absence of a template rather than one
            // more of them.
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(Ink.Card, RoundedCornerShape(16.dp))
                    .border(1.dp, Ink.Rim, RoundedCornerShape(16.dp))
                    .clickableNoRipple { vm.clearComposerSeed(); onCompose() }
                    .padding(horizontal = 16.dp, vertical = 15.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.size(38.dp).background(Ink.CanvasSoft, RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Wise.Plus, null, tint = Ink.Body, modifier = Modifier.size(17.dp))
                }
                Spacer(Modifier.width(13.dp))
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.tpl_custom), style = Type.RowTitle, color = Ink.Text)
                    Spacer(Modifier.height(3.dp))
                    Text(stringResource(R.string.tpl_custom_blurb), style = Type.RowSub, color = Ink.Mute)
                }
            }
        }
    }
}
