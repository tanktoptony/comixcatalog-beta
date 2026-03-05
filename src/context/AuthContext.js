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
  useEffect(() => {
  async function loadUser() {
    const { data } = await supabase.auth.getSession();
    setUser(data?.session?.user ?? null);
  }

  loadUser();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user ?? null);
  });

  return () => subscription.unsubscribe();
}, []);

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