"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { claimFoundingPass } from "@/lib/launchFlags";
import { trackEvent } from "@/lib/analytics";
// import OAuthButtons from "@/components/OAuthButtons"; // re-enable with the <OAuthButtons /> usage below

// Avatar selection deferred to /profile/edit. Signup is now 3 fields
// (username, email, password). The legacy hero_XX set in /public/avatars/
// is on its way out — target is user-uploaded photos. The auth callback
// upserts profiles with avatar_key=null; the Header/profile views render
// an initial-letter chip as the default.
export default function SignUpPage() {
  const supabase = getSupabaseClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [resendMsg, setResendMsg] = useState(null);
  const [resending, setResending] = useState(false);

  const [submittedEmail, setSubmittedEmail] = useState("");

  // Funnel: fire signup_started once per visit, on the first field focus.
  // Distinguishes "landed on /signup and left" from "tried and failed".
  const startedRef = useRef(false);
  function markStarted() {
    if (startedRef.current) return;
    startedRef.current = true;
    trackEvent("signup_started", {
      next: new URLSearchParams(window.location.search).get("next") || "",
    });
  }

  function failSignup(reason, message) {
    trackEvent("signup_error", { reason });
    setErrorMsg(message);
  }

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
      failSignup(
        "invalid_username",
        "Username must be 3–20 characters (letters, numbers, underscore)."
      );
      return;
    }

    if (password.length < 8) {
      failSignup("weak_password", "Password must be at least 8 characters.");
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
      failSignup(
        "timeout",
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

      if (
        message.includes("rate limit") ||
        message.includes("too many requests") ||
        message.includes("for security purposes") ||
        error.status === 429
      ) {
        failSignup(
          "rate_limited",
          "Too many signup attempts. Please wait a few minutes and try again."
        );
      } else if (message.includes("already registered") || message.includes("already exists")) {
        failSignup(
          "already_registered",
          "An account may already exist with this email. Try logging in or resending your confirmation email."
        );
      } else if (
        name.includes("retryable") ||
        message.includes("fetch") ||
        error.status === 504
      ) {
        failSignup(
          "service_timeout",
          "Signup service timed out. Please wait a few minutes and try again."
        );
      } else {
        failSignup(
          "unknown",
          error.message || "Unable to create account. Please try again."
        );
      }

      return;
    }

    const user = data?.user ?? null;
    const session = data?.session ?? null;

    // Signup itself succeeded here regardless of what happens with the
    // profile upsert below (which has its own, separate failure branch).
    trackEvent("signup_completed", {
      email_confirmation_required: !session,
    });

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
            // No entitlement flags here on purpose. Pro and the founding
            // badge are granted by the server after this row exists, so the
            // 100-pass cap can actually be enforced — see claimFoundingPass
            // below and src/lib/launchFlags.js for what this used to do.
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

      // Grant the founding pass, if any of the 100 are left. Server-side, so
      // the cap holds; non-fatal, so running out costs a promo rather than a
      // signup. Past 100 the account simply starts on free and meets the
      // normal upgrade path, which is the whole point of having a cap.
      await claimFoundingPass();

      // A session here means Supabase auto-confirmed the account (no email
      // confirmation configured, or it's off) — the user is already logged
      // in. Showing "check your email" and leaving them stranded on this
      // form was the bug: nothing ever sent them into the logged-in app.
      // Redirect straight into it, same landing logic /login uses.
      router.replace(`/u/${usernameNormalized}`);
      router.refresh();
      return;
    }

    // No session: email confirmation is actually required, so this message
    // is accurate — Supabase already sent the confirmation email as part of
    // the signUp() call above.
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
            onFocus={markStarted}
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
            onFocus={markStarted}
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
            onFocus={markStarted}
            minLength={8}
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

      <p className="auth-legal-notice">
        By creating an account, you agree to our{" "}
        <Link href="/terms" className="link">Terms of Service</Link> and{" "}
        <Link href="/privacy" className="link">Privacy Policy</Link>.
      </p>

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