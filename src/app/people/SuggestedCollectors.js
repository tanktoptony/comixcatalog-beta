"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";
import { trackEvent } from "@/lib/analytics";

function badgeFor(member) {
  if (member.is_founding_collector) return "Founding Collector";
  if (member.membership_tier === "collector_plus") return "Collector+";
  if (member.is_pro) return "Pro";
  return null;
}

export default function SuggestedCollectors() {
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return undefined;
    let cancelled = false;
    authedFetch("/api/follows/suggestions", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load collector suggestions.");
        if (!cancelled) {
          setMembers(body);
          setSelected(new Set(body.map((member) => member.username)));
        }
      })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authLoading, user?.id]);

  const selectable = useMemo(() => members.filter((member) => !member.following), [members]);
  const selectedCount = selectable.filter((member) => selected.has(member.username)).length;
  const allSelected = selectable.length > 0 && selectedCount === selectable.length;

  function toggle(username) {
    if (busy) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  }

  async function followSelected() {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`${pathname || "/people"}#collectors-to-follow`)}`);
      return;
    }
    const usernames = selectable.filter((member) => selected.has(member.username)).map((member) => member.username);
    if (busy || usernames.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const response = await authedFetch("/api/follows/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not follow selected collectors.");
      const resultByUsername = new Map(body.results.map((result) => [result.username, result]));
      setMembers((current) => current.map((member) => (
        resultByUsername.get(member.username)?.status === "followed" ? { ...member, following: true } : member
      )));
      setSelected((current) => {
        const next = new Set(current);
        body.results.forEach((result) => { if (result.status === "followed") next.delete(result.username); });
        return next;
      });
      if (body.followed_count > 0) trackEvent("follow_bulk", { count: body.followed_count });
      const failed = body.results.filter((result) => ["blocked", "not_found", "invalid", "rate_limited"].includes(result.status));
      if (failed.length > 0) setError(`${failed.length} selected collector${failed.length === 1 ? " was" : "s were"} not followed.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="collectors-to-follow" className="people-suggestions" aria-labelledby="suggestions-title">
      <div className="people-suggestions-heading">
        <div><p className="eyebrow">Discover</p><h2 id="suggestions-title">Collectors to follow</h2></div>
        {!loading && members.length > 0 && <span>{members.length} collectors</span>}
      </div>
      {loading && <p className="people-state">Loading collectors...</p>}
      {!loading && members.length === 0 && !error && <p className="people-state">You are all caught up. Check back as more collectors join.</p>}
      {members.length > 0 && (
        <div className="people-suggestion-grid">
          {members.map((member) => {
            const badge = badgeFor(member);
            const isSelected = selected.has(member.username);
            return (
              <article key={member.username} className={`people-suggestion-card${isSelected ? " is-selected" : ""}${member.following ? " is-following" : ""}`}>
                <button type="button" className="people-select" role="checkbox" aria-checked={member.following || isSelected} aria-label={member.following ? `Following @${member.username}` : `Select @${member.username}`} disabled={member.following || busy} onClick={() => toggle(member.username)}>
                  {member.following || isSelected ? "✓" : ""}
                </button>
                <Link href={`/u/${member.username}`} className="people-suggestion-profile">
                  <img src={member.avatar_url || "/avatars/cc_badge.png"} alt="" className="people-avatar" />
                  <span className="people-member-copy"><strong>{member.display_name || member.username}</strong><span>@{member.username}</span></span>
                </Link>
                <div className="people-suggestion-stat">
                  <span>{member.owned_count} {Number(member.owned_count) === 1 ? "book" : "books"}</span>
                  {badge && <span className="people-suggestion-badge">{badge}</span>}
                </div>
                {member.following && <span className="people-following-label">Following</span>}
              </article>
            );
          })}
        </div>
      )}
      {error && <p className="people-error" role="alert">{error}</p>}
      {selectable.length > 0 && (
        <div className="people-bulk-bar">
          <button type="button" className="primary-btn" disabled={busy || selectedCount === 0} onClick={followSelected}>{busy ? "Following..." : `Follow selected (${selectedCount})`}</button>
          <button type="button" className="people-select-toggle" disabled={busy} onClick={() => setSelected(allSelected ? new Set() : new Set(selectable.map((member) => member.username)))}>{allSelected ? "Select none" : "Select all"}</button>
        </div>
      )}
    </section>
  );
}
