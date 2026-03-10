"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [supabase] = useState(() => getSupabaseClient());

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      const { data } = await supabase.auth.getUser();
      const currentUser = data?.user ?? null;

      if (!mounted) return;

      setUser(currentUser);

      if (currentUser) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", currentUser.id)
          .single();

        if (mounted) setProfile(prof ?? null);
      }

      setLoading(false);
    }

    initialize();

    const { data: listener } = supabase.auth.onAuthStateChange(
      
      async (event, session) => {
        console.log("AUTH EVENT:", event);
        
        const nextUser = session?.user ?? null;
        
        setUser(nextUser);

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
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  async function signOut() {
    console.log("AuthContext: signOut called");

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Supabase logout error:", error);
      return false;
    }

    setUser(null);
    setProfile(null);

    return true;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signOut,
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