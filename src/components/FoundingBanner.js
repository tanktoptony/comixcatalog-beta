"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// initialRemaining comes from the server-rendered layout, computed fresh
// per request — this used to seed useState with a hardcoded 83, which every
// visitor briefly saw flash to the real count (e.g. 76) once this effect
// resolved. Never guess a number here: null means "don't know yet," and the
// banner stays hidden rather than show something that might be wrong.
export default function FoundingBanner({ initialRemaining = null }) {
  const [remaining, setRemaining] = useState(initialRemaining);

  useEffect(() => {
    fetch("/api/founding/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (Number.isFinite(data?.remaining)) setRemaining(data.remaining);
      })
      .catch(() => {});
  }, []);

  if (remaining == null || remaining < 1) return null;
  return (
    <div className="founding-banner" role="region" aria-label="Founding Collector offer">
      <div className="founding-banner-inner">
        <span className="founding-banner-count">{remaining}</span>
        <p><strong>free lifetime Pro memberships remain.</strong> Join now and yours is automatic—no card required.</p>
        <Link href="/signup" className="founding-banner-cta">Join free →</Link>
      </div>
    </div>
  );
}
