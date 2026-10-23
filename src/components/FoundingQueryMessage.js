"use client";

import { useSearchParams } from "next/navigation";

export default function FoundingQueryMessage() {
  const query = useSearchParams();
  const message = query.get("claimed") === "1"
    ? "You're in. Founding Collector pass claimed."
    : query.get("claim") === "soldout"
      ? "All 100 passes were claimed before you confirmed."
      : query.get("claim") === "sent"
        ? "Check your email to claim your founding pass. It's first come, first served, so confirm soon."
        : query.get("claim") === "invalid" || query.get("claim") === "expired"
          ? "That link has expired or was already used. Claim again below."
          : "";

  return message ? <p className="founding-message">{message}</p> : null;
}
