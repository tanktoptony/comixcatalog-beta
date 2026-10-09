"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ADMIN_ID } from "@/lib/admin";
import { authedFetch } from "@/lib/apiClient";

function ageOf(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function AdminReportsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [reports, setReports] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [confirming, setConfirming] = useState(null);

  useEffect(() => { if (!loading && user?.id !== ADMIN_ID) router.replace("/"); }, [loading, user, router]);
  useEffect(() => {
    if (user?.id !== ADMIN_ID) return;
    authedFetch("/api/admin/reports")
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (data.mfa_required) return router.refresh();
        if (!response.ok) throw new Error(data.error || "Could not load reports.");
        setReports(data.reports);
      })
      .catch((loadError) => setError(loadError.message || "Could not load reports."));
  }, [user, router]);

  async function act(id, action) {
    setBusy(id);
    setError(null);
    try {
      const response = await authedFetch("/api/admin/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
      const data = await response.json();
      if (data.mfa_required) return router.refresh();
      if (!response.ok) throw new Error(data.error || "Could not update report.");
      setReports((current) => current.map((report) => report.id === id ? { ...report, status: data.status } : report));
      setConfirming(null);
    } catch (actionError) { setError(actionError.message || "Could not update report."); }
    finally { setBusy(null); }
  }

  if (loading || user?.id !== ADMIN_ID) return <main className="admin-shell"><p>Loading...</p></main>;
  return (
    <main className="admin-shell">
      <header className="admin-header"><p className="admin-kicker">Admin Tools</p><h1 className="admin-title">Reports</h1><p className="admin-lede">Open reports first, followed by the latest 50 closed reports.</p></header>
      {error && <p className="admin-err">{error}</p>}
      {reports.map((report) => (
        <article key={report.id} className="admin-card" style={{ opacity: report.status === "open" ? 1 : 0.65 }}>
          <h2 className="admin-card-title">{report.target_type}: {report.summary}</h2>
          <p><strong>{report.reason}</strong>{report.details ? `: ${report.details}` : ""}</p>
          <p>Reported by @{report.reporter_username} {ageOf(report.created_at)}. Status: {report.status}.</p>
          {report.status === "open" && <div className="admin-actions">
            <button type="button" className="admin-btn" disabled={busy === report.id} onClick={() => act(report.id, "dismiss")}>Dismiss</button>
            <button type="button" className="admin-btn admin-btn-primary" disabled={busy === report.id} onClick={() => act(report.id, "action")}>Mark handled</button>
            {report.target_type === "listing" && (confirming === report.id ? <span><span style={{ marginRight: 8 }}>Remove this listing?</span><button type="button" className="admin-btn admin-btn-danger" disabled={busy === report.id} onClick={() => act(report.id, "remove_listing")}>Yes, remove</button><button type="button" className="admin-btn" disabled={busy === report.id} onClick={() => setConfirming(null)}>Cancel</button></span> : <button type="button" className="admin-btn admin-btn-danger" disabled={busy === report.id} onClick={() => setConfirming(report.id)}>Remove listing</button>)}
          </div>}
        </article>
      ))}
      {!reports.length && !error && <p>No reports.</p>}
    </main>
  );
}
