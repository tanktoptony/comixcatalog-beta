"use client";

import { useSearchParams } from "next/navigation";

// The one line under the hero that reports what a redirect just did. The hero
// itself already covers some states (a pending claim, a signed-out "you're
// in", a founder), so this stays quiet for those instead of repeating or
// contradicting them.
export default function FoundingQueryMessage({ signedIn = false, isFounder = false, pending = false, justClaimedSignedOut = false }) {
  const query = useSearchParams();
  const claim = query.get("claim");
  let message = "";
  if (query.get("claimed") === "1") {
    if (!justClaimedSignedOut) message = "You're in. Founding Collector pass claimed.";
  } else if (claim === "soldout") {
    message = "All 100 passes were claimed before you confirmed.";
  } else if (claim === "sent") {
    if (!pending && !isFounder) message = "Check your email to claim your founding pass. It's first come, first served, so confirm soon.";
  } else if (claim === "invalid" || claim === "expired") {
    if (!isFounder) {
      message = signedIn
        ? "That link has expired or was already used. Get a new one above."
        : "That link has expired or was already used. Log in to get a new one.";
    }
  }

  return message ? <p className="founding-message">{message}</p> : null;
}
