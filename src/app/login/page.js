"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const { user } = useAuth();

  const supabase = getSupabaseClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (user) {
      router.replace("/library");
    }
  }, [user, router]);

  async function handleLogin(e) {
    e.preventDefault();
    await supabase.auth.signInWithPassword({ email, password });
  }

  return (
    <section
      className="comic-panel"
      style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}
    >
      <div className="section-label badge-x">Log In</div>

      <form onSubmit={handleLogin} style={{ display: "flex", gap: 12 }}>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn btn-primary">Log In</button>
      </form>
    </section>
  );
}
