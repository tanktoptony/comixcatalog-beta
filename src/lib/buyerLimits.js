export const BUYER_LIMIT_MESSAGES = Object.freeze({
  email_unverified: "Confirm your email before buying.",
  too_many_open: "Finish or cancel your open checkout first.",
  cooldown: "Too many unfinished checkouts. Try again tomorrow.",
  daily_limit: "That's the daily limit for checkouts. Try again tomorrow.",
  new_account_amount: "New accounts can buy up to $250 per order for the first week.",
});

export function buyerLimitMessage(error) {
  if (error?.code !== "54000") return null;
  const match = String(error.message || "").match(/buyer limit:\s*([a-z_]+)/i);
  return match ? BUYER_LIMIT_MESSAGES[match[1]] || null : null;
}
