"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { trackEvent } from "@/lib/analytics";
import { pickHouseAd } from "@/lib/houseAds";

// A named ad position. Today every position serves a house ad from
// src/lib/houseAds.js; the point of the component is that the positions
// exist and are measured, so anything that replaces a house ad later (a
// sponsor, an affiliate campaign, a network) slots in without page edits.
//
// `pageKey` varies the pick per page (series id, search term) so a visitor
// browsing around sees the inventory rotate instead of one ad everywhere.
//
// Tracking: house_ad_view once per mount, house_ad_click on the link. The
// ratio is the CTR per creative per position, which is the number that
// decides what stays in rotation.
export default function AdSlot({ position, pageKey = "", className = "" }) {
  const { user, isPro, isFounding, loading } = useAuth();
  const ad = loading
    ? null
    : pickHouseAd({ position, pageKey, viewer: { user, isPro, isFounding } });

  useEffect(() => {
    if (!ad) return;
    trackEvent("house_ad_view", { position, campaign: ad.id, logged_in: Boolean(user) });
    // Once per (ad, position); `user` is read for the param only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad?.id, position]);

  if (!ad) return null;

  return (
    <aside
      className={`ad-slot ${className}`.trim()}
      data-position={position}
      data-campaign={ad.id}
      aria-label="From ComixCatalog"
    >
      <Link
        href={ad.href}
        className="ad-slot-link"
        onClick={() =>
          trackEvent("house_ad_click", { position, campaign: ad.id, logged_in: Boolean(user) })
        }
      >
        <div className="ad-slot-text">
          <span className="ad-slot-kicker">{ad.kicker}</span>
          <span className="ad-slot-headline">{ad.headline}</span>
          <span className="ad-slot-body">{ad.body}</span>
        </div>
        <span className="ad-slot-cta">{ad.cta} →</span>
      </Link>
    </aside>
  );
}
