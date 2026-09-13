"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { launchProfileFlags } from "@/lib/launchFlags";

// Handles both the Google OAuth redirect and the email/password
// confirmation redirect (both use this exact URL as their
// redirectTo/emailRedirectTo — see OAuthButtons.js, login/page.js, and
// signup/page.js).
//
// FIXED (2026-09): this used to be a server route.js that called
// supabase.auth.exchangeCodeForSession(code) on a throwaway
// supabaseServer() client with nowhere to persist anything (see
// src/lib/supabase/server.js's comment), then immediately redirected the
// browser to /u/<username>. The exchange itself succeeded server-side, but
// the resulting session was only ever held in that request's memory — it
// was never written to the browser's localStorage. AuthContext reads
// exclusively from the browser's own persisted client
// (src/lib/supabase/client.js), so it saw no session at all: a user who
// had just "successfully" signed in landed on their profile page already
// logged out.
//
// Fix: this is now a client-rendered page, so whatever Supabase hands back
// in the redirect is processed by the browser's own persisted singleton
// client (getSupabaseClient()) instead of a throwaway one. Two shapes are
// both handled, because this app's browser client isn't configured with
// flowType: "pkce" (see client.js) and this repo's history shows the
// actual redirect shape received in practice has been a query-string
// ?code= (per the P0 fix log in docs/LAUNCH_CHECKLIST.md, which hit this
// route past a successful exchange):
//   1. supabase.auth.initialize() resolves the SDK's own automatic
//      detectSessionInUrl handling, which covers a hash-fragment
//      #access_token= redirect (the "implicit" shape) with zero extra code
//      needed on our part — it saves the session before initialize()
//      returns.
//   2. If that didn't produce a session but the URL has a ?code=, we call
//      exchangeCodeForSession(code) ourselves. auth-js's own automatic
//      detection gates a ?code= redirect behind a matching locally-stored
//      PKCE code_verifier (see _isPKCECallback in auth-js), which this
//      client never stores since it doesn't set flowType: "pkce" — so the
//      automatic path never fires for this shape and we have to call it
//      explicitly. This is the same call the old server route made (see
//      the FIXED note above); the exchange itself was never the broken
//      part, only where its result got stored.
// Either way, the outcome we need is the same: a real session saved into
// this browser's localStorage before we read user.user_metadata and touch
// the profiles table.
export default function AuthCallbackPage() {
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState(null);
  const ranRef = useRef(false);

  useEffect(() => {
    // This flow is not safely re-entrant (single-use code, one profile
    // upsert we don't want to fire twice), so guard against React Strict
    // Mode's dev-only double-invoke of effects.
    if (ranRef.current) return;
    ranRef.current = true;

    let cancelled = false;

    async function finish() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const hasHashToken = window.location.hash.includes("access_token");

      if (!code && !hasHashToken) {
        router.replace("/login");
        return;
      }

      const supabase = getSupabaseClient();

      // Covers the hash-fragment (#access_token=) shape automatically; a
      // harmless no-op otherwise.
      const { error: initError } = await supabase.auth.initialize();
      if (cancelled) return;

      let session = (await supabase.auth.getSession()).data.session;
      if (cancelled) return;

      // Auto-detection didn't produce a session but we have a ?code= —
      // exchange it explicitly (see comment above for why the automatic
      // path doesn't handle this shape in this app).
      if (!session && code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          code
        );
        if (cancelled) return;

        if (exchangeError) {
          console.error("AUTH CALLBACK EXCHANGE ERROR:", exchangeError);
          router.replace("/login?error=confirmation_failed");
          return;
        }

        session = (await supabase.auth.getSession()).data.session;
        if (cancelled) return;
      }

      if (!session?.user) {
        if (initError) console.error("AUTH CALLBACK INIT ERROR:", initError);
        console.error("AUTH CALLBACK: no session established");
        router.replace("/login?error=session_failed");
        return;
      }

      const user = session.user;
      const username = user.user_metadata?.username;
      const avatarKey = user.user_metadata?.avatar_key || "hero_01";

      if (!username) {
        // Google doesn't supply a username — /complete-profile collects
        // one. The session already exists in localStorage at this point,
        // so that page's own supabase.auth.getUser() check sees a real
        // logged-in user, same as this page just confirmed.
        router.replace("/complete-profile");
        return;
      }

      // Same client-side upsert pattern already used by /signup and
      // /complete-profile — RLS allows an authenticated user to write
      // their own profiles row under the anon key, so no service-role API
      // route is needed here.
      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          username,
          avatar_key: avatarKey,
          is_public: true,
          // Launch promo flags applied via the same helper as the
          // email/password signup path so OAuth users get identical
          // treatment.
          ...launchProfileFlags(),
        },
        { onConflict: "id" }
      );
      if (cancelled) return;

      if (profileError) {
        console.error("AUTH CALLBACK PROFILE UPSERT ERROR:", profileError);
        router.replace("/complete-profile");
        return;
      }

      router.replace(`/u/${username}`);
      router.refresh();
    }

    finish().catch((err) => {
      if (cancelled) return;
      console.error("AUTH CALLBACK UNEXPECTED ERROR:", err);
      setErrorMsg("Something went wrong finishing sign-in.");
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <section className="auth-panel">
      <h1 className="auth-title">Signing you in…</h1>
      <p className="auth-subtitle">
        {errorMsg || "Hang tight, this only takes a second."}
      </p>
    </section>
  );
}
