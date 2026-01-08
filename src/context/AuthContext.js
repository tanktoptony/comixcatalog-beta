"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseClient();
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();

    // clear beta access
    document.cookie = "cc_beta_access=; path=/; max-age=0";
    localStorage.removeItem("cc_beta_access");

    setUser(null);

    // force navigation so middleware runs
    router.push("/access");
  }

  
  useEffect(() => {
    const supabase = getSupabaseClient(); // ✅ THIS WAS MISSING

    // Initial load
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
