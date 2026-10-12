"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";
import { trackEvent } from "@/lib/analytics";

export default function FollowButton({ username, ownerId, initialFollowing = false, onChange }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!loading && user?.id === ownerId) return null;

  async function toggle() {
    if (busy || loading) return;
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(pathname || `/u/${username}`)}`);
      return;
    }
    if (following && typeof window !== "undefined" && window.matchMedia("(hover: none)").matches) {
      if (!window.confirm(`Unfollow @${username}?`)) return;
    }
    const next = !following;
    setFollowing(next);
    setBusy(true);
    setError("");
    onChange?.(next);
    try {
      const response = await authedFetch("/api/follows", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Could not update follow.");
      }
      trackEvent(next ? "follow" : "unfollow");
    } catch (requestError) {
      setFollowing(!next);
      onChange?.(!next);
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="follow-button-wrap">
      <button
        type="button"
        className={`profile-action-btn follow-button${following ? " is-following" : ""}`}
        onClick={toggle}
        disabled={busy || loading}
        aria-label={following ? `Unfollow @${username}` : `Follow @${username}`}
      >
        <span className="follow-label">{following ? "Following" : "Follow"}</span>
        {following && <span className="unfollow-label">Unfollow</span>}
      </button>
      {error && <span className="follow-error" role="alert">{error}</span>}
    </span>
  );
}
