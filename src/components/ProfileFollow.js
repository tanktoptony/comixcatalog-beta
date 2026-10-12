"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FollowButton from "@/components/FollowButton";
import { authedFetch } from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";

export default function ProfileFollow({ username, ownerId, children }) {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    authedFetch(`/api/follows/status?username=${encodeURIComponent(username)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load follow status.");
        const body = await response.json();
        if (!cancelled) setStatus(body);
      })
      .catch(() => {
        if (!cancelled) setStatus({ following: false, followers: 0, following_count: 0 });
      });
    return () => { cancelled = true; };
  }, [username]);

  return (
    <>
      <div className="profile-follow-counts" aria-label="Follow counts">
        {user?.id === ownerId ? (
          <>
            <Link href="/people?tab=followers"><strong>{status?.followers ?? "-"}</strong> followers</Link>
            <Link href="/people?tab=following"><strong>{status?.following_count ?? "-"}</strong> following</Link>
          </>
        ) : (
          <>
            <span><strong>{status?.followers ?? "-"}</strong> followers</span>
            <span><strong>{status?.following_count ?? "-"}</strong> following</span>
          </>
        )}
      </div>
      <div className="profile-actions">
        {status && (
          <FollowButton
            key={`${username}-${status.following}`}
            username={username}
            ownerId={ownerId}
            initialFollowing={status.following}
            onChange={(following) => setStatus((current) => ({
              ...current,
              following,
              followers: Math.max(0, current.followers + (following ? 1 : -1)),
            }))}
          />
        )}
        {children}
      </div>
    </>
  );
}
