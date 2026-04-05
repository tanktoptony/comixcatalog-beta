"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

const AVATAR_KEYS = [
  "hero_01","hero_02","hero_03","hero_04",
  "hero_05","hero_06","hero_07","hero_08",
  "hero_09","hero_10","hero_11","hero_12",
  "hero_13","hero_14","hero_15","hero_16",
];

export default function SignUpPage() {
  const supabase = getSupabaseClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [avatarKey, setAvatarKey] = useState("hero_01");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [resendMsg, setResendMsg] = useState(null);
  const [resending, setResending] = useState(false);

  async function handleResendConfirmation() {
    if (!email) {
      setErrorMsg("Enter your email to resend confirmation.");
      return;
    }

    setResending(true);
    setResendMsg(null);
    setErrorMsg(null);

    const { data, error } = await supabase.auth.resend({
      type: "signup",
      email,
    });

    console.log("RESEND DATA:", data);
    console.log("RESEND ERROR:", error);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setResendMsg("Confirmation email resent. Check your inbox.");
    }

    setResending(false);
  }

  async function handleSignup(e) {
    e.preventDefault();
    if (saving) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setResendMsg(null);

    const usernameNormalized = username.trim().toLowerCase();

    if (!/^[a-z0-9_]{3,20}$/.test(usernameNormalized)) {
      setErrorMsg(
        "Username must be 3–20 characters (letters, numbers, underscore)."
      );
      return;
    }

    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }

    setSaving(true);

    const origin =
      typeof window !== "undefined" ? window.location.origin : undefined;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: origin ? `${origin}/auth/callback` : undefined,
        data: {
          username: usernameNormalized,
          avatar_key: avatarKey,
        },
      },
    });

    console.log("SIGNUP DATA:", data);
    console.log("SIGNUP ERROR:", error);

    if (error) {
      setSaving(false);
      setErrorMsg(error.message);
      return;
    }

    const user = data?.user ?? null;
    const session = data?.session ?? null;

    // Only try client-side profile creation if we actually have a session.
    // If email confirmation is required, session may be null here even though signup succeeded.
    if (user && session) {
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            username: usernameNormalized,
            avatar_key: avatarKey,
            is_public: true,
          },
          { onConflict: "id" }
        );

      console.log("PROFILE UPSERT ERROR:", profileError);

      if (profileError) {
        // Do not fail the whole signup flow if auth user was created.
        setSuccessMsg(
          "Account created, but profile setup will finish after login or email confirmation."
        );
        setSaving(false);
        return;
      }
    }

    setSuccessMsg(
      "Account created! Please check your email to confirm your account before logging in."
    );

    setSaving(false);
    setEmail("");
    setPassword("");
    setUsername("");
    setAvatarKey("hero_01");
  }

  return (
    <section className="auth-panel">
      <div className="section-label badge-x" style={{ textAlign: "center" }}>
        Create Account
      </div>

      <h1 className="auth-title">Join ComixCatalog</h1>

      <form onSubmit={handleSignup} className="auth-form">
        <div className="auth-group">
          <label>Username</label>
          <input
            className="auth-input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </div>

        <div className="auth-group">
          <label>Email</label>
          <input
            className="auth-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>

        <div className="auth-group">
          <label>Password</label>
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        <div className="auth-group">
          <label>Choose an avatar</label>
          <div className="avatar-grid">
            {AVATAR_KEYS.map((key) => {
              const selected = key === avatarKey;
              return (
                <button
                  key={key}
                  type="button"
                  className={`avatar-choice ${selected ? "is-selected" : ""}`}
                  onClick={() => setAvatarKey(key)}
                >
                  <Image
                    src={`/avatars/${key}.png`}
                    alt={key}
                    width={46}
                    height={46}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <button
          className="primary-btn auth-submit"
          type="submit"
          disabled={saving}
        >
          {saving ? "Creating..." : "Sign Up"}
        </button>
      </form>

      {errorMsg && <div className="auth-error">{errorMsg}</div>}

      {successMsg && (
        <div className="auth-success">
          <p>{successMsg}</p>

          <button
            type="button"
            className="auth-link-button"
            onClick={handleResendConfirmation}
            disabled={resending}
            style={{ marginTop: 8 }}
          >
            {resending ? "Resending..." : "Resend confirmation email"}
          </button>

          {resendMsg && (
            <div style={{ marginTop: 6, fontSize: 13 }}>
              {resendMsg}
            </div>
          )}
        </div>
      )}

      <p className="auth-footer">
        Already have an account?{" "}
        <Link href="/login" className="link">
          Log in
        </Link>
      </p>
    </section>
  );
}