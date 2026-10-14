export const ORDER_STATUSES = Object.freeze([
  "created",
  "awaiting_payment",
  "paid",
  "shipped",
  "delivered",
  "completed",
  "cancelled",
  "refunded",
  "disputed",
]);

export const TRANSITIONS = Object.freeze([
  { from: "created", to: "awaiting_payment", roles: ["system"] },
  { from: "created", to: "cancelled", roles: ["buyer", "seller", "system"] },
  { from: "awaiting_payment", to: "cancelled", roles: ["buyer", "seller", "system"] },
  { from: "awaiting_payment", to: "paid", roles: ["stripe"] },
  { from: "cancelled", to: "refunded", roles: ["stripe"] },
  { from: "paid", to: "shipped", roles: ["seller"] },
  { from: "paid", to: "refunded", roles: ["seller", "admin"] },
  { from: "shipped", to: "delivered", roles: ["buyer", "system"] },
  { from: "delivered", to: "completed", roles: ["system"] },
  { from: "shipped", to: "disputed", roles: ["buyer", "stripe"] },
  { from: "delivered", to: "disputed", roles: ["buyer", "stripe"] },
  { from: "paid", to: "disputed", roles: ["stripe"] },
  { from: "completed", to: "disputed", roles: ["stripe"] },
  { from: "disputed", to: "completed", roles: ["admin", "stripe"] },
  { from: "disputed", to: "refunded", roles: ["admin", "stripe"] },
  { from: "shipped", to: "refunded", roles: ["admin", "stripe"] },
  { from: "delivered", to: "refunded", roles: ["admin", "stripe"] },
  { from: "completed", to: "refunded", roles: ["admin", "stripe"] },
]);

export const FEE_CONFIG = Object.freeze({
  platform_fee_bps: 0,
  processing_fee_bps: 290,
  processing_fee_fixed_cents: 30,
  reservation_minutes: 35,
  auto_deliver_days: 14,
  complete_after_delivery_days: 3,
  tracking_required_cents: 5000,
  ship_to_retention_days: 120,
});

export function canTransition(from, to, role) {
  return TRANSITIONS.some((edge) => edge.from === from && edge.to === to && edge.roles.includes(role));
}

export function computeOrderAmounts({ priceCents, shippingCents, taxCents = 0 }) {
  const item = priceCents;
  const shipping = shippingCents ?? 0;
  const tax = taxCents;
  const total = item + shipping + tax;
  const platformFee = Math.round((total * FEE_CONFIG.platform_fee_bps) / 10000);
  const processingFee = Math.round((total * FEE_CONFIG.processing_fee_bps) / 10000)
    + FEE_CONFIG.processing_fee_fixed_cents;
  return {
    item,
    shipping,
    tax,
    total,
    platformFee,
    processingFee,
    sellerNet: total - tax - platformFee - processingFee,
  };
}

const STATUS_LABELS = Object.freeze({
  created: "Created",
  awaiting_payment: "Awaiting payment",
  paid: "Paid",
  shipped: "Shipped",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  disputed: "Disputed",
});

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}
