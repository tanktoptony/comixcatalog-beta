"use client";

// Thin wrapper around gtag's event API. GA itself is loaded conditionally
// (production only — see src/app/layout.js), so this guards against gtag
// not existing at all (local dev, ad blockers, GA still loading).
export function trackEvent(name, params = {}) {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}
