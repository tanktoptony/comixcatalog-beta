"use client";

import { useState } from "react";
import { buildInviteShare } from "@/lib/invites";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/context/AuthContext";

export default function InviteButton({ username, ownerId, className = "profile-action-btn", onShared }) {
  const { user, loading } = useAuth();
  const [message, setMessage] = useState("");

  if (loading || !user || (ownerId && user.id !== ownerId)) return null;

  async function share() {
    const payload = buildInviteShare(username);
    if (!payload) return;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share(payload);
        trackEvent("invite_shared", { method: "share" });
      } else {
        await navigator.clipboard.writeText(payload.url);
        setMessage("Link copied");
        trackEvent("invite_shared", { method: "copy" });
      }
      onShared?.();
    } catch (error) {
      if (error?.name !== "AbortError") setMessage("Could not share link");
    }
  }

  return (
    <span className="invite-button-wrap">
      <button type="button" className={className} onClick={share} aria-label="Invite a friend">
        Invite a friend
      </button>
      <span className="invite-share-status" aria-live="polite">{message}</span>
    </span>
  );
}
