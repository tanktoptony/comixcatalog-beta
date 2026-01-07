"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin(e) {
    e.preventDefault();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!error) {
      router.push("/library");
    } else {
      alert(error.message);
    }
  }

  return (
    <section
      className="comic-panel"
      style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}
    >
      <div className="section-label badge-x">Log In</div>
      <h1 className="hero-title" style={{ marginBottom: 12 }}>
        Welcome back
      </h1>

      <form
        onSubmit={handleLogin}
        className="flex-col"
        style={{ display: "flex", gap: 12 }}
      >
        <input
          className="input"
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="input"
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button className="btn btn-primary" type="submit">
          Log In
        </button>
      </form>

      <p className="muted" style={{ marginTop: 12 }}>
        Don't have an account?{" "}
        <a href="/signup" className="link">
          Create one
        </a>
      </p>
    </section>
  );
}
