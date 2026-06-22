"use client";

// Admin-only tools page. Gated by ADMIN_ID client-side (the actual
// authority is enforced server-side in the API routes). Hidden link
// — no nav entry; admin types the URL.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ADMIN_ID } from "@/lib/admin";

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [target, setTarget] = useState(null);
  const [lookupErr, setLookupErr] = useState(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (!user || user.id !== ADMIN_ID) {
      router.replace("/");
    }
  }, [user, loading, router]);

  async function lookup(e) {
    e?.preventDefault();
    setLookupErr(null);
    setTarget(null);
    setMessage(null);
    if (!username.trim()) return;
    const res = await fetch(
      `/api/admin/toggle-pro?actor_id=${encodeURIComponent(user.id)}&username=${encodeURIComponent(username.trim())}`
    );
    const json = await res.json();
    if (!res.ok) {
      setLookupErr(json.error || "Lookup failed");
      return;
    }
    setTarget(json.user);
  }

  async function togglePro(nextValue) {
    if (!target) return;
    setWorking(true);
    setMessage(null);
    const res = await fetch("/api/admin/toggle-pro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor_id: user.id,
        target_username: target.username,
        is_pro: nextValue,
      }),
    });
    const json = await res.json();
    setWorking(false);
    if (!res.ok) {
      setMessage({ type: "err", text: json.error || "Update failed" });
      return;
    }
    setTarget({ ...target, is_pro: json.user.is_pro });
    setMessage({
      type: "ok",
      text: `${target.username} → Pro is now ${json.user.is_pro ? "ON" : "OFF"} (was ${json.previous_is_pro ? "ON" : "OFF"})`,
    });
  }

  if (loading || !user || user.id !== ADMIN_ID) {
    return <main className="admin-shell"><p>Loading…</p></main>;
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <p className="admin-kicker">Admin Tools</p>
        <h1 className="admin-title">User management</h1>
        <p className="admin-lede">Comp, grant, or revoke Pro memberships by username.</p>
      </header>

      <section className="admin-card">
        <h2 className="admin-card-title">Toggle Pro membership</h2>
        <form onSubmit={lookup} className="admin-form">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username (e.g. treystyles)"
            className="admin-input"
            autoComplete="off"
          />
          <button type="submit" className="admin-btn">Look up</button>
        </form>

        {lookupErr && <p className="admin-err">{lookupErr}</p>}

        {target && (
          <div className="admin-target">
            <div className="admin-target-row">
              <span className="admin-target-label">Username</span>
              <span className="admin-target-value">{target.username}</span>
            </div>
            <div className="admin-target-row">
              <span className="admin-target-label">User ID</span>
              <span className="admin-target-value mono">{target.id}</span>
            </div>
            <div className="admin-target-row">
              <span className="admin-target-label">Pro status</span>
              <span className={`admin-pill ${target.is_pro ? "on" : "off"}`}>
                {target.is_pro ? "PRO" : "FREE"}
              </span>
            </div>
            {target.is_founding_collector && (
              <div className="admin-target-row">
                <span className="admin-target-label">Founding</span>
                <span className="admin-pill founding">★ Founding</span>
              </div>
            )}
            {target.stripe_customer_id && (
              <div className="admin-target-row">
                <span className="admin-target-label">Stripe customer</span>
                <span className="admin-target-value mono">{target.stripe_customer_id}</span>
              </div>
            )}
            <div className="admin-actions">
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                disabled={working || target.is_pro}
                onClick={() => togglePro(true)}
              >
                Grant Pro
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                disabled={working || !target.is_pro}
                onClick={() => togglePro(false)}
              >
                Revoke Pro
              </button>
            </div>
          </div>
        )}

        {message && (
          <p className={`admin-message ${message.type}`}>{message.text}</p>
        )}
      </section>

      <p className="admin-footnote">
        Pro is the in-app flag (<code>profiles.is_pro</code>). It does <strong>not</strong> create or cancel
        a Stripe subscription — for that, manage through the Stripe Dashboard.
        This tool is for comps, manual grants, and overrides.
      </p>
    </main>
  );
}
