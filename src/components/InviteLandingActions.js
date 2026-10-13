"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FollowButton from "@/components/FollowButton";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";
import { captureAttribution } from "@/lib/attribution";

export default function InviteLandingActions({ inviter }) {
  const { user, loading } = useAuth();
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    captureAttribution();
  }, []);

  useEffect(() => {
    if (!user || user.id === inviter.id) return undefined;
    let cancelled = false;
    authedFetch(`/api/follows/status?username=${encodeURIComponent(inviter.username)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (response.ok && !cancelled) setFollowing(Boolean(body.following));
      })
      .catch(() => null);
    return () => { cancelled = true; };
  }, [inviter.id, inviter.username, user]);

  if (loading) return <div className="invite-actions-placeholder" aria-hidden="true" />;
  if (user) {
    return (
      <div className="invite-landing-actions">
        <FollowButton username={inviter.username} ownerId={inviter.id} initialFollowing={following} />
        <Link href={`/u/${inviter.username}`} className="profile-action-btn">View profile</Link>
      </div>
    );
  }
  // next= lands the new member on the welcome step, where their inviter is
  // shown first with a Follow button (see /api/follows/suggestions).
  const signup = `/signup?ref=${encodeURIComponent(inviter.username)}&utm_source=invite&utm_medium=referral&utm_campaign=member-invite&next=${encodeURIComponent("/people?welcome=1")}`;
  return (
    <div className="invite-landing-actions">
      <Link href={signup} className="primary-btn">Create your collection</Link>
      <Link href={`/login?next=${encodeURIComponent(`/u/${inviter.username}`)}`} className="profile-action-btn">I have an account</Link>
    </div>
  );
}
