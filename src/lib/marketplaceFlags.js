// Server use only. Keeping this pure lets the environment rules run under node:test.
export function checkoutMode(value = process.env.MARKETPLACE_CHECKOUT) {
  const mode = String(value || "off").trim().toLowerCase();
  return mode === "on" || mode === "allowlist" ? mode : "off";
}

export function canUseCheckout(userId, env = process.env) {
  const mode = checkoutMode(env.MARKETPLACE_CHECKOUT);
  if (mode === "on") return true;
  if (mode !== "allowlist" || !userId) return false;
  return String(env.MARKETPLACE_CHECKOUT_ALLOWLIST || "").split(",").map((id) => id.trim()).filter(Boolean).includes(userId);
}
