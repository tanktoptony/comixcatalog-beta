"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { conditionLabel, formatValue, offerHref } from "@/lib/marketplaceFormat";

// "Copies for Sale" on an issue page: marketplace listings for this exact
// catalog issue (src/lib/marketplace.js via /api/marketplace?gcd=).
export default function IssueForSale({ gcdIssueId }) {
  const [listings, setListings] = useState(null);

  useEffect(() => {
    if (gcdIssueId == null) return;
    let cancelled = false;
    fetch(`/api/marketplace?gcd=${gcdIssueId}`)
      .then((r) => (r.ok ? r.json() : { listings: [] }))
      .then((d) => {
        if (!cancelled) setListings(Array.isArray(d.listings) ? d.listings : []);
      })
      .catch(() => {
        if (!cancelled) setListings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [gcdIssueId]);

  return (
    <div className="metadata-section issue-for-sale" style={{ margin: 0, marginBottom: "22px" }}>
      <h3 className="issue-section-title">Copies for Sale</h3>
      {listings === null ? (
        <div className="muted" style={{ marginTop: "12px" }}>Checking the marketplace…</div>
      ) : listings.length === 0 ? (
        <div className="empty-state" style={{ marginTop: "12px" }}>
          No copies listed yet. <Link href="/library?tab=for_sale">Have one? List it.</Link>
        </div>
      ) : (
        <ul className="issue-sale-list">
          {listings.map((l) => (
            <li key={l.id} className="issue-sale-row">
              <Link prefetch={false} href={`/u/${encodeURIComponent(l.seller)}`} className="issue-sale-seller">
                @{l.seller}
              </Link>
              <span className="issue-sale-grade">{conditionLabel(l)}</span>
              <span className="issue-sale-price">
                {formatValue(l.estValue) ? `${formatValue(l.estValue)} est.` : "Open to offers"}
              </span>
              <Link prefetch={false} href={offerHref(l)} className="mkt-offer-btn">
                Make an offer
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
