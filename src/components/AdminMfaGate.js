"use client";
/* eslint-disable @next/next/no-img-element */

// Two-factor gate for admin pages. Every admin API that changes something
// requires an aal2 session (src/lib/adminAuth.js); this is where the admin
// gets one. First visit: enroll an authenticator app (QR code). After that:
// enter the 6-digit code once per sign-in. Non-admin visitors pass straight
// through, and the pages themselves redirect them away.
//
// Lost the authenticator? Remove the factor in the Supabase dashboard
// (Authentication > Users > the admin user), then enroll again here.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { ADMIN_ID } from "@/lib/admin";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function AdminMfaGate({ children }) {
  const { user, loading } = useAuth();
  const isAdmin = user?.id === ADMIN_ID;
  const [state, setState] = useState("checking"); // checking | ok | verify | enroll
  const [factorId, setFactorId] = useState(null);
  const [qr, setQr] = useState(null), [secret, setSecret] = useState(null);
  const [code, setCode] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(null);

  const check = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) { setError(aalError.message); setState("verify"); return; }
    if (data.currentLevel === "aal2") { setState("ok"); return; }
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) { setError(listError.message); return; }
    const verified = (factors?.totp ?? []).find((f) => f.status === "verified");
    if (verified) { setFactorId(verified.id); setState("verify"); return; }
    // Clear any half-finished enrollment, then start a fresh one.
    for (const f of factors?.all ?? []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "ComixCatalog admin" });
    if (enrollError) { setError(enrollError.message); setState("enroll"); return; }
    setFactorId(enrolled.id); setQr(enrolled.totp?.qr_code ?? null); setSecret(enrolled.totp?.secret ?? null); setState("enroll");
  }, []);

  useEffect(() => {
    if (loading || !isAdmin) return;
    // A one-time check against Supabase when the admin opens the page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    check().catch((e) => setError(e.message));
  }, [loading, isAdmin, check]);

  async function submit(event) {
    event.preventDefault();
    if (!factorId || code.length !== 6) return;
    setBusy(true); setError(null);
    const { error: verifyError } = await getSupabaseClient().auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (verifyError) { setError("That code didn't work. Check the app and try the current code."); setCode(""); return; }
    setState("ok");
  }

  if (loading || !isAdmin || state === "ok") return children;
  if (state === "checking") return <main className="admin-shell"><p>Checking two-factor sign-in...</p></main>;
  return (
    <main className="admin-shell">
      <header className="admin-header">
        <p className="admin-kicker">Admin Tools</p>
        <h1 className="admin-title">{state === "enroll" ? "Set up two-factor sign-in" : "Two-factor sign-in"}</h1>
        <p className="admin-lede">
          {state === "enroll"
            ? "Admin actions need a code from an authenticator app (Google Authenticator, 1Password, Authy). Scan this once, then enter the 6-digit code it shows."
            : "Enter the 6-digit code from your authenticator app."}
        </p>
      </header>
      <section className="admin-card" style={{ maxWidth: 420 }}>
        {state === "enroll" && qr && <img src={qr} alt="QR code to add ComixCatalog to your authenticator app" style={{ width: 200, height: 200, background: "#fff", padding: 8, borderRadius: 8 }} />}
        {state === "enroll" && secret && <p style={{ wordBreak: "break-all", fontSize: "0.85rem" }}>Can&apos;t scan? Enter this key: <code>{secret}</code></p>}
        <form onSubmit={submit} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 12 }}>
          <label htmlFor="admin-mfa-code" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            6-digit code
            <input id="admin-mfa-code" className="admin-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus style={{ width: 140, letterSpacing: "0.2em", fontSize: "1.2rem" }} />
          </label>
          <button type="submit" className="admin-btn admin-btn-primary" style={{ minHeight: 44 }} disabled={busy || code.length !== 6}>{busy ? "Checking..." : "Verify"}</button>
        </form>
        {error && <p className="admin-err" role="alert">{error}</p>}
      </section>
    </main>
  );
}
