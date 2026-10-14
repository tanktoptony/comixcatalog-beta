export const MESSAGE_URL_REGEX = /(?:https?:\/\/|www\.)\S+/i;

export function containsMessageUrl(body) {
  return typeof body === "string" && MESSAGE_URL_REGEX.test(body);
}

const OFF_PLATFORM_TERMS = [
  ["Friends and Family", /\b(?:friends?\s*(?:and|&)\s*family|f\s*&\s*f|fnf)\b/i],
  ["Zelle", /\bzelle\b/i],
  ["Venmo", /\bvenmo\b/i],
  ["Cash App", /\bcash\s*app\b|\$[a-z][a-z0-9_]{1,19}\b/i],
  ["wire transfer", /\b(?:wire\s+(?:transfer|money|payment)|bank\s+wire)\b/i],
  ["Western Union", /\bwestern\s+union\b/i],
  ["MoneyGram", /\bmoney\s*gram\b/i],
  ["crypto", /\b(?:crypto|bitcoin|btc|eth|usdt)\b/i],
  ["gift card", /\bgift\s+cards?\b/i],
];

export function findOffPlatformPaymentTerms(body) {
  if (typeof body !== "string") return [];
  return OFF_PLATFORM_TERMS
    .filter(([, pattern]) => pattern.test(body))
    .map(([term]) => term);
}
