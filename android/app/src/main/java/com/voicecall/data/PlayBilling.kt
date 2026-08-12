package com.voicecall.data

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ConsumeParams
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryProductDetailsResult
import com.android.billingclient.api.QueryPurchasesParams
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Where a top-up has got to. [Bought] carries the calls that just landed. */
sealed interface BillingState {
    data object Idle : BillingState
    data object Working : BillingState
    data class Bought(val calls: Int) : BillingState
    data class Failed(val reason: String) : BillingState
}

/**
 * Buying calls through Google Play.
 *
 * The order of operations is the whole design, and it is deliberately the
 * cautious one: Play takes the money, this server is told and credits the
 * account, and only once it has confirmed is the purchase consumed. Consuming
 * is what makes a product buyable again, so it is also what throws the receipt
 * away — do it first and a failure in between leaves somebody charged with
 * nothing to show and no way to prove it.
 *
 * Left unconsumed, a purchase is still sitting in Play's records next launch,
 * which is what [recover] is for. That makes double-delivery the normal case
 * rather than an edge case, so the server credits an order id exactly once
 * however many times it is sent.
 *
 * @param deliver hands the purchase to the server, and answers with the calls
 *   now on the account, or null if it could not be delivered. A number means
 *   the credits are there — and only then is the purchase consumed.
 */
class PlayBilling(
    context: Context,
    private val scope: CoroutineScope,
    private val deliver: suspend (productId: String, purchaseToken: String) -> Int?,
) {
    private val _state = MutableStateFlow<BillingState>(BillingState.Idle)
    val state: StateFlow<BillingState> = _state.asStateFlow()

    /** Product id to the price as Play formats it, in the buyer's own currency. */
    private val _prices = MutableStateFlow<Map<String, String>>(emptyMap())
    val prices: StateFlow<Map<String, String>> = _prices.asStateFlow()

    private val details = mutableMapOf<String, ProductDetails>()

    /** One purchase delivered at a time; recovery and a fresh buy can overlap. */
    private val gate = Mutex()

    // Typed explicitly: the listener below reaches back into settle(), which
    // uses this same client, and Kotlin cannot infer its way round that circle.
    private val client: BillingClient = BillingClient.newBuilder(context)
        .setListener { result, purchases ->
            when {
                result.responseCode == BillingClient.BillingResponseCode.USER_CANCELED ->
                    _state.value = BillingState.Idle
                result.responseCode != BillingClient.BillingResponseCode.OK ->
                    _state.value = BillingState.Failed(readable(result))
                else -> scope.launch { purchases.orEmpty().forEach { settle(it) } }
            }
        }
        // Without this, Play rejects the purchase flow for one-time products
        // outright. Pending purchases are real — paying in cash at a shop is a
        // supported payment method in several countries — and settle() below
        // leaves them alone until they complete.
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder().enableOneTimeProducts().build(),
        )
        // Play's service can be restarted under a running app; without this,
        // every call after that returns SERVICE_DISCONNECTED until the app is
        // restarted too.
        .enableAutoServiceReconnection()
        .build()

    private suspend fun connect(): Boolean {
        if (client.isReady) return true
        val ready = CompletableDeferred<Boolean>()
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                ready.complete(result.responseCode == BillingClient.BillingResponseCode.OK)
            }

            // Auto-reconnection handles this; nothing is waiting on it here.
            override fun onBillingServiceDisconnected() {}
        })
        return ready.await()
    }

    /**
     * Asks Play what these packs cost. Prices are never assumed or stored: Play
     * knows the buyer's country, currency and any local tax, and it is the only
     * place a price can legitimately come from.
     */
    suspend fun loadPrices(productIds: List<String>) {
        if (productIds.isEmpty() || !connect()) return

        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(
                productIds.map {
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(it)
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build()
                },
            )
            .build()

        val answered = CompletableDeferred<QueryProductDetailsResult?>()
        client.queryProductDetailsAsync(params) { result, found ->
            answered.complete(
                if (result.responseCode == BillingClient.BillingResponseCode.OK) found else null,
            )
        }

        val list = answered.await()?.productDetailsList.orEmpty()
        details.putAll(list.associateBy { it.productId })
        _prices.value = list.mapNotNull { product ->
            product.oneTimePurchaseOfferDetails?.formattedPrice?.let { product.productId to it }
        }.toMap()
    }

    /**
     * Opens Play's purchase sheet. The result does not come back here — it
     * arrives at the listener above, which is also where a purchase completed
     * on another device or after a restart turns up.
     */
    fun buy(activity: Activity, productId: String) {
        val product = details[productId]
        if (product == null) {
            _state.value = BillingState.Failed("That top-up is not available just now.")
            return
        }
        _state.value = BillingState.Working
        val params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(
                listOf(
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(product)
                        .build(),
                ),
            )
            .build()
        val result = client.launchBillingFlow(activity, params)
        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            _state.value = BillingState.Failed(readable(result))
        }
    }

    /**
     * Anything paid for but not yet delivered — the app closed mid-purchase,
     * the network went, a pending payment completed hours later. Called on
     * opening the plan screen, which is where somebody who was charged and got
     * nothing will go looking.
     */
    suspend fun recover() {
        if (!connect()) return
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP)
            .build()

        val answered = CompletableDeferred<List<Purchase>>()
        client.queryPurchasesAsync(params) { _, purchases -> answered.complete(purchases) }
        answered.await().forEach { settle(it) }
    }

    /** Verify with the server, then consume. Never the other way round. */
    private suspend fun settle(purchase: Purchase) = gate.withLock {
        // Still being paid for. It will arrive at the listener when it clears,
        // and recover() will find it in the meantime; either way there is
        // nothing to credit yet.
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) return@withLock

        val productId = purchase.products.firstOrNull() ?: return@withLock
        _state.value = BillingState.Working

        val credited = try {
            deliver(productId, purchase.purchaseToken)
        } catch (e: Exception) {
            // The purchase is untouched, so the next recover() tries again.
            _state.value = BillingState.Failed(e.message ?: "Could not reach the server.")
            return@withLock
        }
        // Refused rather than failed — the server has looked and will not credit
        // it. Back to idle, or the buttons stay disabled behind a spinner that
        // is waiting for something that is not coming.
        if (credited == null) {
            _state.value = BillingState.Idle
            return@withLock
        }

        val consumed = CompletableDeferred<BillingResult>()
        client.consumeAsync(
            ConsumeParams.newBuilder().setPurchaseToken(purchase.purchaseToken).build(),
        ) { result, _ -> consumed.complete(result) }
        // A failed consume is not worth telling anyone about: the credits are
        // already on the account, and the leftover purchase is picked up by the
        // next recover(), where the server recognises the order and adds
        // nothing.
        consumed.await()

        _state.value = BillingState.Bought(credited)
    }

    /** So a message about a purchase does not sit on screen for the next one. */
    fun clearState() { _state.value = BillingState.Idle }

    fun close() = client.endConnection()

    private fun readable(result: BillingResult): String = when (result.responseCode) {
        BillingClient.BillingResponseCode.BILLING_UNAVAILABLE ->
            "Google Play cannot take a payment on this device."
        BillingClient.BillingResponseCode.ITEM_UNAVAILABLE ->
            "That top-up is not available just now."
        BillingClient.BillingResponseCode.NETWORK_ERROR,
        BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE ->
            "Google Play could not be reached. Try again in a moment."
        BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED ->
            "That purchase is already going through."
        else -> result.debugMessage.ifBlank { "Google Play could not complete the purchase." }
    }
}
