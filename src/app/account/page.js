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
import styles from "./account.module.css";
import PayoutsPrompt from "@/components/PayoutsPrompt";

export default function AccountSettingsPage() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const supabase = getSupabaseClient();

  const [isPublic, setIsPublic] = useState(false);
  const [privacyMsg, setPrivacyMsg] = useState(null);
  const [emailOnMessage, setEmailOnMessage] = useState(true);
  const [emailTips, setEmailTips] = useState(true);
  const [notificationMsg, setNotificationMsg] = useState(null);
  const [tipsMsg, setTipsMsg] = useState(null);

  // Mirror profile.is_public into local state once profile resolves so the
  // checkbox is checked correctly on first render. Adjusted during render
  // (React's documented "reset state when a value changes" pattern, same
  // convention as Header.js's pathname/highlight resets) rather than in an
  // effect, so there's no extra stale-checkbox render in between.
  const [syncedProfile, setSyncedProfile] = useState(null);
  if (profile && profile !== syncedProfile) {
    setSyncedProfile(profile);
    setIsPublic(Boolean(profile.is_public));
  }

  // Bounce unauthenticated visitors. Wait for AuthContext to finish hydrating
  // first; otherwise a logged-in user hard-refreshing flashes /login briefly.
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    async function loadNotificationSetting() {
      const { data, error } = await supabase
        .from("notification_settings")
        .select("email_on_message")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active) return;
      if (error) {
        setNotificationMsg({ kind: "error", text: error.message });
      } else {
        setEmailOnMessage(data?.email_on_message !== false);
      }
    }
    loadNotificationSetting();
    return () => { active = false; };
  }, [supabase, user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    async function loadTipsSetting() {
      const { data, error } = await supabase.from("profiles").select("email_tips").eq("id", user.id).single();
      if (!active) return;
      if (error) setTipsMsg({ kind: "error", text: error.message });
      else setEmailTips(data.email_tips !== false);
    }
    loadTipsSetting();
    return () => { active = false; };
  }, [supabase, user]);

  useEffect(() => {
    if (privacyMsg?.kind !== "success") return;
    const timer = setTimeout(() => setPrivacyMsg(null), 2000);
    return () => clearTimeout(timer);
  }, [privacyMsg]);

  useEffect(() => {
    if (notificationMsg?.kind !== "success") return;
    const timer = setTimeout(() => setNotificationMsg(null), 2000);
    return () => clearTimeout(timer);
  }, [notificationMsg]);

  useEffect(() => {
    if (tipsMsg?.kind !== "success") return;
    const timer = setTimeout(() => setTipsMsg(null), 2000);
    return () => clearTimeout(timer);
  }, [tipsMsg]);

  if (loading || !user) {
    return (
      <main className={styles.shell}>
        <p className={styles.loading}>Loading...</p>
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
      setPrivacyMsg({ kind: "success", text: "Saved" });
    }
  }

  async function handleNotificationToggle(e) {
    const next = e.target.checked;
    setEmailOnMessage(next);
    setNotificationMsg(null);
    const { error } = await supabase.from("notification_settings").upsert({
      user_id: user.id,
      email_on_message: next,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      setEmailOnMessage(!next);
      setNotificationMsg({ kind: "error", text: error.message });
    } else {
      setNotificationMsg({ kind: "success", text: "Saved" });
    }
  }

  async function handleTipsToggle(e) {
    const next = e.target.checked;
    setEmailTips(next);
    setTipsMsg(null);
    const { error } = await supabase.from("profiles").update({ email_tips: next }).eq("id", user.id);
    if (error) {
      setEmailTips(!next);
      setTipsMsg({ kind: "error", text: error.message });
    } else {
      setTipsMsg({ kind: "success", text: "Saved" });
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <div className={styles.eyebrow}>Account settings</div>
          <h1 className={styles.title}>
            {profile?.username ?? user.email}
          </h1>
          <p className={styles.subtitle}>
            Manage your sign-in, email, privacy, and account data.
          </p>
          <div className={styles.membershipRow}>
            <div className="profile-badges" aria-label="Membership status">
              {profile?.is_founding_collector && (
                <span className="profile-badge founding">★ Founding Collector</span>
              )}
              {profile?.is_pro && <span className="profile-badge pro">PRO</span>}
              {profile?.membership_tier === "collector_plus" && (
                <span className="profile-badge pro">Collector+</span>
              )}
            </div>
            <Link href="/upgrade" className={styles.membershipLink}>
              Manage membership
            </Link>
          </div>
        </div>
        <Link href="/library" className={styles.backLink}>
          ← Back to library
        </Link>
      </header>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardHeading}>
            <h2>Profile</h2>
            <span className={styles.username}>@{profile?.username ?? "not set"}</span>
          </div>
          <ToggleSetting
            id="public-collection"
            checked={isPublic}
            onChange={handlePublicToggle}
            label="Make my collection public"
            message={privacyMsg}
          >
            Anyone with your link can see your profile at /u/{profile?.username ?? "username"}.
            {profile?.username && (
              <> <Link href={`/u/${profile.username}`} className={styles.inlineLink}>View my profile</Link></>
            )}
          </ToggleSetting>
        </section>

        <PayoutsPrompt
          showWhenReady
          card={{ className: `${styles.card} ${styles.wide}`, headingClassName: styles.cardHeading }}
        />

        <section className={styles.card} id="notifications">
          <div className={styles.cardHeading}><h2>Notifications</h2></div>
          <ToggleSetting
            id="email-on-message"
            checked={emailOnMessage}
            onChange={handleNotificationToggle}
            label="Email me when someone sends me a message"
            message={notificationMsg}
          />
          <ToggleSetting
            id="email-tips"
            checked={emailTips}
            onChange={handleTipsToggle}
            label="Tips to get started"
            message={tipsMsg}
          >
            A couple of short emails to help you add your first comic.
          </ToggleSetting>
        </section>

        <section className={`${styles.card} ${styles.wide}`}>
          <div className={styles.cardHeading}><h2>Change password</h2></div>
          <ChangePassword supabase={supabase} />
        </section>

        <section className={`${styles.card} ${styles.wide}`}>
          <div className={styles.cardHeading}><h2>Change email</h2></div>
          <p className={styles.description}>
            Current: <strong>{user.email}</strong>. You&rsquo;ll receive a confirmation
            email at the new address; the change takes effect after you click it.
          </p>
          <ChangeEmail supabase={supabase} currentEmail={user.email} />
        </section>

        <section className={`${styles.card} ${styles.wide}`}>
          <div className={styles.cardHeading}><h2>Sessions</h2></div>
          <p className={styles.description}>
            Sign out this account on every browser and device, including this one.
          </p>
          <SignOutEverywhere supabase={supabase} />
        </section>

        <section className={`${styles.card} ${styles.danger} ${styles.wide}`}>
          <div className={styles.cardHeading}><h2>Danger zone</h2></div>
          <h3 className={styles.dangerTitle}>Delete account</h3>
          <p className={styles.description}>
            Permanently delete your account, profile, and collection data. This
            can&rsquo;t be undone.
          </p>
          <DeleteAccount
            supabase={supabase}
            onDeleted={async () => {
              await signOut();
              if (typeof window !== "undefined") window.location.href = "/";
            }}
          />
        </section>
      </div>
    </main>
  );
}

function SignOutEverywhere({ supabase }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function handleSignOut() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) {
        setMsg({ kind: "error", text: error.message || "Could not sign out all devices." });
        return;
      }
      if (typeof window !== "undefined") window.location.href = "/login";
    } catch (error) {
      setMsg({ kind: "error", text: "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return <button type="button" className="secondary-btn" onClick={() => setConfirming(true)}>Sign out of all devices</button>;
  }
  return (
    <div className={styles.deleteActions}>
      <button type="button" className="danger-btn" onClick={handleSignOut} disabled={busy}>
        {busy ? "Signing out..." : "Yes, sign out everywhere"}
      </button>
      <button type="button" className="secondary-btn" onClick={() => { setConfirming(false); setMsg(null); }} disabled={busy}>
        Cancel
      </button>
      {msg && <div className={styles.formError} role="status">{msg.text}</div>}
    </div>
  );
}

function ToggleSetting({ id, checked, onChange, label, message, children }) {
  const helpId = children ? `${id}-help` : undefined;
  return (
    <div className={styles.setting}>
      <div className={styles.settingCopy}>
        <label htmlFor={id} className={styles.settingLabel}>{label}</label>
        {children && <p id={helpId} className={styles.settingHelp}>{children}</p>}
      </div>
      <div className={styles.settingControl}>
        {message && (
          <span className={message.kind === "success" ? styles.saved : styles.error} role="status">
            {message.text}
          </span>
        )}
        <label className={styles.switch}>
          <span className={styles.srOnly}>{label}</span>
          <input
            id={id}
            type="checkbox"
            role="switch"
            checked={checked}
            onChange={onChange}
            aria-describedby={helpId}
          />
          <span className={styles.switchTrack} aria-hidden="true" />
        </label>
      </div>
    </div>
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
    <form onSubmit={handleSubmit} className={styles.inlineForm}>
      <input
        type="password"
        className={`auth-input ${styles.input}`}
        aria-label="New password"
        placeholder="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        minLength={8}
        required
      />
      <input
        type="password"
        className={`auth-input ${styles.input}`}
        aria-label="Confirm new password"
        placeholder="Confirm new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        minLength={8}
        required
      />
      <button type="submit" className={`primary-btn ${styles.formButton}`} disabled={busy}>
        {busy ? "Updating..." : "Update password"}
      </button>
      {msg && (
        <div className={msg.kind === "success" ? styles.formSuccess : styles.formError} role="status">
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
    <form onSubmit={handleSubmit} className={styles.inlineForm}>
      <input
        type="email"
        className={`auth-input ${styles.input}`}
        aria-label="New email"
        placeholder="New email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />
      <button type="submit" className={`primary-btn ${styles.formButton}`} disabled={busy}>
        {busy ? "Sending..." : "Send confirmation"}
      </button>
      {msg && (
        <div className={msg.kind === "success" ? styles.formSuccess : styles.formError} role="status">
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
function DeleteAccount({ supabase, onDeleted }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function handleDelete() {
    if (busy || confirmText !== "DELETE") return;
    setBusy(true);
    setMsg(null);
    try {
      // The server route has no cookie to identify us by (see
      // src/lib/supabase/server.js) — forward our own access token so it
      // can verify who's calling.
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMsg({ kind: "error", text: "Your session has expired. Please log in again." });
        return;
      }

      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
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
        Delete my account...
      </button>
    );
  }

  return (
    <div className={styles.deleteForm}>
      <p className={styles.description}>
        Type <strong>DELETE</strong> below to confirm. This deletes your auth
        record, your profile, your collection, and any covers you&rsquo;ve uploaded.
      </p>
      <input
        type="text"
        className={`auth-input ${styles.deleteInput}`}
        aria-label="Type DELETE to confirm"
        placeholder='Type "DELETE" to confirm'
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        autoComplete="off"
      />
      <div className={styles.deleteActions}>
        <button
          type="button"
          className="danger-btn"
          onClick={handleDelete}
          disabled={busy || confirmText !== "DELETE"}
        >
          {busy ? "Deleting..." : "Permanently delete"}
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
      {msg && <div className={styles.formError} role="status">{msg.text}</div>}
    </div>
  );
}
