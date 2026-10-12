"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FollowButton from "@/components/FollowButton";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";
import { trackEvent } from "@/lib/analytics";
import Avatar from "@/components/Avatar";

function MemberAvatar({ member }) {
  return <Avatar profile={member} className="people-avatar" />;
}

function MemberCard({ member, showFollow, privateWithoutLink = false }) {
  const content = (
    <>
      <MemberAvatar member={member} />
      <span className="people-member-copy">
        <strong>{member.display_name || member.username}</strong>
        <span>@{member.username}</span>
      </span>
    </>
  );
  return (
    <article className="people-card">
      {privateWithoutLink ? <div className="people-profile-link">{content}</div> : <Link href={`/u/${member.username}`} className="people-profile-link">{content}</Link>}
      {showFollow && <FollowButton username={member.username} initialFollowing={member.following} compact />}
    </article>
  );
}

export default function PeopleClient({ initialTab = "following" }) {
  const { user, loading } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [tab, setTab] = useState(initialTab);
  const [lists, setLists] = useState({ following: null, followers: null });
  const [error, setError] = useState("");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      // Clearing a stale search when the box empties; nothing to fetch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setSearched(false);
      setSearching(false);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const response = await authedFetch(`/api/members/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not search members.");
        if (!cancelled) {
          setResults(body);
          setSearched(true);
          trackEvent("member_search", { had_results: body.length > 0 });
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    if (!user || lists[tab] !== null) return;
    let cancelled = false;
    authedFetch(`/api/follows?list=${tab}&limit=100&offset=0`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load members.");
        if (!cancelled) setLists((current) => ({ ...current, [tab]: body }));
      })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); });
    return () => { cancelled = true; };
  }, [user, tab, lists]);

  const currentList = lists[tab];
  return (
    <main className="people-page">
      <header className="people-heading">
        <p className="eyebrow">Community</p>
        <h1>Find collectors</h1>
        <p>Search for friends and see what they collect.</p>
      </header>
      <label className="people-search-label" htmlFor="member-search">Find collectors by username or name</label>
      <input
        id="member-search"
        className="people-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Username or name"
        autoComplete="off"
      />
      {searching && <p className="people-state">Searching...</p>}
      {!searching && searched && results.length === 0 && <p className="people-state">No collectors found. Try another name or username.</p>}
      {error && <p className="people-error" role="alert">{error}</p>}
      {results.length > 0 && <section className="people-list" aria-label="Search results">{results.map((member) => <MemberCard key={member.username} member={member} showFollow={Boolean(user)} />)}</section>}

      {!loading && !user && <p className="people-signin"><Link href="/login?next=/people">Sign in</Link> to follow collectors.</p>}
      {user && (
        <section className="people-connections">
          <div className="people-tabs" role="tablist" aria-label="Your connections">
            <button type="button" role="tab" aria-selected={tab === "following"} className={tab === "following" ? "active" : ""} onClick={() => setTab("following")}>Following</button>
            <button type="button" role="tab" aria-selected={tab === "followers"} className={tab === "followers" ? "active" : ""} onClick={() => setTab("followers")}>Followers</button>
          </div>
          {currentList === null ? <p className="people-state">Loading...</p> : currentList.length === 0 ? (
            <p className="people-state">{tab === "following" ? "You're not following anyone yet. Search for a friend's username above." : "No one is following you yet. Share your public profile with friends."}</p>
          ) : (
            <div className="people-list">{currentList.map((member) => <MemberCard key={member.username} member={member} privateWithoutLink={member.is_public === false} />)}</div>
          )}
        </section>
      )}
    </main>
  );
}
