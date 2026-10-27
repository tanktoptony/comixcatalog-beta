import { addBusinessDays } from "./shipBy.js";

// One line per order on /orders saying where it stands for whoever is
// looking: the seller sees what they owe (ship by, payout), the buyer sees
// what to expect. tone drives the chip color: "action" (seller has to do
// something), "active" (in flight), "done", "closed" (cancelled/refunded),
// "problem" (dispute).

const day = (value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function money(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

export function orderTitle(order) {
  if (order.items?.length > 1) return `${order.items.length} books`;
  return `${order.series_title}${order.issue_number ? ` #${order.issue_number}` : ""}`;
}

export function orderGrade(order) {
  if (order.items?.length > 1) {
    return order.items.map((item) => `${item.series_title}${item.issue_number ? ` #${item.issue_number}` : ""}`).join(", ");
  }
  if (order.slab_company) return `${order.slab_company} ${order.grade_numeric || ""}`.trim();
  return order.condition || "Raw";
}

function shipBy(order) {
  const due = addBusinessDays(order.paid_at, 3);
  const label = due.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  // Late once the whole ship-by day (UTC) has passed.
  const late = Date.now() >= Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate() + 1);
  return { label, late };
}

function tracking(order) {
  if (!order.tracking_number) return "no tracking";
  const carrier = order.tracking_carrier && order.tracking_carrier !== "other" ? `${order.tracking_carrier.toUpperCase()} ` : "";
  return `${carrier}${order.tracking_number}`;
}

export function orderNextStep(order, role) {
  const seller = role === "selling";
  if (order.open_dispute || order.status === "disputed") {
    return { text: seller ? "Buyer opened a dispute. An admin is reviewing it." : "Dispute under review", tone: "problem" };
  }
  switch (order.status) {
    case "created":
    case "awaiting_payment":
      return { text: seller ? "Waiting on the buyer's payment" : "Checkout not finished", tone: "active" };
    case "paid": {
      const { label, late } = shipBy(order);
      if (seller) return { text: late ? `Ship by ${label}. Late, ship or message the buyer.` : `Ship by ${label}`, tone: "action" };
      return { text: `Seller ships by ${label}`, tone: "active" };
    }
    case "shipped":
      return { text: `Shipped ${day(order.shipped_at)}, ${tracking(order)}`, tone: "active" };
    case "delivered":
      return { text: `Delivered ${day(order.delivered_at)}${seller ? ". Payout follows completion." : ""}`, tone: "active" };
    case "completed": {
      const parts = [seller
        ? order.transferred_at ? `Payout sent ${day(order.transferred_at)}` : "Payout pending"
        : `Completed ${day(order.completed_at)}`];
      if (order.needs_feedback) parts.push("leave feedback");
      return { text: parts.join(", "), tone: order.needs_feedback ? "action" : "done" };
    }
    case "cancelled":
      return { text: order.paid_at ? `Cancelled ${day(order.cancelled_at)}` : seller ? "Buyer didn't finish checkout" : "Checkout not finished", tone: "closed" };
    case "refunded":
      return { text: `${money(order.refunded_cents || order.total_cents)} refunded ${day(order.refunded_at)}`, tone: "closed" };
    default:
      return { text: "", tone: "active" };
  }
}

// Counts for the strip above the list. Only orders in the current Stripe
// mode count, so test orders never inflate a live seller's numbers.
export function orderTotals(rows, role) {
  const live = rows.filter((row) => !row.test);
  const count = (status) => live.filter((row) => row.status === status).length;
  if (role === "selling") {
    return [
      { label: "To ship", value: count("paid") },
      { label: "On the way", value: count("shipped") + count("delivered") },
      { label: "Sold", value: count("completed") },
      { label: "Paid out", value: money(live.filter((row) => row.status === "completed" && row.transferred_at).reduce((sum, row) => sum + (row.seller_net_cents || 0), 0)) },
    ];
  }
  return [
    { label: "Awaiting shipment", value: count("paid") },
    { label: "On the way", value: count("shipped") },
    { label: "Received", value: count("delivered") + count("completed") },
  ];
}
