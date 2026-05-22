"use client";

// /account — signed-in user settings.
//
// Sections:
//   1. Profile — username display, "public collection" toggle (preserved from
//      the original minimal version).
//   2. Change password — supabase.auth.updateUser({ password }).
//   3. Change email — supabase.auth.updateUser({ email }). Supabase sends
//      confirmation to BOTH addresses; the change isn't effective until the
//      new address is clicked.
//   4. Delete account — calls /api/account/delete (server-side, service
//      role) because the supabase client can't remove auth.users rows.
//
// Logged-out visitors get bounced to /login by the useEffect below.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function AccountSettingsPage() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const supabase = getSupabaseClient();

  const [isPublic, setIsPublic] = useState(false);
  const [privacyMsg, setPrivacyMsg] = useState(null);

  // Mirror profile.is_public into local state once profile resolves so the
  // checkbox is checked correctly on first render.
  useEffect(() => {
    if (profile) setIsPublic(Boolean(profile.is_public));
  }, [profile]);

  // Bounce unauthenticated visitors. Wait for AuthContext to finish hydrating
  // first; otherwise a logged-in user hard-refreshing flashes /login briefly.
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <main className="account-shell">
        <p style={{ opacity: 0.7, padding: 24 }}>Loading…</p>
      </main>
    );
  }

  async function handlePublicToggle(e) {
    const next = e.target.checked;
    setIsPublic(next); // optimistic
    setPrivacyMsg(null);
    const { error } = await supabase
      .from("profiles")
      .update({ is_public: next })
      .eq("id", user.id);
    if (error) {
      setIsPublic(!next); // revert
      setPrivacyMsg({ kind: "error", text: error.message ?? "Could not update privacy setting." });
    } else {
      setPrivacyMsg({ kind: "success", text: next ? "Profile is now public." : "Profile is now private." });
    }
  }

  return (
    <main className="account-shell">
      <header className="account-header">
        <div>
          <div className="account-kicker">Account Settings</div>
          <h1 className="account-title">
            {profile?.username ?? user.email}
          </h1>
          <p className="account-subtitle">
            Manage your sign-in, email, privacy, and account data.
          </p>
        </div>
        <Link href="/library" className="account-link-back">
          ← Back to library
        </Link>
      </header>

      <section className="account-section">
        <h2 className="account-section-title">Profile</h2>
        <p className="account-section-desc">
          Username: <strong>{profile?.username ?? "(not set)"}</strong>
          {profile?.username && profile.is_public && (
            <>
              {" "}— <Link href={`/u/${profile.username}`} className="auth-link">View public profile</Link>
            </>
          )}
        </p>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <input
            type="checkbox"
            checked={isPublic}
            onChange={handlePublicToggle}
          />
          Make my collection public
        </label>
        {privacyMsg && (
          <div
            className={privacyMsg.kind === "success" ? "auth-success" : "auth-error"}
            style={{ marginTop: 8 }}
          >
            {privacyMsg.text}
          </div>
        )}
      </section>

      <section className="account-section">
        <h2 className="account-section-title">Change password</h2>
        <ChangePassword supabase={supabase} />
      </section>

      <section className="account-section">
        <h2 className="account-section-title">Change email</h2>
        <p className="account-section-desc">
          Current: <strong>{user.email}</strong>. You'll receive a confirmation
          email at the new address; the change takes effect after you click it.
        </p>
        <ChangeEmail supabase={supabase} currentEmail={user.email} />
      </section>

      <section className="account-section account-section-danger">
        <h2 className="account-section-title">Delete account</h2>
        <p className="account-section-desc">
          Permanently delete your account, profile, and collection data. This
          can&rsquo;t be undone.
        </p>
        <DeleteAccount
          onDeleted={async () => {
            await signOut();
            if (typeof window !== "undefined") window.location.href = "/";
          }}
        />
      </section>
    </main>
  );
}

// ── Change password ──────────────────────────────────────────────────────
function ChangePassword({ supabase }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setMsg(null);
    if (password.length < 8) {
      setMsg({ kind: "error", text: "Password must be at least 8 characters." });
      return;
    }
    if (password !== confirm) {
      setMsg({ kind: "error", text: "Passwords don't match." });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMsg({ kind: "error", text: error.message || "Could not update password." });
      } else {
        setMsg({ kind: "success", text: "Password updated." });
        setPassword("");
        setConfirm("");
      }
    } catch (err) {
      setMsg({ kind: "error", text: "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="account-form">
      <input
        type="password"
        className="auth-input"
        placeholder="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        minLength={8}
        required
      />
      <input
        type="password"
        className="auth-input"
        placeholder="Confirm new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        minLength={8}
        required
      />
      <button type="submit" className="primary-btn" disabled={busy}>
        {busy ? "Updating…" : "Update password"}
      </button>
      {msg && (
        <div className={msg.kind === "success" ? "auth-success" : "auth-error"}>
          {msg.text}
        </div>
      )}
    </form>
  );
}

// ── Change email ─────────────────────────────────────────────────────────
function ChangeEmail({ supabase, currentEmail }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setMsg(null);
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setMsg({ kind: "error", text: "Enter a new email." });
      return;
    }
    if (normalized === currentEmail?.toLowerCase()) {
      setMsg({ kind: "error", text: "That's already your current email." });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: normalized });
      if (error) {
        setMsg({ kind: "error", text: error.message || "Could not update email." });
      } else {
        setMsg({
          kind: "success",
          text: `Confirmation sent to ${normalized}. Click the link to complete the change.`,
        });
        setEmail("");
      }
    } catch (err) {
      setMsg({ kind: "error", text: "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="account-form">
      <input
        type="email"
        className="auth-input"
        placeholder="New email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />
      <button type="submit" className="primary-btn" disabled={busy}>
        {busy ? "Sending…" : "Send confirmation"}
      </button>
      {msg && (
        <div className={msg.kind === "success" ? "auth-success" : "auth-error"}>
          {msg.text}
        </div>
      )}
    </form>
  );
}

// ── Delete account ───────────────────────────────────────────────────────
// Two-step confirmation. Click reveals an input that requires "DELETE" to
// enable the actual destructive button. Forces deliberate action so accidental
// clicks can't cascade.
function DeleteAccount({ onDeleted }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function handleDelete() {
    if (busy || confirmText !== "DELETE") return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMsg({ kind: "error", text: body.error || "Could not delete account." });
        return;
      }
      await onDeleted?.();
    } catch (err) {
      setMsg({ kind: "error", text: "Network error. Try again." });
    } finally {
      setBusy(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        className="danger-btn"
        onClick={() => setExpanded(true)}
      >
        Delete my account…
      </button>
    );
  }

  return (
    <div className="account-form">
      <p className="account-section-desc">
        Type <strong>DELETE</strong> below to confirm. This deletes your auth
        record, your profile, your collection, and any covers you've uploaded.
      </p>
      <input
        type="text"
        className="auth-input"
        placeholder='Type "DELETE" to confirm'
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        autoComplete="off"
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="danger-btn"
          onClick={handleDelete}
          disabled={busy || confirmText !== "DELETE"}
        >
          {busy ? "Deleting…" : "Permanently delete"}
        </button>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => {
            setExpanded(false);
            setConfirmText("");
            setMsg(null);
          }}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
      {msg && <div className="auth-error">{msg.text}</div>}
    </div>
  );
}
