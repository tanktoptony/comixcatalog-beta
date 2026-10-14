export class RefundPersistenceError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "RefundPersistenceError";
    this.code = "REFUND_PERSISTENCE_FAILED";
  }
}

export async function refundOrder({ db, stripe, order, amountCents, reason, actorId, actorRole, notifyAdmin }) {
  const remaining = order.total_cents - order.refunded_cents;
  if (!Number.isInteger(amountCents) || amountCents < 1 || amountCents > remaining) {
    throw new RangeError("Refund amount must be between 1 cent and the remaining order total.");
  }
  if (String(reason || "").trim().length < 3) {
    throw new TypeError("Refund reason must be at least 3 characters.");
  }
  const key = `refund-${order.id}-${order.refunded_cents}-${amountCents}`;
  const refund = await stripe.refunds.create({
    payment_intent: order.stripe_payment_intent_id,
    amount: amountCents,
    metadata: { order_id: order.id },
  }, { idempotencyKey: key });
  let reversal = null;
  if (order.stripe_transfer_id) {
    const sellerShare = Math.max(0, order.seller_net_cents - order.refunded_cents);
    reversal = await stripe.transfers.createReversal(order.stripe_transfer_id, {
      amount: Math.min(amountCents, sellerShare),
      metadata: { order_id: order.id },
    }, { idempotencyKey: `${key}-reversal` });
  }
  const { data, error } = await db.rpc("order_record_refund", {
    p_order: order.id,
    p_amount: amountCents,
    p_reason: reason.trim(),
    p_actor: actorId,
    p_actor_role: actorRole,
    p_stripe_refund_id: refund.id,
    p_transfer_reversal_id: reversal?.id || null,
  });
  if (error) {
    await notifyAdmin(`Stripe refund ${refund.id} succeeded for order ${order.id}, but database recording failed: ${error.message || error}`);
    throw new RefundPersistenceError("Stripe succeeded, but the refund could not be recorded.", { cause: error });
  }
  return data;
}
