import { sendFeedbackRequestEmails, sendOrderEmails } from "./orderEmails.js";
import { shipByLabel } from "./shipBy.js";

export function orderSystemText(order, event) {
  const first = order.items?.[0] || order;
  const book = `${first.series_title}${first.issue_number ? ` #${first.issue_number}` : ""}${order.items?.length > 1 ? ` and ${order.items.length - 1} more` : ""}`;
  if (event === "paid") {
    // Both sides read this note, and the inbox shows it as from ComixCatalog.
    return `${book} paid. The seller ships by ${shipByLabel(order.paid_at)}.`;
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
  if (!order.items) {
    try {
      const query = db.from("order_items").select("series_title,issue_number,cover_path,item_cents").eq("order_id", order.id);
      const { data } = await query;
      order.items = data || [];
    } catch {
      order.items = [];
    }
  }
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
