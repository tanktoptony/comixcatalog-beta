"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function AccountPage() {
  const { user } = useAuth();
  const supabase = getSupabaseClient();

  const [profile, setProfile] = useState(null);
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load profile once user exists
  useEffect(() => {
    if (!user) return;

    async function loadProfile() {
      const { data, error } = await supabase
        .from("profiles")
        .select("username, is_public")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Profile load error:", error);
      } else if (data) {
        setProfile(data);
        setIsPublic(data.is_public);
      }

      setLoading(false);
    }

    loadProfile();
  }, [user]);

  async function handleToggle(e) {
    if (!user) return;

    const newValue = e.target.checked;

    const { error } = await supabase
      .from("profiles")
      .update({ is_public: newValue })
      .eq("id", user.id);

    if (error) {
      console.error("Update error:", error);
      return;
    }

    setIsPublic(newValue);
  } // ✅ THIS WAS MISSING

  // Guards
  if (user === undefined) {
    return <p style={{ padding: "2rem" }}>Loading...</p>;
  }

  if (!user) {
    return <p style={{ padding: "2rem" }}>You must be logged in.</p>;
  }

  return (
    <section className="auth-panel">
      <h1 className="auth-title">My Account</h1>

      <p style={{ textAlign: "center" }}>
        <strong>{profile?.username || "No username set"}</strong>
        <br />
        {user.email}
      </p>

      {!loading && profile && (
        <div style={{ marginTop: "1rem", textAlign: "center" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={handleToggle}
            />
            Make my collection public
          </label>
        </div>
      )}

      <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
        <Link href="/library" className="landing-btn landing-btn-primary">
          View My Library
        </Link>

        {profile?.username && isPublic && (
          <>
            <br />
            <Link
              href={`/u/${profile.username}`}
              className="landing-btn landing-btn-secondary"
              style={{ marginTop: "0.5rem" }}
            >
              View Public Profile
            </Link>
          </>
        )}

        <br />
        <Link
          href="/search"
          className="landing-btn landing-btn-secondary"
          style={{ marginTop: "0.5rem" }}
        >
          Explore Comics
        </Link>
      </div>
    </section>
  );
}