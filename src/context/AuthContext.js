"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const supabase = getSupabaseClient();

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // 🔹 Load initial session
   // AuthContext.js (core logic)
  useEffect(() => {
    let mounted = true;

    async function boot() {
      setLoading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const nextUser = sessionData?.session?.user ?? null;

      if (!mounted) return;
      setUser(nextUser);

      if (nextUser) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", nextUser.id)
          .single();

        if (!mounted) return;
        setProfile(prof ?? null);
      } else {
        setProfile(null);
      }

      if (!mounted) return;
      setLoading(false);
    }

    boot();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const nextUser = session?.user ?? null;
        setUser(nextUser);

        // IMPORTANT: fetch profile on every auth change
        if (nextUser) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", nextUser.id)
            .single();

          setProfile(prof ?? null);
        } else {
          setProfile(null);
        }

        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  // 🔹 Fetch profile row
  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .single();

    if (!error && data) {
      setProfile(data);
    } else {
      console.error("Profile fetch error:", error);
      setProfile(null);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}