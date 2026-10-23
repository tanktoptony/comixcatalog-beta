"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import FollowButton from "@/components/FollowButton";
import MessageButton from "@/components/MessageButton";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";

function CollectorCard({ member, compact = false }) {
  return (
    <article className={`people-suggestion-card${compact ? " is-compact" : ""}`}>
      <Link href={`/u/${member.username}`} className="people-suggestion-profile">
        <Avatar profile={member} className="people-avatar" />
        <span className="people-member-copy">
          <strong>{member.display_name || member.username}</strong>
          <span>@{member.username}</span>
        </span>
      </Link>
      <p className="people-suggestion-reason">{member.reason_text || "Active collector"}</p>
      <p className="people-suggestion-count">
        {member.owned_count} {Number(member.owned_count) === 1 ? "book" : "books"}
      </p>
      <div className="people-suggestion-actions">
        <FollowButton username={member.username} ownerId={member.id} initialFollowing={member.following} compact />
        <MessageButton recipientUsername={member.username} recipientId={member.id} compact />
      </div>
    </article>
  );
}

function SuggestionRow({ title, members, compact = false }) {
  if (!members?.length) return null;
  const headingId = `suggestions-${title.replaceAll(" ", "-").toLowerCase()}`;
  return (
    <section className="people-suggestion-row" aria-labelledby={headingId}>
      <div className="people-suggestions-heading">
        <h2 id={headingId}>{title}</h2>
      </div>
      <div className="people-suggestion-grid">
        {members.map((member) => <CollectorCard key={member.id || member.username} member={member} compact={compact} />)}
      </div>
    </section>
  );
}

export default function SuggestedCollectors({ welcome = false, compact = false }) {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return undefined;
    let cancelled = false;
    authedFetch(`/api/follows/suggestions${welcome ? "?welcome=1" : ""}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load collector suggestions.");
        if (!cancelled) setData(body);
      })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); });
    return () => { cancelled = true; };
  }, [authLoading, user?.id, welcome]);

  if (!data && !error) return <p className="people-state">Loading collectors...</p>;
  if (error) return <p className="people-error" role="alert">{error}</p>;
  if (data.signedOut) return <SuggestionRow title="Collectors" members={data.publicCollectors} />;
  const top = compact ? data.peopleYouMayKnow?.slice(0, 3) : data.peopleYouMayKnow?.slice(0, 12);
  if (compact) {
    return (
      <section className="library-sidebar-section people-compact">
        <div className="library-sidebar-title">People you may know</div>
        <SuggestionRow title="People you may know" members={top} compact />
        <Link href="/people" className="people-see-all">See all collectors</Link>
      </section>
    );
  }
  return (
    <div id="collectors-to-follow" className="people-suggestions">
      <SuggestionRow title="People you may know" members={top} />
      <SuggestionRow title={`Other ${data.publisherName || "comic"} collectors`} members={data.publisherCollectors?.slice(0, 12)} />
      <SuggestionRow title="Collect the same runs" members={data.sharedRuns?.slice(0, 12)} />
      {!top?.length && <p className="people-state">You are all caught up. Check back as more collectors join.</p>}
    </div>
  );
}
