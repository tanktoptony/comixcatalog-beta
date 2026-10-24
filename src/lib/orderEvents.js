import { sendFeedbackRequestEmails, sendOrderEmails } from "./orderEmails.js";
import { shipByLabel } from "./shipBy.js";

export function orderSystemText(order, event) {
  if (event === "paid") {
    // Both sides read this note, and the inbox shows it as from ComixCatalog.
    return `Order paid. The seller ships by ${shipByLabel(order.paid_at)}.`;
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
    disputed: "A dispute was opened. Keep the details in this order thread.",
    dispute_resolved: "The order dispute was resolved.",
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
    if (event === "completed") await sendFeedbackRequestEmails(db, order, dependencies);
  } catch (error) {
    console.error(`Order ${order.id} email failed:`, error);
  }
}
