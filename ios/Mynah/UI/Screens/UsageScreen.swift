import SwiftUI
import UIKit

/// What is left to spend, what a top-up costs, and what this month has run to.
///
/// The money on this screen is deliberately two different things kept apart.
/// The headline is calls — the unit anybody actually buys and spends. Below it,
/// unchanged, is what those calls cost us to run, itemised per call: that is not
/// a bill, and the footnote says so. Showing it is a choice — most services hide
/// their margin — but this app asks people to trust it with a phone line, and a
/// cost breakdown they can check against their own call list is worth more than
/// the margin is worth concealing.
///
/// One route to pay, not three. Android sells packs through Play's billing
/// library and through Stripe's own sheet; here the payment page is the whole
/// shop. An in-app sheet needs Stripe's SDK, and a StoreKit purchase needs a
/// server endpoint that checks a receipt with Apple — neither exists yet, and a
/// button that collects money the server cannot verify is worse than a link that
/// works. The page also takes WeChat Pay and Alipay, and is the only route that
/// lets somebody else pay.
struct UsageScreen: View {
    @ObservedObject var model: CallsViewModel
    let onBack: () -> Void

    @State private var copied = false
    @State private var now = Date()

    private var monthStart: Date {
        let parts = Calendar.current.dateComponents([.year, .month], from: now)
        return Calendar.current.date(from: parts) ?? now
    }

    private var thisMonth: [Call] {
        let start = Int(monthStart.timeIntervalSince1970 * 1000)
        return model.calls.filter { $0.createdAt >= start }.sorted { $0.createdAt > $1.createdAt }
    }

    private var priced: [(call: Call, cost: Cost)] {
        thisMonth.compactMap { call in call.cost.map { (call, $0) } }
    }

    /// The currency is whatever Twilio rated in, so it is only known once at
    /// least one call has been rated.
    private var symbol: String {
        switch (priced.first?.cost.unit ?? "").uppercased() {
        case "GBP": "£"
        case "USD": "$"
        case "EUR": "€"
        default: ""
        }
    }

    /// Until then there is no total to show: a bare "0.00" reads as "this month
    /// was free" when it means "not priced yet".
    private var totalLabel: String {
        guard !priced.isEmpty else { return t("cost_pending_short") }
        let total = priced.reduce(0.0) { $0 + (Double($1.cost.price) ?? 0) }
        return "\(symbol)\(String(format: "%.2f", total))"
    }

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(t("usage_title"), onBack: onBack)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    balanceCard

                    // --- the shop ---
                    Spacer().frame(height: 16)
                    GroupLabel(t("usage_shop")).padding(.bottom, 8)

                    let packs = model.usage.inAppPacks
                    if packs.isEmpty, model.usage.packs.isEmpty, !model.usage.webPay {
                        Text(t("usage_shop_unavailable"))
                            .wise(Type.caption)
                            .foregroundStyle(Ink.mute)
                            .fixedSize(horizontal: false, vertical: true)
                    } else if !packs.isEmpty {
                        GroupedCard {
                            ForEach(packs) { pack in
                                PackRow(calls: pack.calls, price: pack.price, onBuy: openPaymentPage)
                            }
                        }
                    } else if !model.usage.packs.isEmpty {
                        // No price attached: those come from Play on Android and
                        // there is nothing here to ask. The page shows them.
                        GroupedCard {
                            ForEach(model.usage.packs) { pack in
                                PackRow(calls: pack.calls, price: nil, onBuy: openPaymentPage)
                            }
                        }
                    }

                    if model.usage.webPay {
                        Spacer().frame(height: 10)
                        GroupedCard { payRow }
                        Spacer().frame(height: 8)
                        Text(t(copied ? "usage_other_copied" : "usage_other_note"))
                            .wise(Type.tiny)
                            .foregroundStyle(copied ? Ink.positiveDeep : Ink.mute)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, 4)
                    }

                    // --- what the month cost to run ---
                    Spacer().frame(height: 22)
                    GroupLabel(t("usage_breakdown")).padding(.bottom, 8)

                    if thisMonth.isEmpty {
                        Text(t("usage_empty"))
                            .wise(Type.caption)
                            .foregroundStyle(Ink.mute)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        GroupedCard {
                            ForEach(thisMonth) { call in
                                UsageRow(call: call, symbol: symbol)
                            }
                            TotalRow(
                                seconds: priced.reduce(0) { $0 + $1.cost.durationSeconds },
                                total: totalLabel
                            )
                        }
                    }

                    Spacer().frame(height: 10)
                    Text(t("usage_footnote"))
                        .wise(Type.tiny)
                        .foregroundStyle(Ink.mute)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 4)
                }
                .padding(.horizontal, 20)
                .padding(.top, 14)
                .padding(.bottom, 24)
            }
        }
        .navigationBarBackButtonHidden()
        .onAppear {
            model.refresh(quiet: true)
            model.loadUsage()
        }
        // Nothing to watch for once nobody is looking at the balance.
        .onDisappear { model.stopWatchingForTopUp() }
    }

    /// The balance, dark so it reads as the headline figure. This is the number
    /// that decides whether the dial button works.
    private var balanceCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(t("usage_balance_label")).wise(Type.labelSmall).foregroundStyle(Ink.onDarkMute)
            Spacer().frame(height: 10)
            HStack(alignment: .lastTextBaseline, spacing: 10) {
                Text("\(model.usage.balance)")
                    .wise(Type.display)
                    .foregroundStyle(model.usage.balance == 0 ? Ink.onDarkMute : Ink.onDark)
                Text(t("usage_used_this_month", model.usage.used))
                    .wise(Type.caption)
                    .foregroundStyle(Ink.onDarkMute)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Spacer().frame(height: 10)
            Text(t(model.usage.balance == 0 ? "usage_balance_empty" : "usage_balance_note"))
                .wise(Type.tiny)
                .foregroundStyle(Ink.onDarkMute)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 18)
        .background(Ink.text, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    /// The web route: it is the only one that works when somebody else is
    /// paying — a parent abroad with no UK card is the case it exists for.
    private var payRow: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Text(t("usage_other_ways")).wise(Type.rowTitle).foregroundStyle(Ink.text)
                Text(t("usage_other_ways_sub"))
                    .wise(Type.rowSub)
                    .foregroundStyle(Ink.body)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Spacer().frame(width: 10)
            Text(t("usage_other_copy"))
                .wise(Type.labelSmall)
                .foregroundStyle(Ink.mute)
                .contentShape(Rectangle())
                .onTapGesture {
                    model.topUpLink { url in
                        UIPasteboard.general.string = url
                        copied = true
                        // They may be sending this to somebody else, who could
                        // pay within seconds.
                        model.watchForTopUp()
                    }
                }
            Spacer().frame(width: 16)
            Text(t("usage_other_open"))
                .wise(Type.labelSmall)
                .foregroundStyle(Ink.deep)
                .contentShape(Rectangle())
                .onTapGesture(perform: openPaymentPage)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    /// Paying happens in the browser and the credits arrive on a webhook, so
    /// there is no result to come back with — the balance is watched instead.
    private func openPaymentPage() {
        model.topUpLink { url in
            guard let link = URL(string: url) else { return }
            UIApplication.shared.open(link)
            model.watchForTopUp()
        }
    }
}

/// One top-up. The price is whatever the server hands back, already formatted —
/// never built here from a number.
private struct PackRow: View {
    let calls: Int
    let price: String?
    let onBuy: () -> Void

    var body: some View {
        HStack {
            Text(t("usage_pack_calls", calls))
                .wise(Type.rowTitle)
                .foregroundStyle(Ink.text)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(price?.nilIfBlank ?? t("usage_pack_price_pending"))
                .wise(Type.labelSmall)
                .foregroundStyle(price?.isNotBlank == true ? Ink.onLime : Ink.mute)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(
                    price?.isNotBlank == true ? Ink.lime : Ink.canvasSoft,
                    in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                )
                .contentShape(Rectangle())
                .onTapGesture { if price?.isNotBlank == true { onBuy() } }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }
}

private struct UsageRow: View {
    let call: Call
    let symbol: String

    var body: some View {
        HStack(spacing: 0) {
            Text(shortDate(call.createdAt))
                .wise(Type.tiny)
                .foregroundStyle(Ink.mute)
                .frame(width: 38, alignment: .leading)
            Spacer().frame(width: 10)
            Text(call.businessName.isBlank ? call.phoneNumber : call.businessName)
                .wise(Type.listItem)
                .foregroundStyle(Ink.text)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            Spacer().frame(width: 10)
            Text(call.cost.map { durationLabel($0.durationSeconds) } ?? "")
                .wise(Type.mono)
                .foregroundStyle(Ink.mute)
            Spacer().frame(width: 10)
            // Blank rather than £0.00 while Twilio has not rated it: a real zero
            // and a not-yet-known are different things.
            Text(money)
                .wise(Type.mono)
                .foregroundStyle(call.cost != nil ? Ink.text : Ink.rim)
                .frame(width: 46, alignment: .trailing)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var money: String {
        guard let cost = call.cost else { return t("cost_pending_short") }
        guard let amount = Double(cost.price) else { return "\(symbol)\(cost.price)" }
        return "\(symbol)\(String(format: "%.2f", amount))"
    }

    private func shortDate(_ at: Int) -> String {
        let parts = Calendar.current.dateComponents(
            [.month, .day], from: Date(timeIntervalSince1970: Double(at) / 1000)
        )
        return "\(parts.month ?? 0)/\(parts.day ?? 0)"
    }
}

private struct TotalRow: View {
    let seconds: Int
    let total: String

    var body: some View {
        HStack(spacing: 10) {
            Text(t("usage_total"))
                .wise(Type.value)
                .foregroundStyle(Ink.text)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(durationLabel(seconds)).wise(Type.mono).foregroundStyle(Ink.mute)
            Text(total).wise(Type.monoBody).foregroundStyle(Ink.text)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}
