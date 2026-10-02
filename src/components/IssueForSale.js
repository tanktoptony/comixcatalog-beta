"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useLibrary } from "@/context/LibraryContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { authedFetch } from "@/lib/apiClient";
import { conditionLabel, formatValue, offerHref } from "@/lib/marketplaceFormat";

// "Copies for Sale" on an issue page: marketplace listings for this exact
// catalog issue (src/lib/marketplace.js via /api/marketplace?gcd=). If the
// viewer owns a copy, they can list it right here instead of being sent to
// their library.
export default function IssueForSale({ gcdIssueId }) {
  const { user } = useAuth();
  const { collections, refreshLibrary } = useLibrary();
  const [listings, setListings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (gcdIssueId == null) return () => {};
    let cancelled = false;
    fetch(`/api/marketplace?gcd=${gcdIssueId}`, { cache: "no-store" })
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

  useEffect(() => load(), [load]);

  // The viewer's own copies of this issue (owned or already for sale).
  const mine = (collections ?? []).filter(
    (c) => Number(c.gcd_issue_id) === Number(gcdIssueId) && (c.status === "owned" || c.status === "for_sale")
  );
  const myUnlisted = mine.find((c) => c.status === "owned");
  const myListed = mine.some((c) => c.status === "for_sale");

  async function listMyCopy() {
    if (!myUnlisted) return;
    setBusy(true);
    setError("");
    const { error: err } = await getSupabaseClient()
      .from("user_collections")
      .update({ status: "for_sale" })
      .eq("id", myUnlisted.id);
    if (err) {
      console.error("List from issue page failed:", err);
      setError("Couldn't list it. Please try again.");
      setBusy(false);
      return;
    }
    // The database creates the listing; this fills in its cover and
    // refreshes the marketplace so it shows up here right away.
    await authedFetch("/api/listings/sync", { method: "POST" }).catch(() => {});
    await refreshLibrary?.({ background: true });
    load();
    setBusy(false);
  }

  const others = (listings ?? []).filter((l) => !mine.some((m) => m.id === l.collectionId));

  return (
    <div className="metadata-section issue-for-sale" style={{ margin: 0, marginBottom: "22px" }}>
      <h3 className="issue-section-title">Copies for Sale</h3>

      {user && mine.length > 0 && (
        <div className="issue-sale-mine">
          {myListed ? (
            <>
              <span>Your copy is listed.</span>
              <Link href="/library?tab=for_sale" className="issue-sale-link">
                Manage in your library
              </Link>
            </>
          ) : (
            <>
              <span>You own this one.</span>
              <button type="button" className="issue-sale-cta" onClick={listMyCopy} disabled={busy}>
                {busy ? "Listing…" : "List your copy"}
              </button>
            </>
          )}
          {error && <span className="issue-sale-error">{error}</span>}
        </div>
      )}

      {listings === null ? (
        <div className="muted" style={{ marginTop: "12px" }}>Checking the marketplace…</div>
      ) : others.length === 0 ? (
        mine.length === 0 && (
          <p className="issue-sale-none">
            No copies for sale yet.{" "}
            <Link href="/marketplace" className="issue-sale-link">
              Browse the marketplace
            </Link>
          </p>
        )
      ) : (
        <ul className="issue-sale-list">
          {others.map((l) => (
            <li key={l.id} className="issue-sale-row">
              <Link prefetch={false} href={`/u/${encodeURIComponent(l.seller)}`} className="issue-sale-seller">
                @{l.seller}
              </Link>
              <span className="issue-sale-grade">{conditionLabel(l)}</span>
              <span className="issue-sale-price">
                {formatValue(l.price ?? l.estValue) ? `${formatValue(l.price ?? l.estValue)}${l.price == null ? " est." : ""}` : "Open to offers"}
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
