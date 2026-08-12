package com.voicecall.ui.screens

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import com.voicecall.R
import com.voicecall.data.BillingState
import com.stripe.android.PaymentConfiguration
import com.stripe.android.paymentsheet.PaymentSheet
import com.stripe.android.paymentsheet.PaymentSheetResult
import com.stripe.android.paymentsheet.rememberPaymentSheet
import com.voicecall.data.Call
import com.voicecall.ui.GroupLabel
import com.voicecall.ui.GroupedCard
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.ScreenHeader
import com.voicecall.ui.clickableNoRipple
import com.voicecall.ui.navBarPadding
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import java.util.Calendar

/**
 * What is left to spend, what a top-up costs, and what this month has run to.
 *
 * The money on this screen is deliberately two different things kept apart.
 * The headline is calls — the unit anybody actually buys and spends. Below it,
 * unchanged, is what those calls cost us to run, itemised per call: that is not
 * a bill, and the footnote says so. Showing it is a choice — most services hide
 * their margin — but this app asks people to trust it with a phone line, and a
 * cost breakdown they can check against their own call list is worth more than
 * the margin is worth concealing.
 *
 * Prices for the packs come from Play rather than from here, because Play is
 * the only thing that knows the buyer's currency and country.
 */
@Composable
fun UsageScreen(vm: CallsViewModel, onBack: () -> Unit) {
    val state by vm.uiState.collectAsState()
    val usage by vm.usage.collectAsState()
    val prices by vm.billing.prices.collectAsState()
    val billingState by vm.billing.state.collectAsState()

    // launchBillingFlow wants the Activity itself: Play draws its sheet over
    // this one rather than in it.
    val context = LocalContext.current
    val activity = context as? Activity
    val clipboard = remember(context) {
        context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    }
    var copied by remember { mutableStateOf(false) }
    val payOnWeb = usage.webPay

    // Stripe's sheet, opened over this screen. Its result is only used to say
    // something on screen — the credits come from Stripe's webhook to our
    // server, never from what the phone reports, because the phone is not who
    // we take payment facts from.
    var payState by remember { mutableStateOf<String?>(null) }
    val paidLabel = stringResource(R.string.usage_pay_done)
    val cancelledLabel = stringResource(R.string.usage_pay_cancelled)
    val paymentSheet = rememberPaymentSheet { result ->
        payState = when (result) {
            is PaymentSheetResult.Completed -> {
                // The webhook is usually a second or two behind the sheet.
                vm.watchForTopUp()
                paidLabel
            }
            is PaymentSheetResult.Canceled -> cancelledLabel
            is PaymentSheetResult.Failed -> result.error.message ?: cancelledLabel
        }
    }

    LaunchedEffect(Unit) {
        vm.refresh(quiet = true)
        // The billing client outlives this screen, so last visit's "added" line
        // would still be sitting there on the next one.
        vm.billing.clearState()
        // Loads the balance and packs, asks Play for prices, and delivers
        // anything paid for on a previous run that never reached the server.
        vm.openShop()
    }
    // Nothing to watch for once nobody is looking at the balance.
    DisposableEffect(Unit) { onDispose { vm.stopWatchingForTopUp() } }

    val monthStart = remember {
        Calendar.getInstance().apply {
            set(Calendar.DAY_OF_MONTH, 1)
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }.timeInMillis
    }
    val thisMonth = state.calls.filter { it.createdAt >= monthStart }.sortedByDescending { it.createdAt }
    val priced = thisMonth.mapNotNull { call -> call.cost?.let { call to it } }
    val total = priced.sumOf { it.second.price.toDoubleOrNull() ?: 0.0 }
    val seconds = priced.sumOf { it.second.durationSeconds }
    // The currency is whatever Twilio rated in, so it is only known once at
    // least one call has been rated. Until then there is no total to show: a
    // bare "0.00" reads as "this month was free" when it means "not priced yet".
    val symbol = priced.firstOrNull()?.second?.unit.orEmpty().let {
        when (it.uppercase()) { "GBP" -> "£"; "USD" -> "$"; "EUR" -> "€"; else -> "" }
    }
    val totalLabel =
        if (priced.isEmpty()) stringResource(R.string.cost_pending_short)
        else "$symbol${"%.2f".format(total)}"

    Column(
        Modifier
            .fillMaxSize()
            .padding(top = statusBarPadding(), bottom = navBarPadding()),
    ) {
        ScreenHeader(title = stringResource(R.string.usage_title), onBack = onBack)

        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 24.dp),
        ) {
            // The balance, dark so it reads as the headline figure. This is the
            // number that decides whether the dial button works.
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(Ink.Text, RoundedCornerShape(16.dp))
                    .padding(horizontal = 16.dp, vertical = 18.dp),
            ) {
                Text(
                    stringResource(R.string.usage_balance_label),
                    style = Type.LabelSmall,
                    color = Ink.OnDarkMute,
                )
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        "${usage.balance}",
                        style = Type.Display,
                        color = if (usage.balance == 0) Ink.OnDarkMute else Ink.OnDark,
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        stringResource(R.string.usage_used_this_month, usage.used),
                        style = Type.Caption,
                        color = Ink.OnDarkMute,
                        modifier = Modifier.weight(1f).padding(bottom = 4.dp),
                    )
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    stringResource(
                        if (usage.balance == 0) R.string.usage_balance_empty
                        else R.string.usage_balance_note,
                    ),
                    style = Type.Tiny,
                    color = Ink.OnDarkMute,
                )
            }

            // --- the shop ---
            Spacer(Modifier.height(16.dp))
            GroupLabel(stringResource(R.string.usage_shop), modifier = Modifier.padding(bottom = 8.dp))

            // Paid for in-app, through Stripe's own sheet — no browser, no app
            // switch. Shown when the server has it on; the Play packs below
            // take over wherever Play Billing is the configured route.
            if (usage.inAppPacks.isNotEmpty()) {
                GroupedCard(
                    rows = usage.inAppPacks.map { pack ->
                        {
                            PackRow(
                                calls = pack.calls,
                                price = pack.price,
                                enabled = activity != null && payState == null,
                                onBuy = {
                                    payState = context.getString(R.string.usage_paying)
                                    vm.startInAppPayment(pack.priceId) { intent ->
                                        PaymentConfiguration.init(context, intent.publishableKey)
                                        paymentSheet.presentWithPaymentIntent(
                                            intent.clientSecret,
                                            PaymentSheet.Configuration.Builder("Mynah").build(),
                                        )
                                    }
                                },
                            )
                        }
                    },
                )
            }

            if (usage.packs.isEmpty() && usage.inAppPacks.isEmpty()) {
                Text(
                    stringResource(R.string.usage_shop_unavailable),
                    style = Type.Caption,
                    color = Ink.Mute,
                )
            } else if (usage.packs.isNotEmpty()) {
                GroupedCard(
                    rows = usage.packs.map { pack ->
                        {
                            PackRow(
                                calls = pack.calls,
                                // Absent until Play answers. Never a guess: a
                                // price that turns out wrong at the sheet is
                                // worse than one that arrives a moment late.
                                price = prices[pack.productId],
                                enabled = activity != null && billingState !is BillingState.Working,
                                onBuy = { activity?.let { vm.billing.buy(it, pack.productId) } },
                            )
                        }
                    },
                )
            }

            // The web route. Kept alongside the in-app packs rather than hidden
            // behind them: Play cannot offer WeChat Pay or Alipay on a UK
            // account, and for a good few of these users that is the payment
            // method they have. It is also the only route that works when
            // somebody else is paying — see the note under it.
            if (payOnWeb) {
                Spacer(Modifier.height(10.dp))
                GroupedCard(
                    rows = listOf {
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    stringResource(R.string.usage_other_ways),
                                    style = Type.RowTitle,
                                    color = Ink.Text,
                                )
                                Text(
                                    stringResource(R.string.usage_other_ways_sub),
                                    style = Type.RowSub,
                                    color = Ink.Body,
                                )
                            }
                            Spacer(Modifier.width(10.dp))
                            Text(
                                stringResource(R.string.usage_other_copy),
                                style = Type.LabelSmall,
                                color = Ink.Mute,
                                modifier = Modifier.clickableNoRipple {
                                    vm.topUpLink { url ->
                                        clipboard?.setPrimaryClip(
                                            ClipData.newPlainText("Mynah top-up", url),
                                        )
                                        copied = true
                                        // They may be sending this to somebody
                                        // else, who could pay within seconds.
                                        vm.watchForTopUp()
                                    }
                                },
                            )
                            Spacer(Modifier.width(16.dp))
                            Text(
                                stringResource(R.string.usage_other_open),
                                style = Type.LabelSmall,
                                color = Ink.Deep,
                                modifier = Modifier.clickableNoRipple {
                                    vm.topUpLink { url ->
                                        // Paying happens in the browser and the
                                        // credits arrive on a webhook, so there
                                        // is no result to come back with — the
                                        // balance is watched for instead.
                                        runCatching {
                                            context.startActivity(
                                                Intent(Intent.ACTION_VIEW, url.toUri()),
                                            )
                                            vm.watchForTopUp()
                                        }
                                    }
                                },
                            )
                        }
                    },
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    stringResource(
                        if (copied) R.string.usage_other_copied else R.string.usage_other_note,
                    ),
                    style = Type.Tiny,
                    color = if (copied) Ink.PositiveDeep else Ink.Mute,
                    modifier = Modifier.padding(horizontal = 4.dp),
                )
            }

            // The in-app sheet has its own word to say; the Play flow's notice
            // follows underneath it.
            val notice = payState?.let { it to Ink.Body } ?: when (val s = billingState) {
                is BillingState.Working -> stringResource(R.string.usage_working) to Ink.Body
                is BillingState.Bought ->
                    stringResource(R.string.usage_bought, usage.balance) to Ink.PositiveDeep
                is BillingState.Failed -> s.reason to Ink.NegativeDeep
                BillingState.Idle -> null
            }
            notice?.let { (message, colour) ->
                Spacer(Modifier.height(10.dp))
                Text(message, style = Type.Caption, color = colour, modifier = Modifier.padding(horizontal = 4.dp))
            }

            // --- what the month cost to run ---
            Spacer(Modifier.height(22.dp))
            GroupLabel(stringResource(R.string.usage_breakdown), modifier = Modifier.padding(bottom = 8.dp))

            if (thisMonth.isEmpty()) {
                Text(stringResource(R.string.usage_empty), style = Type.Caption, color = Ink.Mute)
            } else {
                val rows = buildList<@Composable () -> Unit> {
                    thisMonth.forEach { call -> add { UsageRow(call, symbol) } }
                    add { TotalRow(seconds, totalLabel) }
                }
                GroupedCard(rows = rows)
            }

            Spacer(Modifier.height(10.dp))
            Text(
                stringResource(R.string.usage_footnote),
                style = Type.Tiny,
                color = Ink.Mute,
                modifier = Modifier.padding(horizontal = 4.dp),
            )
        }
    }
}

/**
 * One top-up. The price is whatever Play hands back, already formatted in the
 * buyer's own currency — never built here from a number.
 */
@Composable
private fun PackRow(calls: Int, price: String?, enabled: Boolean, onBuy: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            stringResource(R.string.usage_pack_calls, calls),
            style = Type.RowTitle,
            color = Ink.Text,
            modifier = Modifier.weight(1f),
        )
        Box(
            Modifier
                .background(
                    if (enabled && price != null) Ink.Lime else Ink.CanvasSoft,
                    RoundedCornerShape(10.dp),
                )
                .then(if (enabled && price != null) Modifier.clickableNoRipple(onBuy) else Modifier)
                .padding(horizontal = 14.dp, vertical = 8.dp),
        ) {
            Text(
                price ?: stringResource(R.string.usage_pack_price_pending),
                style = Type.LabelSmall,
                color = if (enabled && price != null) Ink.OnLime else Ink.Mute,
            )
        }
    }
}

@Composable
private fun UsageRow(call: Call, symbol: String) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(shortDate(call.createdAt), style = Type.Tiny, color = Ink.Mute, modifier = Modifier.width(38.dp))
        Spacer(Modifier.width(10.dp))
        Text(
            call.businessName.ifBlank { call.phoneNumber },
            style = Type.ListItem,
            color = Ink.Text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(10.dp))
        Text(
            call.cost?.let { duration(it.durationSeconds) }.orEmpty(),
            style = Type.Mono,
            color = Ink.Mute,
        )
        Spacer(Modifier.width(10.dp))
        Text(
            // Blank rather than £0.00 while Twilio has not rated it: a real
            // zero and a not-yet-known are different things.
            call.cost?.let { "$symbol${it.price.toDoubleOrNull()?.let { p -> "%.2f".format(p) } ?: it.price}" }
                ?: stringResource(R.string.cost_pending_short),
            style = Type.Mono,
            color = if (call.cost != null) Ink.Text else Ink.Rim,
            modifier = Modifier.width(46.dp),
        )
    }
}

@Composable
private fun TotalRow(seconds: Int, totalLabel: String) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(stringResource(R.string.usage_total), style = Type.Value, color = Ink.Text, modifier = Modifier.weight(1f))
        Text(duration(seconds), style = Type.Mono, color = Ink.Mute)
        Spacer(Modifier.width(10.dp))
        Text(totalLabel, style = Type.MonoBody, color = Ink.Text)
    }
}

private fun duration(seconds: Int): String =
    if (seconds >= 60) "%dm %02ds".format(seconds / 60, seconds % 60) else "${seconds}s"

private fun shortDate(at: Long): String = Calendar.getInstance().apply { timeInMillis = at }.let {
    "%d/%d".format(it.get(Calendar.MONTH) + 1, it.get(Calendar.DAY_OF_MONTH))
}
