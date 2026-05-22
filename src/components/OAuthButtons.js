"use client";

// OAuth provider buttons for login + signup.
//
// Today: Google only. Future providers (Discord, Apple) plug in by adding
// another <OAuthButton provider="..." /> below and a matching case in
// PROVIDER_META.
//
// Flow:
//   1. User clicks the button.
//   2. supabase.auth.signInWithOAuth({ provider }) returns a redirect URL.
//   3. Browser navigates to Google's consent screen.
//   4. After consent, Google redirects back to our Supabase project's
//      `/auth/v1/callback`, which then redirects to `redirectTo` (our
//      /auth/callback route).
//   5. /auth/callback exchanges the code for a session, ensures a profiles
//      row exists, and lands the user on /u/<username> (or /complete-profile
//      if the OAuth-supplied metadata lacks a username — which Google does).
//
// IMPORTANT — Supabase Dashboard setup required before this works:
//   - Authentication → Providers → Google → enable + paste Client ID/Secret
//     from Google Cloud Console.
//   - Authentication → URL Configuration → add your site URL(s) to the
//     allowed redirect list.
// Until that's done, clicking the button surfaces a "provider not enabled"
// error from Supabase — handled below as a visible toast.

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const PROVIDER_META = {
  google: {
    label: "Continue with Google",
    // Inline SVG so we don't ship Google's brand asset over a CDN. Colors
    // are Google's official Material brand palette.
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        />
        <path
          fill="#FBBC05"
          d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
        />
      </svg>
    ),
  },
};

function OAuthButton({ provider }) {
  const supabase = getSupabaseClient();
  const meta = PROVIDER_META[provider];
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      // redirectTo is the URL Supabase will bounce back to after the OAuth
      // round-trip. Must exactly match one of the configured redirect URLs
      // in Supabase Dashboard → Authentication → URL Configuration.
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback`
          : undefined;

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) {
        // Most common: provider not enabled in Supabase dashboard.
        setErrorMsg(error.message || "Could not start sign-in.");
        setBusy(false);
      }
      // On success the browser navigates away — no further state to manage.
    } catch (err) {
      console.error("OAuth click crashed:", err);
      setErrorMsg("Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  if (!meta) return null;

  return (
    <>
      <button
        type="button"
        className="oauth-btn"
        onClick={handleClick}
        disabled={busy}
        aria-label={meta.label}
      >
        <span className="oauth-btn-icon">{meta.icon}</span>
        <span className="oauth-btn-label">
          {busy ? "Redirecting…" : meta.label}
        </span>
      </button>
      {errorMsg && (
        <div className="auth-error" style={{ marginTop: 8, fontSize: 13 }}>
          {errorMsg}
        </div>
      )}
    </>
  );
}

// Shared block used by /login and /signup. Renders the OAuth buttons stack
// followed by an "or" divider so the email/password form below feels like
// the alternative path, not the primary.
export default function OAuthButtons() {
  return (
    <div className="oauth-stack">
      <OAuthButton provider="google" />
      {/* Future: <OAuthButton provider="discord" />, <OAuthButton provider="apple" /> */}

      <div className="oauth-divider" aria-hidden="true">
        <span>or</span>
      </div>
    </div>
  );
}
