"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

// initialRemaining comes from the server-rendered layout, computed fresh
// per request. It only decides whether the banner shows: the count itself is
// never printed (Tony, 2026-10-27: no spots-left numbers anywhere). null
// means "don't know yet," and the banner stays hidden until it's known.
export default function FoundingBanner({ initialRemaining = null }) {
  const [remaining, setRemaining] = useState(initialRemaining);
  const pathname = usePathname();
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    fetch("/api/founding/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (Number.isFinite(data?.remaining)) setRemaining(data.remaining);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      delete document.documentElement.dataset.signedIn;
      delete document.documentElement.dataset.shelfReady;
    }
  }, [loading, user]);

  if (remaining == null || remaining < 1) return null;
  // /start (the Instagram landing page) carries the founding offer in its
  // own section. Up here it would push the hero's signup CTA down on a phone
  // and send clicks to /signup without the funnel's return path.
  if (pathname === "/start") return null;
  if (user) {
    // Signed in but no pass yet, which almost always means the confirm email
    // is sitting unclicked. "Check your email" only used to appear once, on
    // the page right after signup, in that one browser. Members who then
    // moved from Instagram's in-app browser to Chrome, or signed up from a
    // series or scan page, never saw it (Nov 3: an active member, on a second
    // browser a minute after signup, 5 hours in and still unclaimed).
    if (!profile || profile.is_founding_collector || pathname === "/founding-collectors") return null;
    return (
      <div className="founding-banner" role="region" aria-label="Finish claiming your Founding Collector pass">
        <div className="founding-banner-inner">
          <p>
            <strong className="founding-banner-desktop-copy">One more step to your Founding Collector pass.</strong>
            <strong className="founding-banner-mobile-copy">One more step to your founding pass</strong>
            <span className="founding-banner-desktop-copy"> Confirm your email and it&rsquo;s yours.</span>
          </p>
          <span className="founding-banner-mobile-copy" aria-hidden="true">·</span>
          <Link href="/founding-collectors" className="founding-banner-cta">Finish →</Link>
        </div>
      </div>
    );
  }
  // Render the guest offer before auth resolves so it is present in server HTML.
  return (
    <div className="founding-banner founding-banner-guest" role="region" aria-label="Founding Collector offer">
      <div className="founding-banner-inner">
        <p>
          <strong className="founding-banner-desktop-copy">Free lifetime memberships for the first 100.</strong>
          <strong className="founding-banner-mobile-copy">Free lifetime spots for the first 100</strong>
          <span className="founding-banner-desktop-copy"> Join now and confirm your email, no card required.</span>
        </p>
        <span className="founding-banner-mobile-copy" aria-hidden="true">·</span>
        <Link href="/signup" className="founding-banner-cta">Join free →</Link>
      </div>
    </div>
  );
}
