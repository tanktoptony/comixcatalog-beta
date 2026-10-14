import { FEE_CONFIG } from "./orders.js";

export const TRACKING_CARRIERS = Object.freeze(["usps", "ups", "fedex", "dhl", "other"]);

const TRACKING_PATTERN = /^[A-Za-z0-9 -]{8,40}$/;

export function validateTracking({ carrier, tracking_number: trackingNumber }, totalCents) {
  const normalizedCarrier = typeof carrier === "string" ? carrier.trim().toLowerCase() : "";
  const normalizedNumber = typeof trackingNumber === "string" ? trackingNumber.trim() : "";
  const required = totalCents >= FEE_CONFIG.tracking_required_cents;

  if (!TRACKING_CARRIERS.includes(normalizedCarrier)) {
    return { ok: false, error: "Choose a shipping carrier." };
  }
  if (required && !normalizedNumber) {
    return { ok: false, error: "Tracking is required for orders of $50 or more." };
  }
  if (normalizedNumber && !TRACKING_PATTERN.test(normalizedNumber)) {
    return { ok: false, error: "Tracking must be 8 to 40 letters, numbers, spaces, or hyphens." };
  }
  return {
    ok: true,
    carrier: normalizedCarrier,
    trackingNumber: normalizedNumber || null,
  };
}

export function trackingUrl(carrier, number) {
  if (!number) return null;
  const value = encodeURIComponent(number.replaceAll(" ", ""));
  const urls = {
    usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${value}`,
    ups: `https://www.ups.com/track?tracknum=${value}`,
    fedex: `https://www.fedex.com/fedextrack/?trknbr=${value}`,
    dhl: `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${value}`,
  };
  return urls[carrier] || null;
}
