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
        error: userError,
      } = await supabase.auth.getUser();

      console.log("COMPLETE PROFILE USER:", user);
      console.log("COMPLETE PROFILE USER ERROR:", userError);

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();

      console.log("COMPLETE PROFILE CHECK:", profile);
      console.log("COMPLETE PROFILE CHECK ERROR:", profileError);

      if (profileError) {
        return;
      }

      if (profile?.username) {
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
      error: userError,
    } = await supabase.auth.getUser();

    console.log("COMPLETE PROFILE SUBMIT USER:", user);
    console.log("COMPLETE PROFILE SUBMIT USER ERROR:", userError);

    if (!user) {
      setSaving(false);
      router.replace("/login");
      return;
    }

    const { data: existing, error: existingError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", usernameNormalized)
      .maybeSingle();

    console.log("COMPLETE PROFILE EXISTING:", existing);
    console.log("COMPLETE PROFILE EXISTING ERROR:", existingError);

    if (existingError) {
      setSaving(false);
      setErrorMsg("Could not verify username availability.");
      return;
    }

    if (existing && existing.id !== user.id) {
      setSaving(false);
      setErrorMsg("That username is already taken.");
      return;
    }

    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          username: usernameNormalized,
          is_public: true,
        },
        { onConflict: "id" }
      );

    console.log("COMPLETE PROFILE UPSERT ERROR:", upsertError);

    if (upsertError) {
      setSaving(false);
      setErrorMsg("Something went wrong. Try again.");
      return;
    }

    setSaving(false);
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
            autoComplete="username"
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