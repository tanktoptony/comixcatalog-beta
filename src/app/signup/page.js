"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { launchProfileFlags } from "@/lib/launchFlags";
// import OAuthButtons from "@/components/OAuthButtons"; // re-enable with the <OAuthButtons /> usage below

// Avatar selection deferred to /profile/edit. Signup is now 3 fields
// (username, email, password). The legacy hero_XX set in /public/avatars/
// is on its way out — target is user-uploaded photos. The auth callback
// upserts profiles with avatar_key=null; the Header/profile views render
// an initial-letter chip as the default.
export default function SignUpPage() {
  const supabase = getSupabaseClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [resendMsg, setResendMsg] = useState(null);
  const [resending, setResending] = useState(false);

  const [submittedEmail, setSubmittedEmail] = useState("");

  async function handleResendConfirmation() {
    const emailToResend = (submittedEmail || email).trim().toLowerCase();

    if (!emailToResend) {
      setErrorMsg("Enter your email to resend confirmation.");
      return;
    }

    setResending(true);
    setResendMsg(null);
    setErrorMsg(null);

    const { data, error } = await supabase.auth.resend({
      type: "signup",
      email: emailToResend,
      options: {
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback`
            : undefined,
      },
    });

    console.log("RESEND DATA:", data);
    console.log("RESEND ERROR:", error);

    if (error) {
      setErrorMsg(error.message || "Unable to resend confirmation email.");
    } else {
      setResendMsg(`Confirmation email resent to ${emailToResend}. Check your inbox.`);
    }

    setResending(false);
  }

  async function handleSignup(e) {
    e.preventDefault();
    if (saving) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setResendMsg(null);

    const usernameNormalized = username.trim().toLowerCase();
    const emailNormalized = email.trim().toLowerCase();

    if (!/^[a-z0-9_]{3,20}$/.test(usernameNormalized)) {
      setErrorMsg(
        "Username must be 3–20 characters (letters, numbers, underscore)."
      );
      return;
    }

    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }

    setSaving(true);

    // Race signUp against a hard 15s timeout. Supabase's auth service
    // returns 504 upstream-request-timeout when its built-in SMTP relay
    // is throttled (which is happening pre-Resend-setup). Without this
    // race the signup spinner runs forever and the user gives up.
    let data, error;
    try {
      const result = await Promise.race([
        supabase.auth.signUp({
          email: emailNormalized,
          password,
          options: {
            emailRedirectTo:
              typeof window !== "undefined"
                ? `${window.location.origin}/auth/callback`
                : undefined,
            data: {
              username: usernameNormalized,
            },
          },
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Supabase signup timed out")), 15000)
        ),
      ]);
      data = result?.data;
      error = result?.error;
    } catch (timeoutErr) {
      console.error("SIGNUP TIMEOUT:", timeoutErr);
      setSaving(false);
      setErrorMsg(
        "Email service is temporarily unavailable — your confirmation " +
          "email can't be sent right now. Email comixcatalog@gmail.com " +
          "and we'll get you in manually."
      );
      return;
    }

    console.log("SIGNUP DATA:", data);
    console.log("SIGNUP ERROR:", error);

    if (error) {
      setSaving(false);

      console.error("SIGNUP FULL ERROR:", {
        name: error.name,
        message: error.message,
        status: error.status,
        cause: error.cause,
        raw: error,
      });

      const message = error.message?.toLowerCase() || "";
      const name = error.name?.toLowerCase() || "";

      if (message.includes("rate limit")) {
        setErrorMsg(
          "We’ve sent too many confirmation emails recently. Please wait a few minutes and try again."
        );
      } else if (message.includes("already registered") || message.includes("already exists")) {
        setErrorMsg(
          "An account may already exist with this email. Try logging in or resending your confirmation email."
        );
      } else if (
        name.includes("retryable") ||
        message.includes("fetch") ||
        error.status === 504
      ) {
        setErrorMsg(
          "Signup service timed out. Please wait a few minutes and try again."
        );
      } else {
        setErrorMsg(error.message || "Unable to create account. Please try again.");
      }

      return;
    }

    const user = data?.user ?? null;
    const session = data?.session ?? null;

    // Only try client-side profile creation if we actually have a session.
    // If email confirmation is required, session may be null here even though signup succeeded.
    if (user && session) {
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            username: usernameNormalized,
            is_public: true,
            // Launch promo flags (Pro + Founding). Single source of truth
            // in src/lib/launchFlags.js — flip AUTO_PRO_AND_FOUNDING_ON_SIGNUP
            // to false there when signups should hit the paywall again.
            ...launchProfileFlags(),
          },
          { onConflict: "id" }
        );

      console.log("PROFILE UPSERT ERROR:", profileError);

      if (profileError) {
        // Do not fail the whole signup flow if auth user was created.
        setSuccessMsg(
          "Account created, but profile setup will finish after login or email confirmation."
        );
        setSaving(false);
        return;
      }
    }

    setSubmittedEmail(emailNormalized);

    setSuccessMsg(
      "Account created! Please check your email to confirm your account before logging in."
    );

    setSaving(false);
    setPassword("");
    setUsername("");
  }

  return (
    <section className="auth-panel">
      <Link href="/" className="auth-brand" aria-label="ComixCatalog home">
        <Image
          src="/img/logos/cc_badge.png"
          alt=""
          width={56}
          height={56}
          className="auth-brand-badge"
          priority
        />
      </Link>

      <h1 className="auth-title">Create your account</h1>
      <p className="auth-subtitle">Free to start tracking your collection &mdash; values, grades, runs.</p>

      {/* OAuth temporarily hidden — pre-launch users were finding the
          Google flow clunky (extra redirects, /complete-profile gate,
          occasional session race). Re-enable by uncommenting the line
          below once that path is sharper. Component + auth callback
          remain in place. */}
      {/* <OAuthButtons /> */}

      <form onSubmit={handleSignup} className="auth-form">
        <div className="auth-field">
          <input
            id="signup-username"
            className="auth-input"
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder=" "
          />
          <label htmlFor="signup-username">Username</label>
        </div>

        <div className="auth-field">
          <input
            id="signup-email"
            className="auth-input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder=" "
          />
          <label htmlFor="signup-email">Email address</label>
        </div>

        <div className="auth-field">
          <input
            id="signup-password"
            className="auth-input"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder=" "
          />
          <label htmlFor="signup-password">Password</label>
        </div>

        <button
          className="primary-btn auth-submit"
          type="submit"
          disabled={saving}
        >
          {saving ? "Creating account…" : "Create account"}
        </button>
      </form>

      {errorMsg && <div className="auth-error">{errorMsg}</div>}

      {successMsg && (
        <div className="auth-success">
          <p>{successMsg}</p>

          <button
            type="button"
            className="auth-link-button"
            onClick={handleResendConfirmation}
            disabled={resending}
            style={{ marginTop: 8 }}
          >
            {resending ? "Resending..." : "Resend confirmation email"}
          </button>

          {resendMsg && (
            <div style={{ marginTop: 6, fontSize: 13 }}>
              {resendMsg}
            </div>
          )}
        </div>
      )}

      <p className="auth-footer">
        Already have an account? <Link href="/login" className="link">Log in</Link>
      </p>
    </section>
  );
}