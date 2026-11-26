const OPEN_ORDER_STATUSES = new Set([
  "created",
  "awaiting_payment",
  "paid",
  "shipped",
  "delivered",
  "disputed",
]);

export const ACCOUNT_ORDERS_MESSAGE =
  "Please finish or cancel your marketplace orders before deleting your account.";
export const ACCOUNT_MARKETPLACE_RECORDS_MESSAGE =
  "This account has marketplace records we have to keep. Contact support at comixcatalog@gmail.com to close it.";

export function accountDeletionDecision({
  openOrders = [],
  unpaidTransfers = [],
  openDisputes = [],
  orders = [],
  sellerAccounts = [],
  orderEmailLogs = [],
  orderFeedback = [],
  checkError = null,
} = {}) {
  if (checkError) {
    return {
      allowed: false,
      status: 503,
      message: "Could not check marketplace orders. Please try again.",
    };
  }

  const hasOpenOrder = openOrders.some((order) => OPEN_ORDER_STATUSES.has(order?.status));
  if (hasOpenOrder || unpaidTransfers.length > 0 || openDisputes.length > 0) {
    return { allowed: false, status: 409, message: ACCOUNT_ORDERS_MESSAGE };
  }

  if (
    orders.length > 0 ||
    sellerAccounts.length > 0 ||
    orderEmailLogs.length > 0 ||
    orderFeedback.length > 0
  ) {
    return {
      allowed: false,
      status: 409,
      message: ACCOUNT_MARKETPLACE_RECORDS_MESSAGE,
    };
  }

  return { allowed: true, status: 200, message: null };
}
