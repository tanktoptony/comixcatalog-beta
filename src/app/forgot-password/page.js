"use client";

// /forgot-password — first page of the password reset flow.
//
// Flow:
//   1. User enters email, submits this form.
//   2. We call supabase.auth.resetPasswordForEmail(email, { redirectTo }).
//   3. Supabase emails the user a magic-link with a short-lived token.
//   4. Clicking the link lands on /reset-password (the redirectTo target),
//      which extracts the token from the URL hash and lets the user set a
//      new password via supabase.auth.updateUser({ password }).
//
// Security note: we always show a success message even if the email isn't
// in the database. This prevents user-enumeration attacks (probing the form
// to learn which emails exist). Supabase's resetPasswordForEmail itself
// returns success for unknown emails — we just match that behavior in copy.

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = getSupabaseClient();

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    const emailNormalized = email.trim().toLowerCase();
    if (!emailNormalized) {
      setErrorMsg("Please enter your email.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      // redirectTo MUST be a full absolute URL that matches a configured
      // redirect URL in Supabase Dashboard → Authentication → URL Configuration.
      // Localhost works in dev; production needs https://comixcatalog.com to be
      // added there.
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined;

      const { error } = await supabase.auth.resetPasswordForEmail(
        emailNormalized,
        { redirectTo }
      );

      // Even on Supabase-side errors we present success: anti-enumeration.
      // Real failure modes (network, malformed email) bubble up via catch.
      if (error) {
        console.warn("resetPasswordForEmail error:", error);
      }

      setSent(true);
    } catch (err) {
      console.error("Forgot password flow crashed:", err);
      setErrorMsg("Something went wrong. Please try again in a moment.");
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

      <h1 className="auth-title">Reset your password</h1>

      {sent ? (
        <>
          <p className="auth-subtitle">
            If an account exists for <strong>{email}</strong>, we just sent a
            password-reset link to that address. Check your inbox — the link is
            valid for one hour.
          </p>
          <p className="auth-footer">
            Wrong email?{" "}
            <button
              type="button"
              className="auth-link-button"
              onClick={() => {
                setSent(false);
                setEmail("");
              }}
            >
              Try again
            </button>
          </p>
          <p className="auth-footer">
            <Link href="/login" className="auth-link">
              Back to log in
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="auth-subtitle">
            Enter the email on your account and we'll send a link to set a new
            password.
          </p>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <input
                type="email"
                className="auth-input"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            {errorMsg && <div className="auth-error">{errorMsg}</div>}

            <button
              type="submit"
              className="auth-submit"
              disabled={submitting}
            >
              {submitting ? "Sending…" : "Send reset link"}
            </button>
          </form>

          <p className="auth-footer">
            Remembered it?{" "}
            <Link href="/login" className="auth-link">
              Back to log in
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
