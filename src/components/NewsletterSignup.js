"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

// One newsletter form, used wherever a signup surface lives (footer,
// /newsletter page, later post-signup and blog). `source` is stored on the
// subscriber row so placements can be compared; keep it in the allowlist in
// src/app/api/newsletter/route.js.
export default function NewsletterSignup({ source = "footer", compact = false, className = "" }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");

  async function subscribe(event) {
    event.preventDefault();
    if (state === "busy") return;
    setState("busy");
    setMessage("");
    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Signup failed");
      trackEvent("newsletter_subscribed", { source });
      setEmail("");
      setState("done");
      setMessage("You're on the list. Welcome.");
    } catch (error) {
      setState("error");
      setMessage(error.message);
    }
  }

  return (
    <form onSubmit={subscribe} className={`footer-newsletter-form ${className}`.trim()} aria-label="Newsletter signup">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="footer-newsletter-input"
        autoComplete="email"
        aria-label="Email address"
        disabled={state === "busy" || state === "done"}
      />
      <button type="submit" className="footer-newsletter-btn" disabled={state === "busy" || state === "done"}>
        {state === "busy" ? "…" : state === "done" ? "Done" : compact ? "Join" : "Subscribe"}
      </button>
      {message ? (
        <p className={`footer-newsletter-msg ${state === "error" ? "is-error" : ""}`} role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
