"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const [errorMsg, setErrorMsg] = useState(null);
  const [showResend, setShowResend] = useState(false);
  const [resendMsg, setResendMsg] = useState(null);
  const [resending, setResending] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    setErrorMsg(null);
    setShowResend(false);
    setResendMsg(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    console.log("LOGIN DATA:", data);
    console.log("LOGIN ERROR:", error);

    if (error) {
      setSaving(false);

      if (error.message?.toLowerCase().includes("email not confirmed")) {
        setErrorMsg("Please confirm your email before logging in.");
        setShowResend(true);
      } else {
        setErrorMsg("Invalid email or password.");
      }

      return;
    }

    const user = data?.user ?? null;
    const session = data?.session ?? null;

    if (!user || !session) {
      setSaving(false);
      setErrorMsg("Login session failed. Please try again.");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    console.log("LOGIN PROFILE:", profile);
    console.log("LOGIN PROFILE ERROR:", profileError);

    setSaving(false);

    if (profileError) {
      setErrorMsg("Login succeeded, but profile lookup failed.");
      return;
    }

    if (!profile?.username) {
      router.replace("/complete-profile");
      return;
    }

    router.replace(`/u/${profile.username}`);
  }

  async function handleResendConfirmation() {
    if (!email) {
      setErrorMsg("Enter your email to resend confirmation.");
      return;
    }

    setResending(true);
    setResendMsg(null);
    setErrorMsg(null);

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });

    console.log("RESEND LOGIN ERROR:", error);

    if (error) {
      setErrorMsg("Unable to resend confirmation email.");
    } else {
      setResendMsg("Confirmation email resent. Check your inbox.");
    }

    setResending(false);
  }

  return (
    <section className="auth-panel">
      <div className="section-label badge-x" style={{ textAlign: "center" }}>
        Log In
      </div>

      <h1 className="auth-title">Welcome Back</h1>

      <form onSubmit={handleLogin} className="auth-form">
        <div className="auth-group">
          <label>Email</label>
          <input
            className="auth-input"
            type="email"
            required
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
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          className="primary-btn auth-submit"
          disabled={saving}
        >
          {saving ? "Logging in..." : "Log In"}
        </button>
      </form>

      {errorMsg && (
        <div className="auth-error">
          <p>{errorMsg}</p>

          {showResend && (
            <>
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
            </>
          )}
        </div>
      )}

      <p className="auth-footer">
        Don’t have an account?{" "}
        <Link href="/signup" className="link">
          Sign up
        </Link>
      </p>
    </section>
  );
}