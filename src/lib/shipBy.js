// Sellers ship within 3 business days of payment. Shared by the order
// thread note (orderEvents.js) and the seller's "To ship" card.
export function addBusinessDays(value, days) {
  const date = new Date(value);
  let left = days;
  while (left > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) left--;
  }
  return date;
}

export function shipByLabel(paidAt) {
  return addBusinessDays(paidAt || new Date(), 3).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
