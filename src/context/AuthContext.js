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

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        const nextUser = session?.user ?? null;

        // Only clear profile when transitioning between two DIFFERENT signed-in
        // users (account switch). Don't clear on the initial null→user
        // transition (first sign-in) — that's what was leaving "My Profile"
        // missing on the first paint.
        setUser((prev) => {
          if (prev?.id && nextUser?.id && prev.id !== nextUser.id) {
            setProfile(null);
          }
          return nextUser;
        });

        if (nextUser) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", nextUser.id)
            .single();

          if (mounted) {
            // If no profile row exists in the DB, synthesize a minimal one
            // from the auth user so downstream UI (header link, share button,
            // avatar) still renders. Username falls back to email local-part.
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
            setProfile((prev) => synthesized ?? prev ?? null);
          }
        } else {
          setProfile(null);
        }

        if (mounted) setLoading(false);
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  async function signOut() {
    // scope: "local" clears the browser session immediately without waiting on
    // a server roundtrip. The default ("global") fails closed when the token is
    // already invalid, leaving the user logged in locally.
    const { error } = await supabase.auth.signOut({ scope: "local" });

    setUser(null);
    setProfile(null);

    if (error) {
      console.error("Supabase logout error:", error);
      return false;
    }
    return true;
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