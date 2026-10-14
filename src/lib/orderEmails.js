import { resendBatch } from "./newsletter.js";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.comixcatalog.com").replace(/\/+$/, "");

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function title(order) {
  return `${order.series_title}${order.issue_number ? ` #${order.issue_number}` : ""}`;
}

function shipSummary(order) {
  const address = order.ship_to?.address || order.ship_to || {};
  return [address.city, address.state].filter(Boolean).join(", ");
}

export function orderEmailTemplate(order, event, recipientRole) {
  const book = escapeHtml(title(order));
  const link = `${SITE_URL}/orders/${encodeURIComponent(order.id)}`;
  const tracking = escapeHtml(order.tracking_number || "");
  const location = escapeHtml(shipSummary(order));
  const templates = {
    "paid:buyer": ["Order confirmed", `Your order for <strong>${book}</strong> is paid. The seller has the baton now.`],
    "paid:seller": [
      `You sold ${title(order)}`,
      `You sold <strong>${book}</strong>. Ship within 3 business days.${location ? ` Destination: ${location}.` : ""}`,
    ],
    "shipped:buyer": ["Your comic shipped", `<strong>${book}</strong> is on the move.${tracking ? ` Tracking: ${tracking}.` : ""}`],
    "delivered:seller": ["Order delivered", `<strong>${book}</strong> was marked delivered. Nice and tidy.`],
    "completed:seller": ["Payout scheduled", `The order for <strong>${book}</strong> is complete. Established sellers are paid after completion; new sellers are paid after completion or 14 days from payment, whichever is later.`],
    "refunded:buyer": ["Order refunded", `The order for <strong>${book}</strong> was refunded.`],
    "refunded:seller": ["Order refunded", `The order for <strong>${book}</strong> was refunded.`],
    "cancelled:buyer": ["Order cancelled", `The order for <strong>${book}</strong> was cancelled.`],
  };
  const selected = templates[`${event}:${recipientRole}`];
  if (!selected) return null;
  const [subject, body] = selected;
  return {
    subject,
    text: `${body.replace(/<[^>]+>/g, "")}\n\nView order: ${link}`,
    html: `<div style="font-family:Arial,sans-serif;color:#222;line-height:1.5"><p>${body}</p><p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:4px">View order</a></p><p style="font-size:12px;color:#666">Collector to collector, with ComixCatalog keeping the receipt.</p></div>`,
  };
}

export async function sendOrderEmails(db, order, event, { send = resendBatch } = {}) {
  const roles = event === "paid" || event === "refunded"
    ? ["buyer", "seller"]
    : event === "shipped" || event === "cancelled"
      ? ["buyer"]
      : event === "delivered" || event === "completed"
        ? ["seller"]
        : [];
  for (const role of roles) {
    if (event === "cancelled" && !order.checkout_expires_at) continue;
    const recipientId = order[`${role}_id`];
    const template = orderEmailTemplate(order, event, role);
    if (!recipientId || !template) continue;
    const { data: claimed, error: claimError } = await db.rpc("mkt_claim_order_email", {
      p_order: order.id,
      p_event: event,
      p_recipient: recipientId,
    });
    if (claimError) throw claimError;
    if (!claimed) continue;
    const { data, error } = await db.auth.admin.getUserById(recipientId);
    if (error) throw error;
    if (!data?.user?.email) continue;
    await send([{ to: data.user.email, ...template }]);
  }
}
