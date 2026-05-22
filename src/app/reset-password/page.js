"use client";

// /reset-password — second page of the password-reset flow.
//
// The user lands here via the link in the reset email. Supabase's email
// template appends `?code=<token>&type=recovery` (PKCE flow) OR puts an
// access_token in the URL hash (older flow), depending on the project's
// auth config. We let Supabase's client handle both — the
// `supabase.auth.onAuthStateChange` listener emits a PASSWORD_RECOVERY
// event when the token is valid, at which point updateUser({ password })
// is allowed.
//
// Failure modes handled:
//   - Expired/invalid link → user sees a clear "link expired" message with
//     a way to request a new one.
//   - Network failure → standard retry path.
//   - Successful update → land on /login with a success banner.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  // Suspense boundary in case we ever read searchParams here (Next 15+ requires it).
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const supabase = getSupabaseClient();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);

  useEffect(() => {
    // We listen for PASSWORD_RECOVERY to confirm Supabase parsed the token
    // out of the URL successfully. If we don't see it within ~3s, the link
    // was probably expired/malformed.
    let resolved = false;

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        resolved = true;
        setRecoveryReady(true);
      }
    });

    // Also poll getSession once — covers the case where the event already
    // fired before our listener attached (same race we fixed in AuthContext).
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session && !resolved) {
        // A session exists — Supabase already exchanged the token. Treat
        // that as recovery-ready since we can call updateUser now.
        setRecoveryReady(true);
      }
    });

    // Fallback: if neither path resolves in 3s, surface the expired-link UI.
    const timer = setTimeout(() => {
      if (!resolved) setLinkInvalid(true);
    }, 3000);

    return () => {
      clearTimeout(timer);
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMsg(error.message || "Could not update password.");
        return;
      }
      // Successful — sign out the recovery session so the user explicitly
      // re-authenticates with the new password. This avoids a state where
      // the recovery token doubles as a long-lived session.
      await supabase.auth.signOut({ scope: "local" });
      router.replace("/login?reset=success");
    } catch (err) {
      console.error("updateUser threw:", err);
      setErrorMsg("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-panel">
      <Link href="/" className="auth-brand" aria-label="ComixCatalog home">
        <Image
          src="/icons/cc_badge.png"
          alt="ComixCatalog"
          width={64}
          height={64}
          className="auth-brand-badge"
          priority
        />
      </Link>

      <h1 className="auth-title">Set a new password</h1>

      {linkInvalid && !recoveryReady && (
        <>
          <p className="auth-subtitle">
            This password-reset link is invalid or has expired. Reset links are
            valid for one hour.
          </p>
          <p className="auth-footer">
            <Link href="/forgot-password" className="auth-link">
              Request a new link
            </Link>
          </p>
        </>
      )}

      {!linkInvalid && !recoveryReady && (
        <p className="auth-subtitle">Verifying your reset link…</p>
      )}

      {recoveryReady && (
        <>
          <p className="auth-subtitle">
            Pick a new password. Minimum 8 characters.
          </p>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <input
                type="password"
                className="auth-input"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>

            <div className="auth-field">
              <input
                type="password"
                className="auth-input"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>

            {errorMsg && <div className="auth-error">{errorMsg}</div>}

            <button
              type="submit"
              className="auth-submit"
              disabled={submitting}
            >
              {submitting ? "Updating…" : "Set new password"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
