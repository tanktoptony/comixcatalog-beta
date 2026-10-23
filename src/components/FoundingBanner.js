"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

// initialRemaining comes from the server-rendered layout, computed fresh
// per request — this used to seed useState with a hardcoded 83, which every
// visitor briefly saw flash to the real count (e.g. 76) once this effect
// resolved. Never guess a number here: null means "don't know yet," and the
// banner stays hidden rather than show something that might be wrong.
export default function FoundingBanner({ initialRemaining = null }) {
  const [remaining, setRemaining] = useState(initialRemaining);
  const pathname = usePathname();
  const { user, loading } = useAuth();

  useEffect(() => {
    fetch("/api/founding/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (Number.isFinite(data?.remaining)) setRemaining(data.remaining);
      })
      .catch(() => {});
  }, []);

  if (loading || user || remaining == null || remaining < 1) return null;
  // /start (the Instagram landing page) carries the founding offer in its
  // own section. Up here it would push the hero's signup CTA down on a phone
  // and send clicks to /signup without the funnel's return path.
  if (pathname === "/start") return null;
  return (
    <div className="founding-banner" role="region" aria-label="Founding Collector offer">
      <div className="founding-banner-inner">
        <p>
          <span className="founding-banner-count">{remaining}</span>{" "}
          <strong className="founding-banner-desktop-copy">free lifetime memberships remain.</strong>
          <strong className="founding-banner-mobile-copy">free lifetime spots left</strong>
          <span className="founding-banner-desktop-copy"> Join now and confirm your email, no card required.</span>
        </p>
        <span className="founding-banner-mobile-copy" aria-hidden="true">·</span>
        <Link href="/signup" className="founding-banner-cta">Join free →</Link>
      </div>
    </div>
  );
}
