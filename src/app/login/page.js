"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getSupabaseClient } from "@/lib/supabase/client";
import { redirectAfterAuth } from "@/lib/auth/postAuthRedirect";
// import OAuthButtons from "@/components/OAuthButtons"; // re-enable with the <OAuthButtons /> usage below

function withTimeout(promise, ms, label = "Request") {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    ),
  ]);
}

export default function LoginPage() {
  const supabase = getSupabaseClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const [showResend, setShowResend] = useState(false);
  const [resendMsg, setResendMsg] = useState(null);
  const [resending, setResending] = useState(false);

  // ?next=/some/path is the post-login return URL — set by buttons that
  // bounce anonymous users to /login from deep pages (issue page "Save",
  // series page "Add", etc). Restricted to same-origin paths to avoid open
  // redirect abuse. Read via a lazy initializer (runs once, during the
  // client render) rather than an effect — avoids useSearchParams (which
  // would force a Suspense boundary refactor) and the
  // react-hooks/set-state-in-effect lint rule, since this is genuinely
  // deriving initial state, not synchronizing with an external system.
  const [nextPath] = useState(() => {
    if (typeof window === "undefined") return null;
    const rawNext = new URLSearchParams(window.location.search).get("next");
    return rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;
  });

  // Same one-shot pattern for the query-string banner flags: ?reset=success
  // (just changed password), ?error=confirmation_failed / session_failed
  // (auth callback hit a snag).
  const [flashBanner, setFlashBanner] = useState(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "success") {
      return { kind: "success", text: "Password updated. Log in with your new password." };
    }
    if (params.get("error") === "confirmation_failed") {
      return { kind: "error", text: "Confirmation link was invalid or expired. Sign in and we can resend." };
    }
    if (params.get("error") === "session_failed") {
      return { kind: "error", text: "Couldn't establish a session. Please try logging in again." };
    }
    return null;
  });

  // Stripping the query string is a real external-system side effect
  // (browser history), not a state update, so it stays in an effect —
  // this is what the lint rule actually wants separated out.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("reset") || params.has("error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    if (saving) return;

    const emailNormalized = email.trim().toLowerCase();

    setSaving(true);
    setErrorMsg(null);
    setShowResend(false);
    setResendMsg(null);

    const debug = process.env.NODE_ENV === "development";

    try {
      if (debug) console.log("LOGIN START:", emailNormalized);

      // Bumped 15s → 30s. Supabase free-tier cold starts can take 15s+;
      // a stricter cap was rejecting healthy logins as "timed out".
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: emailNormalized,
          password,
        }),
        // Temporarily bumped 30s → 60s. Supabase Auth has been responding
        // slowly for this project (DB queries are instant, only the auth
        // service is slow). Revisit once that stabilizes.
        60000,
        "Login"
      );

      if (debug) {
        console.log("LOGIN DATA:", data);
        console.log("LOGIN ERROR:", error);
      }

      if (error) {
        const message = error.message?.toLowerCase() || "";

        if (message.includes("email not confirmed")) {
          setErrorMsg("Please confirm your email before logging in.");
          setShowResend(true);
        } else if (message.includes("invalid login credentials")) {
          setErrorMsg("Invalid email or password.");
        } else {
          setErrorMsg(error.message || "Unable to log in.");
        }

        return;
      }

      const user = data?.user ?? null;
      const session = data?.session ?? null;

      if (!user || !session) {
        setErrorMsg("Login session failed. Please try again.");
        return;
      }

      if (debug) console.log("LOGIN USER:", user.id);

      // If an anon flow asked us to bounce them back to a specific page
      // (via ?next=...), honor that first — beats sending a user who
      // clicked "Save to library" from /issue/42 all the way to /u/them
      // and forcing them to navigate back.
      if (nextPath) {
        redirectAfterAuth(nextPath);
        return;
      }

      // Auth succeeded — that's enough to call this a successful login.
      // Profile lookup used to happen here (with another 15s timeout),
      // which made login fail when Supabase was just-slightly-slow on the
      // second roundtrip. Now we kick off the profile lookup as a fire-and-
      // forget redirect helper with a SHORT 4s window. If it resolves in
      // time → land on /u/<username>. Otherwise → land on / and let
      // AuthContext (which has email-fallback synthesis) populate the UI.
      try {
        const { data: profile } = await withTimeout(
          supabase
            .from("profiles")
            .select("username")
            .eq("id", user.id)
            .maybeSingle(),
          4000,
          "Profile lookup"
        );
        if (profile?.username) {
          redirectAfterAuth(`/u/${profile.username}`);
          return;
        }
      } catch (profileErr) {
        if (debug) {
          console.warn("Profile lookup skipped (slow):", profileErr?.message);
        }
      }

      // Fall through: profile not found / lookup slow / etc. Land on home;
      // AuthContext will resolve the profile in the background.
      redirectAfterAuth("/");
    } catch (err) {
      if (debug) {
        console.error("LOGIN FULL ERROR:", {
          name: err?.name,
          message: err?.message,
          status: err?.status,
          cause: err?.cause,
          raw: err,
        });
      }

      const message = err?.message || "";

      if (message.toLowerCase().includes("timed out")) {
        setErrorMsg(
          "Login timed out. Supabase may be slow right now. Please try again in a minute."
        );
      } else {
        setErrorMsg("Something went wrong while logging in. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleResendConfirmation() {
    const emailNormalized = email.trim().toLowerCase();

    if (!emailNormalized) {
      setErrorMsg("Enter your email to resend confirmation.");
      return;
    }

    setResending(true);
    setResendMsg(null);
    setErrorMsg(null);

    try {
      const { data, error } = await withTimeout(
        supabase.auth.resend({
          type: "signup",
          email: emailNormalized,
          options: {
            emailRedirectTo:
              typeof window !== "undefined"
                ? `${window.location.origin}/auth/callback`
                : undefined,
          },
        }),
        15000,
        "Resend confirmation"
      );

      if (process.env.NODE_ENV === "development") {
        console.log("RESEND LOGIN DATA:", data);
        console.log("RESEND LOGIN ERROR:", error);
      }

      if (error) {
        const message = error.message?.toLowerCase() || "";

        if (message.includes("rate limit")) {
          setErrorMsg(
            "We’ve sent too many confirmation emails recently. Please wait a few minutes and try again."
          );
        } else {
          setErrorMsg(error.message || "Unable to resend confirmation email.");
        }

        return;
      }

      setResendMsg("Confirmation email resent. Check your inbox.");
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("RESEND LOGIN FULL ERROR:", err);
      }
      setErrorMsg("Confirmation resend timed out. Please try again in a minute.");
    } finally {
      setResending(false);
    }
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

      <h1 className="auth-title">Welcome</h1>
      <p className="auth-subtitle">Log in to ComixCatalog to continue</p>

      {flashBanner && (
        <div
          className={
            flashBanner.kind === "success" ? "auth-success" : "auth-error"
          }
          role="status"
          style={{ marginBottom: 12 }}
        >
          {flashBanner.text}
        </div>
      )}

      {/* OAuth temporarily hidden — users were finding the Google flow
          clunky during pre-launch (extra redirects, /complete-profile
          interstitial, occasional session race). Re-enable by uncommenting
          the line below once the OAuth callback path is sharper.
          The component + /auth/callback wiring all still exist. */}
      {/* <OAuthButtons /> */}

      <form onSubmit={handleLogin} className="auth-form">
        <div className="auth-field">
          <input
            id="auth-email"
            className="auth-input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder=" "
          />
          <label htmlFor="auth-email">Username or email address</label>
        </div>

        <div className="auth-field">
          <input
            id="auth-password"
            className="auth-input"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder=" "
          />
          <label htmlFor="auth-password">Password</label>
        </div>

        {/* Forgot password — primary affordance for the recovery flow.
            Placed between password field and submit so a user scanning the
            form before submitting sees the escape hatch immediately. */}
        <div style={{ textAlign: "right", marginTop: -4, marginBottom: 8 }}>
          <Link href="/forgot-password" className="auth-link" style={{ fontSize: 13 }}>
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          className="primary-btn auth-submit"
          disabled={saving}
        >
          {saving ? "Signing in…" : "Continue"}
        </button>
      </form>

      {errorMsg && (
        <div className="auth-error">
          <p>{errorMsg}</p>

          {showResend && (
            <>
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
            </>
          )}
        </div>
      )}

      <p className="auth-footer">
        Don’t have an account?{" "}
        <Link
          href={nextPath ? `/signup?next=${encodeURIComponent(nextPath)}` : "/signup"}
          className="link"
        >
          Sign up
        </Link>
      </p>
    </section>
  );
}