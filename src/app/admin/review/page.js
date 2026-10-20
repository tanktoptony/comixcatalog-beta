"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_ID } from "@/lib/admin";
import { authedFetch } from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";

export default function ReviewPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [kind, setKind] = useState("printings");
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ printings: 0, books: 0, requests: 0 });
  const [notes, setNotes] = useState({});
  const [issueIds, setIssueIds] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!loading && user?.id !== ADMIN_ID) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.id !== ADMIN_ID) return;
    authedFetch(`/api/admin/review?kind=${kind}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setItems(data.items);
        setCounts(data.counts);
      })
      .catch((loadError) => setError(loadError.message));
  }, [kind, user]);

  async function act(id, action) {
    setBusy(id);
    setError(null);
    try {
      const response = await authedFetch("/api/admin/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          id,
          action,
          note: notes[id],
          resolved_gcd_issue_id: issueIds[id],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Review failed");
      setItems((current) => current.filter((item) => item.id !== id));
      setCounts((current) => ({ ...current, [kind]: Math.max(0, current[kind] - 1) }));
    } catch (actionError) {
      setError(actionError.message || "Network error. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (loading || user?.id !== ADMIN_ID) return <main className="admin-shell"><p>Loading...</p></main>;

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <p className="admin-kicker">Admin Tools</p>
        <h1 className="admin-title">Review queue</h1>
      </header>
      <div className="admin-actions" role="tablist">
        <button type="button" role="tab" aria-selected={kind === "printings"} className="admin-btn" onClick={() => setKind("printings")}>Variants &amp; printings ({counts.printings})</button>
        <button type="button" role="tab" aria-selected={kind === "books"} className="admin-btn" onClick={() => setKind("books")}>User-added books ({counts.books})</button>
        <button type="button" role="tab" aria-selected={kind === "requests"} className="admin-btn" onClick={() => setKind("requests")}>Book requests ({counts.requests})</button>
      </div>
      {error && <p className="admin-err">{error}</p>}
      {items.map((item) => (
        <article key={item.id} className="admin-card">
          {kind === "printings" && <PrintingReview item={item} />}
          {kind === "books" && <BookReview item={item} />}
          {kind === "requests" && (
            <RequestReview
              item={item}
              issueId={issueIds[item.id] || ""}
              setIssueId={(value) => setIssueIds({ ...issueIds, [item.id]: value })}
            />
          )}
          <p>Submitted by {item.submitter} on {new Date(item.created_at).toLocaleDateString()}</p>
          <label htmlFor={`note-${item.id}`}>Optional note</label>
          <input id={`note-${item.id}`} className="admin-input" value={notes[item.id] || ""} onChange={(event) => setNotes({ ...notes, [item.id]: event.target.value })} />
          <ReviewActions kind={kind} busy={busy === item.id} act={(action) => act(item.id, action)} />
        </article>
      ))}
      {!items.length && !error && <p>No pending submissions.</p>}
    </main>
  );
}

function PrintingReview({ item }) {
  return (
    <>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {item.photo_url ? <ReviewPhoto src={item.photo_url} caption="Their photo" /> : <p>No photo (reported from the issue page)</p>}
        {item.current_cover_url ? <ReviewPhoto src={item.current_cover_url} caption="Our cover today" /> : <p>We have no cover for this issue</p>}
      </div>
      <h2>{item.series_title} #{item.issue_number} {item.year ? `(${item.year})` : ""}</h2>
      <p>{item.kind}: {item.printing_name}{item.upc ? ` · ${item.upc}` : ""}</p>
    </>
  );
}

function ReviewPhoto({ src, caption }) {
  return (
    <figure style={{ margin: 0 }}>
      <img src={src} alt={caption} style={{ width: 160, objectFit: "contain", outline: "2px solid #d8b04b" }} />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function BookReview({ item }) {
  return (
    <>
      <h2>{item.series_title} #{item.issue_number}</h2>
      <p>{item.publisher} {item.release_year || ""} {item.variant_name || ""}</p>
      {item.possible_match && <p>Possible match: {item.possible_match}</p>}
    </>
  );
}

function RequestReview({ item, issueId, setIssueId }) {
  return (
    <>
      {item.photo_url && <img src={item.photo_url} alt="Requested book" style={{ width: 180, objectFit: "contain" }} />}
      <h2>{item.title}{item.issue_number ? ` #${item.issue_number}` : ""}</h2>
      <p>{[item.publisher, item.year].filter(Boolean).join(" · ")}</p>
      <p>Source: {item.source}{item.search_term ? ` · Search: ${item.search_term}` : ""}{item.barcode ? ` · Barcode: ${item.barcode}` : ""}</p>
      {item.notes && <p>Notes: {item.notes}</p>}
      <label htmlFor={`issue-${item.id}`}>Optional GCD issue id</label>
      <input id={`issue-${item.id}`} className="admin-input" inputMode="numeric" value={issueId} onChange={(event) => setIssueId(event.target.value.replace(/\D/g, ""))} />
    </>
  );
}

function ReviewActions({ kind, busy, act }) {
  return (
    <div className="admin-actions">
      {kind === "requests" ? (
        <>
          <button type="button" className="admin-btn admin-btn-primary" disabled={busy} onClick={() => act("added")}>Added</button>
          <button type="button" className="admin-btn" disabled={busy} onClick={() => act("already_there")}>Already in the catalog</button>
          <button type="button" className="admin-btn admin-btn-danger" disabled={busy} onClick={() => act("decline")}>Decline</button>
        </>
      ) : (
        <>
          <button type="button" className="admin-btn admin-btn-primary" disabled={busy} onClick={() => act("approve")}>Approve</button>
          <button type="button" className="admin-btn admin-btn-danger" disabled={busy} onClick={() => act("deny")}>Deny</button>
          {kind === "printings" && <button type="button" className="admin-btn" disabled={busy} onClick={() => act("duplicate")}>Duplicate</button>}
        </>
      )}
    </div>
  );
}
