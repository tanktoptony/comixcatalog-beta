"use client";

import Link from "next/link";
import { useState } from "react";
import { authedFetch } from "@/lib/apiClient";

// One release on the pull list: cover, title, and Got it / Want. Shared by
// /pull-list and the signed-in home (Your shelf).
export default function PullListIssueCard({ item, onSaved }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function save(status) {
    setBusy(status);
    setError(null);
    try {
      const response = await authedFetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rows: [{ i: 0, gcd_issue_id: item.gcd_issue_id }] }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update your library.");
      onSaved?.(item.key, status);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(null);
    }
  }

  const title = `${item.series_title} #${item.issue_number}`;
  return (
    <article className={`pull-issue${item.owned ? " is-owned" : ""}`}>
      <div className="pull-cover-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.cover_url || "/fallback-cover.png"} alt="" />
      </div>
      {item.gcd_issue_id ? (
        <Link href={`/issue/${item.gcd_issue_id}`} className="pull-issue-title">{title}</Link>
      ) : (
        <strong className="pull-issue-title">{title}</strong>
      )}
      <span className="pull-issue-publisher">{item.publisher || "Publisher unknown"}</span>
      {item.gcd_issue_id ? (
        <div className="pull-issue-actions">
          {item.owned ? (
            <span className="pull-status">✓ In your collection</span>
          ) : item.wanted ? (
            <span className="pull-status">✓ On your wantlist</span>
          ) : (
            <>
              <button type="button" className="pull-action-primary" onClick={() => save("owned")} disabled={Boolean(busy)}>
                {busy === "owned" ? "Saving…" : "Got it"}
              </button>
              <button type="button" className="pull-action-secondary" onClick={() => save("wishlist")} disabled={Boolean(busy)}>
                {busy === "wishlist" ? "Saving…" : "Want"}
              </button>
            </>
          )}
        </div>
      ) : (
        <span className="pull-unresolved">Not in the catalog yet</span>
      )}
      {error && <span className="pull-card-error" role="alert">{error}</span>}
    </article>
  );
}
