"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ADMIN_ID } from "@/lib/admin";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [supabase] = useState(() => getSupabaseClient());

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Track the prior user.id outside React state so we can detect account
    // switches without nesting setProfile inside a setUser updater (which
    // double-invokes in strict mode).
    let prevUserId = null;

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        const nextUser = session?.user ?? null;
        const nextUserId = nextUser?.id ?? null;

        // SIGNED_OUT — null out everything immediately, no network needed.
        if (!nextUser) {
          prevUserId = null;
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        // Account switch — drop the previous account's profile right away
        // so its avatar/username can't render under the new session while
        // the fresh fetch is in flight.
        if (prevUserId && prevUserId !== nextUserId) {
          setProfile(null);
        }
        prevUserId = nextUserId;

        setUser(nextUser);

        const { data: prof } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", nextUser.id)
          .single();

        if (!mounted) return;

        // If no profile row exists in the DB, synthesize a minimal one from
        // the auth user so the header link, share button, and avatar still
        // render. Username falls back to the email local-part.
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
        setProfile(synthesized);
        setLoading(false);
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