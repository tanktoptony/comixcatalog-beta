"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function CompleteProfilePage() {
  const supabase = getSupabaseClient();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    async function checkIfAlreadyComplete() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single();

      if (!error && profile?.username) {
        router.replace(`/u/${profile.username}`);
      }
    }

    checkIfAlreadyComplete();
  }, [router, supabase]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;

    const usernameNormalized = username.trim().toLowerCase();

    if (!usernameNormalized) {
      setErrorMsg("Username is required.");
      return;
    }

    if (!/^[a-z0-9_]{3,20}$/.test(usernameNormalized)) {
      setErrorMsg(
        "Username must be 3–20 characters (letters, numbers, underscore)."
      );
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    // Check uniqueness
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", usernameNormalized)
      .maybeSingle();

    if (existing && existing.id !== user.id) {
      setSaving(false);
      setErrorMsg("That username is already taken.");
      return;
    }

    // 🔥 THE FIX: use UPSERT instead of update
    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          username: usernameNormalized,
          is_public: true,
        },
        { onConflict: "id" }
      );

    if (error) {
      setSaving(false);
      setErrorMsg("Something went wrong. Try again.");
      return;
    }

    router.replace(`/u/${usernameNormalized}`);
  }

  return (
    <section className="auth-panel">
      <h1 className="auth-title">Choose Your Username</h1>

      <form onSubmit={handleSubmit} className="auth-form">
        <div className="auth-group">
          <label>Username</label>
          <input
            className="auth-input"
            type="text"
            placeholder="your_name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="primary-btn auth-submit"
          disabled={saving}
        >
          {saving ? "Saving..." : "Continue"}
        </button>
      </form>

      {errorMsg && (
        <div
          style={{
            marginTop: 14,
            padding: 10,
            borderRadius: 8,
            background: "rgba(255,0,0,0.1)",
            border: "1px solid rgba(255,0,0,0.3)",
            fontSize: 14,
          }}
        >
          {errorMsg}
        </div>
      )}
    </section>
  );
}