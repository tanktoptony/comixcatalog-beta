"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/apiClient";

export default function CollectionReconcileReview({ enabled, onChanged }) {
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    authedFetch("/api/collection/reconcile")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load book review");
        if (!cancelled) setEntries(data.entries ?? []);
      })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); });
    return () => { cancelled = true; };
  }, [enabled]);

  if (!enabled || entries.length === 0) return null;
  const entry = entries[0];

  async function decide(action, gcdIssueId = null) {
    setBusy(`${action}:${gcdIssueId ?? "none"}`);
    setError("");
    try {
      const response = await authedFetch("/api/collection/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, collection_id: entry.collection_id, gcd_issue_id: gcdIssueId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save your choice");
      setEntries((current) => current.slice(1));
      await onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="collection-reconcile" aria-labelledby="collection-reconcile-title">
      <div>
        <p className="library-kicker">Book review</p>
        <h2 id="collection-reconcile-title">Is this your book?</h2>
        <p>We found {entry.candidates.length === 1 ? "a possible catalog match" : "a few possible catalog matches"} for {entry.comic.series_title} #{entry.comic.issue_number}.</p>
      </div>
      <div className="collection-reconcile-candidates">
        {entry.candidates.map((candidate) => (
          <article className="collection-reconcile-card" key={candidate.gcd_issue_id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={candidate.cover_url || "/fallback-cover.png"} alt="" />
            <div>
              <strong>{candidate.series_title}</strong>
              <span>#{candidate.issue_number}{candidate.year ? ` · ${candidate.year}` : ""}</span>
              <button type="button" className="add-comic-btn" disabled={busy != null} onClick={() => decide("link", candidate.gcd_issue_id)}>
                Yes, that&apos;s it
              </button>
            </div>
          </article>
        ))}
      </div>
      <button type="button" className="library-secondary-btn" disabled={busy != null} onClick={() => decide("dismiss")}>None of these</button>
      {error && <p className="collection-reconcile-error" role="alert">{error}</p>}
    </section>
  );
}
