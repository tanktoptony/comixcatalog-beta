"use client";

import { useState } from "react";
import { authedFetch } from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";

const REASONS = [
  ["spam", "Spam"],
  ["scam", "Scam or fraud"],
  ["harassment", "Harassment"],
  ["counterfeit", "Counterfeit"],
  ["misdescribed", "Not as described"],
  ["prohibited", "Not allowed"],
  ["other", "Something else"],
];

export default function ReportButton({ targetType, targetId, ownerId }) {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  if (loading || !user || user.id === ownerId) return null;
  if (sent) return <span style={{ fontSize: "0.85rem", opacity: 0.75 }}>Thanks. We&apos;ll take a look.</span>;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await authedFetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_type: targetType, target_id: targetId, reason, details }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not send report.");
      setSent(true);
    } catch (submitError) {
      setError(submitError.message || "Could not send report.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} style={{ border: 0, padding: 0, background: "transparent", color: "inherit", textDecoration: "underline", cursor: "pointer", font: "inherit", fontSize: "0.85rem", opacity: 0.7 }}>Report</button>;

  return (
    <form onSubmit={submit} style={{ width: "min(100%, 360px)", padding: 12, border: "1px solid rgba(128,128,128,.35)", borderRadius: 8, display: "grid", gap: 8 }}>
      <label>
        <span style={{ display: "block", fontSize: "0.85rem", marginBottom: 4 }}>Reason</span>
        <select value={reason} onChange={(event) => setReason(event.target.value)} style={{ width: "100%", padding: 8 }}>
          {REASONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </label>
      <label>
        <span style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: 4 }}><span>Details (optional)</span><span>{details.length}/1000</span></span>
        <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={1000} rows={4} style={{ width: "100%", padding: 8, resize: "vertical" }} />
      </label>
      {error && <p role="alert" style={{ color: "#fca5a5", margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={busy}>{busy ? "Sending..." : "Send"}</button>
        <button type="button" disabled={busy} onClick={() => { setOpen(false); setError(null); }}>Cancel</button>
      </div>
    </form>
  );
}
