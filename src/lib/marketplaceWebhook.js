import { verifyPaidSession } from "./checkoutSession.js";
import { afterOrderTransition } from "./orderEvents.js";

async function rpc(db, name, args) {
  const result = await db.rpc(name, args);
  if (result?.error) throw result.error;
  return result?.data;
}

async function orderById(db, id) {
  if (!id) return null;
  const { data, error } = await db.from("orders").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

async function orderForCharge(db, stripe, charge) {
  const direct = charge.transfer_group || charge.metadata?.order_id;
  let order = await orderById(db, direct);
  if (order || !charge.payment_intent) return order;
  const intent = await stripe.paymentIntents.retrieve(charge.payment_intent);
  order = await orderById(db, intent.metadata?.order_id);
  return order;
}

export async function transition(db, order, to, role, payload = {}, eventId = null) {
  const updated = await rpc(db, "order_transition", {
    p_order: order.id,
    p_to: to,
    p_actor_id: null,
    p_actor_role: role,
    p_payload: payload,
    p_request_id: null,
    p_stripe_event_id: eventId,
  });
  return updated || { ...order, ...payload, status: to };
}

export async function handlePaidSession(session, eventId, { db, stripe, notifyAdmin }) {
  const order = await orderById(db, session.metadata?.order_id);
  if (!order || order.status === "refunded") return;

  const verified = verifyPaidSession(session, order);
  if (!verified.ok) {
    if (session.payment_intent) {
      await stripe.refunds.create(
        { payment_intent: session.payment_intent },
        { idempotencyKey: `refund-mismatch-${order.id}` },
      );
    }
    if (order.status === "created" || order.status === "awaiting_payment") {
      const cancelled = await transition(db, order, "cancelled", "system", {}, eventId);
      await afterOrderTransition(db, cancelled, "cancelled");
      const refunded = await transition(db, order, "refunded", "stripe", {}, eventId);
      await afterOrderTransition(db, refunded, "refunded");
    }
    await notifyAdmin(`Marketplace payment mismatch for order ${order.id}: ${verified.reason}`);
    return;
  }

  if (order.status === "cancelled") {
    await stripe.refunds.create(
      { payment_intent: session.payment_intent },
      { idempotencyKey: `refund-late-${order.id}` },
    );
    const refunded = await transition(db, order, "refunded", "stripe", {}, eventId);
    await afterOrderTransition(db, refunded, "refunded");
    return;
  }
  if (order.status !== "awaiting_payment") return;

  const intent = await stripe.paymentIntents.retrieve(session.payment_intent, {
    expand: ["latest_charge"],
  });
  const fingerprint = typeof intent.latest_charge === "string"
    ? null
    : intent.latest_charge?.payment_method_details?.card?.fingerprint || null;
  let paid;
  try {
    paid = await transition(db, order, "paid", "stripe", {
      stripe_checkout_session_id: session.id,
      amount_total: session.amount_total,
      currency: session.currency,
      livemode: session.livemode,
      stripe_payment_intent_id: intent.id,
      stripe_charge_id: typeof intent.latest_charge === "string"
        ? intent.latest_charge
        : intent.latest_charge?.id,
      ship_to: session.collected_information?.shipping_details ?? session.shipping_details ?? null,
    }, eventId);
  } catch (error) {
    await notifyAdmin(`Marketplace paid transition failed for order ${order.id}: ${error?.message || error}`);
    throw error;
  }
  // The order is paid from here on. Nothing below may throw: a Stripe retry skips paid
  // orders, so a failure here would silently drop the paid emails.
  if (fingerprint) {
    try {
      const { error: fingerprintError } = await db
        .from("orders")
        .update({ card_fingerprint: fingerprint })
        .eq("id", order.id);
      if (fingerprintError) throw fingerprintError;
      const flag = await rpc(db, "mkt_flag_shared_card", {
        p_order: order.id,
      });
      if (flag) {
        await notifyAdmin(`Shared card fingerprint flagged for order ${order.id}: /admin/orders/${order.id}`);
      }
    } catch (error) {
      console.error(`Shared card check failed for order ${order.id}:`, error);
    }
  }
  await afterOrderTransition(db, paid, "paid");
}

export async function handleMarketplaceEvent(event, deps) {
  const object = event.data?.object || {};
  if (event.type.startsWith("checkout.session.") && object.metadata?.kind !== "marketplace_order") return;
  if (event.type === "checkout.session.completed") {
    return handlePaidSession(object, event.id, deps);
  }
  if (event.type === "checkout.session.expired") {
    const order = await orderById(deps.db, object.metadata?.order_id);
    if (order?.status === "awaiting_payment") {
      const cancelled = await transition(deps.db, order, "cancelled", "system", {}, event.id);
      await afterOrderTransition(deps.db, cancelled, "cancelled");
    }
    return;
  }
  if (event.type === "charge.refunded") {
    const order = await orderForCharge(deps.db, deps.stripe, object);
    if (!order) return;
    for (const refund of object.refunds?.data || []) {
      const { data: existing, error: lookupError } = await deps.db.from("order_refunds").select("id").eq("stripe_refund_id", refund.id).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) continue;
      await rpc(deps.db, "order_record_refund", {
        p_order: order.id,
        p_amount: refund.amount,
        p_reason: "stripe_dashboard",
        p_actor: null,
        p_actor_role: "stripe",
        p_stripe_refund_id: refund.id,
        p_transfer_reversal_id: null,
      });
    }
    return;
  }
  if (event.type.startsWith("charge.dispute.")) {
    const charge = typeof object.charge === "string" ? await deps.stripe.charges.retrieve(object.charge) : object.charge;
    const order = charge ? await orderForCharge(deps.db, deps.stripe, charge) : null;
    if (event.type === "charge.dispute.created") {
      if (!order) return;
      await rpc(deps.db, "order_record_chargeback", { p_order: order.id, p_stripe_dispute_id: object.id, p_event_id: event.id });
      await deps.notifyAdmin(`Chargeback opened for order ${order.id}: /admin/orders/${order.id}`);
      return;
    }
    if (event.type === "charge.dispute.updated") {
      if (order) await rpc(deps.db, "mkt_audit_stripe", { p_entity_id: order.id, p_action: event.type, p_event_id: event.id });
      return;
    }
    if (!order) return;
    try {
      await rpc(deps.db, "order_close_chargeback", { p_stripe_dispute_id: object.id, p_won: object.status === "won", p_event_id: event.id });
    } catch (error) {
      if (error?.code !== "P0002") throw error;
      await rpc(deps.db, "order_record_chargeback", { p_order: order.id, p_stripe_dispute_id: object.id, p_event_id: `${event.id}:created` });
      await rpc(deps.db, "order_close_chargeback", { p_stripe_dispute_id: object.id, p_won: object.status === "won", p_event_id: event.id });
    }
    // A lost chargeback after the seller was paid leaves the platform short until someone reverses the transfer.
    if (object.status !== "won" && order.stripe_transfer_id) {
      await deps.notifyAdmin(`Chargeback lost on order ${order.id} after payout ${order.stripe_transfer_id}. Reverse the transfer: /admin/orders/${order.id}`);
    }
    return;
  }
  if (event.type === "account.updated") {
    const account = await deps.stripe.accounts.retrieve(event.account || object.id);
    const { data: seller, error } = await deps.db
      .from("seller_accounts")
      .select("user_id")
      .eq("stripe_account_id", account.id)
      .maybeSingle();
    if (error) throw error;
    if (!seller) return;
    await rpc(deps.db, "mkt_upsert_seller_account", {
      p_user: seller.user_id,
      p_stripe_account_id: account.id,
      // Account objects carry no livemode; the event does.
      p_livemode: event.livemode === true,
      p_charges: account.charges_enabled,
      p_payouts: account.payouts_enabled,
      p_details: account.details_submitted,
      p_requirements: account.requirements?.currently_due || [],
    });
    return;
  }
  if (event.type === "account.external_account.created" || event.type === "account.external_account.updated") {
    await rpc(deps.db, "mkt_mark_bank_changed", { p_stripe_account_id: event.account });
    await deps.notifyAdmin(`Marketplace payout bank changed for ${event.account}`);
    return;
  }
  if (event.type === "transfer.reversed" || event.type === "payout.failed") {
    const candidate = object.transfer_group || object.metadata?.order_id;
    const orderId = /^[0-9a-f-]{36}$/i.test(candidate || "") ? candidate : null;
    if (orderId) {
      await rpc(deps.db, "mkt_audit_stripe", {
        p_entity_id: orderId,
        p_action: event.type,
        p_event_id: event.id,
      });
    }
    await deps.notifyAdmin(`Marketplace Stripe event: ${event.type}`);
  }
}
