"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ADMIN_ID } from "@/lib/admin";
import { authedFetch } from "@/lib/apiClient";

const date = (value) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export default function TractionPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (!user || user.id !== ADMIN_ID) { router.replace("/"); return; }
    authedFetch("/api/admin/traction").then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load traction");
      setReport(body);
    }).catch((err) => setError(err.message));
  }, [loading, user, router]);

  if (loading || !user || user.id !== ADMIN_ID) return <main className="admin-shell"><p>Loading...</p></main>;
  return <main className="admin-shell admin-shell-wide">
    <header className="admin-header"><p className="admin-kicker">Admin Tools</p><h1 className="admin-title">Traction</h1>
      <p className="admin-lede">Database-backed acquisition and activation. Test accounts are excluded.</p></header>
    {error && <p className="admin-err">{error}</p>}
    {!report && !error && <p>Loading traction...</p>}
    {report && <>
      <section className="admin-card"><h2 className="admin-card-title">North star</h2>
        <p style={{ fontSize: "2rem", margin: 0 }}><strong>{report.north_star}</strong> / 100</p>
        <p>Members with at least 25 owned or for-sale comics who signed in or added a comic in the last 30 days.</p>
      </section>
      <section className="admin-card"><h2 className="admin-card-title">Weekly signup cohorts</h2>
        <div style={{ overflowX: "auto" }}><table className="admin-table"><thead><tr><th>Week</th><th>Signups</th><th>1+ comic</th><th>25+ comics</th><th>Returned in 30d</th></tr></thead>
          <tbody>{report.cohorts.map((row) => <tr key={row.week_start}><td>{date(row.week_start)}</td><td>{row.signups}</td><td>{row.first_book_pct}%</td><td>{row.collection_25_pct}%</td><td>{row.returned_30d_pct}%</td></tr>)}</tbody></table></div>
        <p className="admin-footnote">Returned means a latest sign-in or an owned/for-sale comic add occurred at least 24 hours and less than 30 days after signup.</p>
      </section>
      <section className="admin-card"><h2 className="admin-card-title">Signup sources</h2><div style={{ overflowX: "auto" }}><table className="admin-table"><thead><tr><th>Source</th><th>Signups</th><th>1+ comic</th><th>25+ comics</th></tr></thead><tbody>
        {report.sources.map((row) => <tr key={row.source}><td>{row.source}</td><td>{row.signups}</td><td>{row.first_books}</td><td>{row.collections_25}</td></tr>)}</tbody></table></div></section>
      <section className="admin-card"><h2 className="admin-card-title">Stalled new members</h2>
        {report.stalls.length === 0 ? <p>No members currently match.</p> : <div style={{ overflowX: "auto" }}><table className="admin-table"><thead><tr><th>Username</th><th>Signup</th><th>Source</th></tr></thead><tbody>
          {report.stalls.map((row) => <tr key={row.username}><td>{row.username}</td><td>{date(row.signup_date)}</td><td>{row.source}</td></tr>)}</tbody></table></div>}
      </section>
    </>}
  </main>;
}
