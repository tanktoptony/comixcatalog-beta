"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ADMIN_ID } from "@/lib/admin";

const AuthContext = createContext(null);

// Last profile we loaded from the database, keyed by user id. On a fresh page
// load it lets the header and gated pages draw the signed-in state before any
// network round trip, instead of flashing "Sign in" (or a stock avatar) and
// then snapping to the real thing. The database read still runs and wins.
const PROFILE_CACHE_KEY = "cc:auth-profile";

function readCachedProfile(userId) {
  try {
    const cached = JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY) || "null");
    return cached && cached.userId === userId ? cached.profile : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(userId, profile) {
  try {
    if (userId && profile) {
      window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ userId, profile }));
    } else {
      window.localStorage.removeItem(PROFILE_CACHE_KEY);
    }
  } catch {
    // Storage blocked (private mode, quota). The cache is only a head start.
  }
}

// supabase-js keeps the session in localStorage under sb-<project ref>-auth-token.
// Reading it directly is synchronous, so it can run before the first paint;
// getSession() is async and resolves a frame or more later.
function readStoredSession() {
  try {
    const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
    const stored = JSON.parse(window.localStorage.getItem(`sb-${ref}-auth-token`) || "null");
    const expiresAt = Number(stored?.expires_at) * 1000;
    // An expired token still identifies the user; getSession() refreshes it
    // and the listener corrects us if the refresh fails.
    return stored?.user?.id ? { user: stored.user, expired: !Number.isFinite(expiresAt) || expiresAt < Date.now() } : null;
  } catch {
    return null;
  }
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function AuthProvider({ children }) {
  const [supabase] = useState(() => getSupabaseClient());

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Before the first paint: with no stored session, show the signed-out state
  // now; with a stored session and that user's profile cached, show the
  // signed-in state now. The server
  // render can't know who you are, so this has to happen on the client, and
  // in a layout effect so the placeholder is never painted.
  useIsomorphicLayoutEffect(() => {
    const stored = readStoredSession();
    if (!stored) {
      // No stored session: this visitor is signed out, and we know it
      // without a network call. (An OAuth return carries its session in the
      // URL; getSession() below picks that up and the listener corrects us.)
      setLoading(false);
      return;
    }
    const cached = readCachedProfile(stored.user.id);
    if (!cached) return;
    setUser(stored.user);
    setProfile(cached);
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    // Track the prior user.id outside React state so we can detect account
    // switches without nesting setProfile inside a setUser updater (which
    // double-invokes in strict mode).
    let prevUserId = null;
    // Which user's profile has been read from the database this page load.
    // Supabase fires SIGNED_IN again on every tab refocus and TOKEN_REFRESHED
    // hourly; neither changes the profile, so neither should refetch it.
    let profileLoadedFor = null;

    // Single resolver used by both the explicit getSession() seed AND the
    // onAuthStateChange listener. Without this shared path, you'd see drift
    // (the listener writes one shape, the seed writes another).
    async function applySession(session, event) {
      if (!mounted) return;
      const nextUser = session?.user ?? null;
      const nextUserId = nextUser?.id ?? null;

      if (!nextUser) {
        prevUserId = null;
        profileLoadedFor = null;
        writeCachedProfile(null, null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      const sameUser = prevUserId === nextUserId;
      if (prevUserId && !sameUser) {
        setProfile(null);
      }
      prevUserId = nextUserId;
      // Keep the existing user object when only the token changed, so
      // components keyed on it don't re-render on every refresh.
      setUser((current) =>
        current?.id === nextUserId && event !== "USER_UPDATED" ? current : nextUser
      );

      if (sameUser && profileLoadedFor === nextUserId && event !== "USER_UPDATED") {
        setLoading(false);
        return;
      }
      profileLoadedFor = nextUserId;

      const { data: prof, error: profError } = await supabase
        .from("profiles")
        // Explicit columns: browsers can't read stripe_customer_id
        // (migration 0032b), so a "*" here would fail the whole load.
        .select(
          "id, username, is_public, created_at, avatar_key, avatar_url, is_founding_collector, is_pro, display_name, location, bio, website_url, show_collection, show_wantlist, show_for_sale, show_value"
        )
        .eq("id", nextUser.id)
        .maybeSingle();

      if (!mounted) return;

      // A failed read is not "no profile". Keep whatever we already show
      // (cached or loaded) rather than swapping in the synthesized fallback,
      // which flipped the header avatar to the stock badge.
      if (profError) {
        console.error("AuthContext profile read failed:", profError);
        profileLoadedFor = null;
        setLoading(false);
        return;
      }

      // If no profile row exists in the DB, synthesize a minimal one from
      // the auth user so the header link, share button, and avatar still
      // render. Username falls back to the email local-part — but we ALSO
      // keep the email itself accessible on profile.email so the dropdown
      // can always identify the user even when username is null.
      const synthesized = prof ?? {
        id: nextUser.id,
        username:
          nextUser.user_metadata?.username ||
          nextUser.email?.split("@")[0] ||
          null,
        avatar_url: null,
        avatar_key: null,
        is_pro: false,
        is_founding_collector: false,
        created_at: nextUser.created_at ?? null,
      };
      if (prof) writeCachedProfile(nextUser.id, prof);
      // Skip the state update when nothing changed, so the header doesn't
      // re-render (and re-decode the avatar) for an identical profile.
      setProfile((current) =>
        current && JSON.stringify(current) === JSON.stringify(synthesized) ? current : synthesized
      );
      setLoading(false);
    }

    // EXPLICIT INITIAL SEED. Without this, AuthContext relies on the
    // listener firing INITIAL_SESSION — which is unreliable in practice:
    // if the supabase client hydrated the session before our listener
    // attached, the event already fired into the void. Symptom: page
    // loads, user IS logged in to Supabase, but our React state stays
    // null forever until they manually sign out + back in.
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) applySession(data?.session ?? null, "INITIAL_SEED");
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        applySession(session, event);
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  async function signOut() {
    // CRITICAL: clear local state synchronously BEFORE the network call.
    // If supabase.auth.signOut() hangs, errors, or its onAuthStateChange
    // event never fires, the navbar would otherwise stay logged-in. Doing
    // it in this order guarantees the UI updates instantly; the listener's
    // SIGNED_OUT handler is a redundant safety net rather than the source
    // of truth.
    setUser(null);
    setProfile(null);
    writeCachedProfile(null, null);

    // scope: "local" clears the browser session without waiting on a server
    // roundtrip. The default ("global") fails closed when the token is
    // already invalid, leaving the user logged in locally.
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        console.error("Supabase logout error:", error);
        return false;
      }
      return true;
    } catch (err) {
      console.error("Supabase logout threw:", err);
      return false;
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signOut,
        isAdmin: user?.id === ADMIN_ID,
        isPro: Boolean(profile?.is_pro) || user?.id === ADMIN_ID,
        isFounding: Boolean(profile?.is_founding_collector),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}