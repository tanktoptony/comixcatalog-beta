import { sendOrderEmails } from "./orderEmails.js";

function addBusinessDays(value, days) {
  const date = new Date(value);
  let left = days;
  while (left > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) left--;
  }
  return date;
}

export function orderSystemText(order, event) {
  if (event === "paid") {
    const shipBy = addBusinessDays(order.paid_at || new Date(), 3).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    return `Order paid. Seller, ship by ${shipBy}.`;
  }
  if (event === "shipped") {
    const tracking = order.tracking_number ? ` Tracking: ${order.tracking_number}.` : "";
    return `Order shipped.${tracking}`;
  }
  const messages = {
    delivered: "Order delivered.",
    completed: "Order completed.",
    refunded: "Order refunded.",
    cancelled: "Order cancelled.",
  };
  return messages[event] || null;
}

export async function postOrderSystemMessage(db, order, text) {
  const { error } = await db.from("messages").insert({
    sender_id: order.seller_id,
    recipient_id: order.buyer_id,
    order_id: order.id,
    body: text,
    is_system: true,
  });
  if (error) throw error;
}

export async function afterOrderTransition(db, order, event, dependencies = {}) {
  if (!order?.id) return;
  try {
    const text = orderSystemText(order, event);
    if (text) await postOrderSystemMessage(db, order, text);
  } catch (error) {
    console.error(`Order ${order.id} system message failed:`, error);
  }
  try {
    await sendOrderEmails(db, order, event, dependencies);
  } catch (error) {
    console.error(`Order ${order.id} email failed:`, error);
  }
}
