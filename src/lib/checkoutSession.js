function itemName(order) {
  const issue = order.issue_number ? ` #${order.issue_number}` : "";
  const label = order.slab_company
    ? `${order.slab_company}${order.grade_numeric ? ` ${order.grade_numeric}` : ""}`
    : order.condition || (order.grade_numeric ? `Grade ${order.grade_numeric}` : "");
  return `${order.series_title}${issue}${label ? `, ${label}` : ""}`;
}

export function buildCheckoutSessionParams(order, { siteUrl, now = Date.now() } = {}) {
  const product = { name: itemName(order) };
  if (/^https?:\/\//i.test(order.cover_path || "")) {
    product.images = [order.cover_path];
  }
  const line_items = [{
    price_data: { currency: "usd", product_data: product, unit_amount: order.item_cents },
    quantity: 1,
  }];
  if (order.shipping_cents > 0) {
    line_items.push({
      price_data: {
        currency: "usd",
        product_data: { name: "Shipping" },
        unit_amount: order.shipping_cents,
      },
      quantity: 1,
    });
  }
  return {
    mode: "payment",
    payment_method_types: ["card"],
    line_items,
    shipping_address_collection: { allowed_countries: ["US"] },
    client_reference_id: order.id,
    metadata: { order_id: order.id, kind: "marketplace_order" },
    payment_intent_data: {
      transfer_group: order.id,
      metadata: { order_id: order.id },
    },
    expires_at: Math.floor(now / 1000) + 31 * 60,
    success_url: `${siteUrl}/orders/${order.id}?checkout=success`,
    cancel_url: `${siteUrl}/listing/${order.listing_id}?checkout=cancelled`,
  };
}

export function verifyPaidSession(session, order) {
  const checks = [
    [session.id === order.stripe_checkout_session_id, "session"],
    [session.metadata?.order_id === order.id, "order"],
    [session.amount_total === order.total_cents, "amount"],
    [session.currency === order.currency, "currency"],
    [session.payment_status === "paid", "payment_status"],
    [session.livemode === order.livemode, "mode"],
  ];
  const failed = checks.find(([ok]) => !ok);
  return failed ? { ok: false, reason: failed[1] } : { ok: true, reason: null };
}
