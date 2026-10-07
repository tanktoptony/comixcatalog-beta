"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_ID } from "@/lib/admin";
import { authedFetch } from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";

export default function ReviewPage() {
  const { user, loading } = useAuth(); const router = useRouter();
  const [kind, setKind] = useState("printings"), [items, setItems] = useState([]), [counts, setCounts] = useState({ printings: 0, books: 0 });
  const [notes, setNotes] = useState({}), [busy, setBusy] = useState(null), [error, setError] = useState(null);
  useEffect(() => { if (!loading && user?.id !== ADMIN_ID) router.replace("/"); }, [user, loading, router]);
  useEffect(() => {
    if (user?.id !== ADMIN_ID) return;
    authedFetch(`/api/admin/review?kind=${kind}`).then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.error); setItems(data.items); setCounts(data.counts); }).catch((e) => setError(e.message));
  }, [kind, user]);
  async function act(id, action) {
    setBusy(id); setError(null);
    let response, data;
    try {
      response = await authedFetch("/api/admin/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id, action, note: notes[id] }) });
      data = await response.json();
    } catch { setBusy(null); return setError("Network error. Try again."); }
    setBusy(null);
    if (!response.ok) return setError(data.error || "Review failed");
    setItems((current) => current.filter((item) => item.id !== id)); setCounts((current) => ({ ...current, [kind]: Math.max(0, current[kind] - 1) }));
  }
  if (loading || user?.id !== ADMIN_ID) return <main className="admin-shell"><p>Loading...</p></main>;
  return <main className="admin-shell">
    <header className="admin-header"><p className="admin-kicker">Admin Tools</p><h1 className="admin-title">Review queue</h1></header>
    <div className="admin-actions" role="tablist"><button type="button" role="tab" aria-selected={kind === "printings"} className="admin-btn" onClick={() => setKind("printings")}>Variants &amp; printings ({counts.printings})</button><button type="button" role="tab" aria-selected={kind === "books"} className="admin-btn" onClick={() => setKind("books")}>User-added books ({counts.books})</button></div>
    {error && <p className="admin-err">{error}</p>}
    {items.map((item) => <article key={item.id} className="admin-card">
      {kind === "printings" ? <><div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>{item.photo_url ? <figure style={{ margin: 0 }}><img src={item.photo_url} alt="Submitted photo" style={{ width: 160, objectFit: "contain", outline: "2px solid #d8b04b" }} /><figcaption>Their photo</figcaption></figure> : <p>No photo (reported from the issue page)</p>}{item.current_cover_url ? <figure style={{ margin: 0 }}><img src={item.current_cover_url} alt="Our catalog cover" style={{ width: 160, objectFit: "contain" }} /><figcaption>Our cover today</figcaption></figure> : <p>We have no cover for this issue</p>}</div><h2>{item.series_title} #{item.issue_number} {item.year ? `(${item.year})` : ""}</h2><p>{item.kind}: {item.printing_name}{item.upc ? ` · ${item.upc}` : ""}</p></> : <><h2>{item.series_title} #{item.issue_number}</h2><p>{item.publisher} {item.release_year || ""} {item.variant_name || ""}</p>{item.possible_match && <p>Possible match: {item.possible_match}</p>}</>}
      <p>Submitted by {item.submitter} on {new Date(item.created_at).toLocaleDateString()}</p>
      <label htmlFor={`note-${item.id}`}>Optional note</label><input id={`note-${item.id}`} className="admin-input" value={notes[item.id] || ""} onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })} />
      <div className="admin-actions"><button type="button" className="admin-btn admin-btn-primary" style={{ minHeight: 44 }} disabled={busy === item.id} onClick={() => act(item.id, "approve")}>Approve</button><button type="button" className="admin-btn admin-btn-danger" style={{ minHeight: 44 }} disabled={busy === item.id} onClick={() => act(item.id, "deny")}>Deny</button>{kind === "printings" && <button type="button" className="admin-btn" style={{ minHeight: 44 }} disabled={busy === item.id} onClick={() => act(item.id, "duplicate")}>Duplicate</button>}</div>
    </article>)}
    {!items.length && !error && <p>No pending submissions.</p>}
  </main>;
}
