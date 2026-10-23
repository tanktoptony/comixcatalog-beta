"use client";

// Inbox — list of message threads. A "thread" is the union of messages
// between you and one other user, collapsed to the most recent line.
//
// Client-side only — uses the user's Supabase session + RLS to fetch their
// own messages. No API route needed because the policies on `messages` make
// `select *` already safe (you can only see rows you sent or received).

import { useEffect, useMemo, useState } from "react";
import { inboxCache } from "@/lib/inboxCache";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import EmptyState from "@/components/EmptyState";
import FollowButton from "@/components/FollowButton";
import { authedFetch } from "@/lib/apiClient";
import { UNREAD_CHANGED_EVENT } from "@/hooks/useUnreadMessageCount";
import { summarizeThreads } from "@/lib/messageThreads";

function NewMessagePicker({ onClose }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const response = await authedFetch(`/api/members/search?q=${encodeURIComponent(value)}`, { cache: "no-store" });
      const body = await response.json().catch(() => []);
      if (!cancelled) {
        setPeople(response.ok ? [...body].sort((a, b) => Number(b.following) - Number(a.following)) : []);
        setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  return (
    <div className="inbox-picker-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="inbox-picker" role="dialog" aria-modal="true" aria-labelledby="new-message-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="inbox-picker-head">
          <h2 id="new-message-title">New message</h2>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names or usernames" />
        {loading && <p>Searching...</p>}
        {!loading && query.trim().length >= 2 && people.length === 0 && <p>No collectors found.</p>}
        <div className="inbox-picker-results">
          {people.map((person) => (
            <Link key={person.id} href={`/inbox/${encodeURIComponent(person.username)}`} className="inbox-picker-person">
              <Avatar profile={person} />
              <span><strong>{person.display_name || person.username}</strong><small>@{person.username}{person.following ? " · Following" : ""}</small></span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function NewFollowersStrip({ followers }) {
  if (!followers?.length) return null;
  return (
    <section className="inbox-followers" aria-labelledby="new-followers-heading">
      <div className="inbox-followers-heading">
        <h2 id="new-followers-heading">New followers</h2>
        <Link href="/people?tab=followers">See all</Link>
      </div>
      <div className="inbox-followers-list">
        {followers.map((follower) => (
          <article className="inbox-follower" key={follower.id}>
            <Link href={`/u/${follower.username}`} className="inbox-follower-person">
              <Avatar profile={follower} />
              <span><strong>{follower.display_name || follower.username}</strong><small>@{follower.username}</small></span>
            </Link>
            <FollowButton username={follower.username} ownerId={follower.id} initialFollowing={follower.following} compact />
          </article>
        ))}
      </div>
    </section>
  );
}

/* Pending purchase covers can be seller-hosted URLs outside Next Image's configured hosts. */
function PendingPurchasesStrip({ purchases }) {
  if (!purchases?.length) return null;
  return <section className="inbox-followers inbox-purchases" aria-labelledby="pending-purchases-heading"><div className="inbox-followers-heading"><h2 id="pending-purchases-heading">Pending purchases</h2></div><div className="inbox-followers-list">{purchases.map((purchase) => { const title = `${purchase.series_title}${purchase.issue_number ? ` #${purchase.issue_number}` : ""}`; return <article className="inbox-purchase" key={purchase.id}><div className="inbox-purchase-cover">{purchase.user_cover_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={purchase.user_cover_url} alt="" /> : <span aria-hidden="true">CC</span>}</div><div className="inbox-purchase-copy"><strong>{title}</strong><small>{new Intl.NumberFormat("en-US", { style: "currency", currency: purchase.currency || "USD" }).format(Number(purchase.sale_price))} · from @{purchase.seller_username}</small></div><Link className="inbox-purchase-review" href={`/purchases/${purchase.id}`} aria-label={`Review ${title}`}>Review</Link></article>; })}</div></section>;
}

function formatTimeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function InboxPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  // Last copy from this tab (src/lib/inboxCache.js) renders immediately;
  // the effect below refreshes it.
  const [threads, setThreads] = useState(() => (user ? inboxCache(user.id).threads : null));
  const [newFollowers, setNewFollowers] = useState([]);
  const [pendingPurchases, setPendingPurchases] = useState([]);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    // Start as soon as we know who's signed in; AuthContext keeps `loading`
    // true until the profile row loads too, which the inbox doesn't need.
    if (!user) {
      if (!authLoading) router.replace("/login");
      return;
    }

    let cancelled = false;

    async function load() {
      const supabase = getSupabaseClient();

      // Keep the fetched rows for this visit, then advance the cutoff and
      // refresh the header badge immediately.
      try {
        const notificationResponse = await authedFetch("/api/inbox-notifications", { cache: "no-store" });
        if (notificationResponse.ok) {
          const notifications = await notificationResponse.json();
          if (!cancelled) setNewFollowers(notifications.recentFollowers ?? []);
          if (!cancelled) setPendingPurchases(notifications.pendingPurchases ?? []);
          const seenResponse = await authedFetch("/api/inbox-notifications", { method: "POST" });
          if (seenResponse.ok && !cancelled) window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT));
        }
      } catch {
        // Messages remain usable if the optional follower strip cannot load.
      }

      // Pull recent messages where the user is on either side. Hard timeout
      // — if RLS/session resolution stalls we want to surface an error and
      // an empty list, not sit on a "Loading…" forever.
      const msgsQuery = supabase
        .from("messages")
        .select("id, sender_id, recipient_id, body, read_at, created_at")
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(500);

      const { data: msgs, error: msgError } = await Promise.race([
        msgsQuery,
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ data: null, error: { message: "Inbox query timed out." } }),
            8000
          )
        ),
      ]);

      if (cancelled) return;
      if (msgError) {
        setError(msgError.message);
        setThreads([]);
        return;
      }

      // Group by the OTHER participant and keep the newest message per thread.
      const summaries = summarizeThreads(msgs ?? [], user.id);
      const byOther = new Map(summaries.map((thread) => [thread.otherId, thread]));

      const otherIds = [...byOther.keys()];
      if (otherIds.length === 0) {
        setThreads([]);
        return;
      }

      // Hydrate profiles for the other participants.
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, avatar_key, display_name")
        .in("id", otherIds);

      if (profilesError) {
        console.error("Inbox profile lookup failed:", profilesError.code, profilesError.message);
        setError("Failed to load conversations.");
        // Leave the loading state, or the error never renders on a first visit.
        setThreads((current) => current ?? []);
        return;
      }

      const profilesById = new Map((profiles ?? []).map((p) => [p.id, p]));

      const list = [...byOther.values()]
        .map((t) => ({
          ...t,
          profile: profilesById.get(t.otherId) ?? null,
        }))
        .sort(
          (a, b) =>
            new Date(b.lastMessage.created_at).getTime() -
            new Date(a.lastMessage.created_at).getTime()
        );

      const cache = inboxCache(user.id);
      cache.threads = list;
      // Prime thread pages so opening a conversation skips the profile lookup.
      for (const t of list) {
        if (t.profile?.username) cache.profiles.set(t.profile.username, t.profile);
      }
      setThreads(list);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, router]);

  const filteredThreads = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return threads ?? [];
    return (threads ?? []).filter((thread) => {
      const profileText = `${thread.profile?.display_name || ""} ${thread.profile?.username || ""}`.toLowerCase();
      return profileText.includes(needle) || String(thread.lastMessage?.body || "").toLowerCase().includes(needle);
    });
  }, [threads, search]);

  if ((!user && authLoading) || threads === null) {
    return (
      <section className="comic-panel">
        <h1 className="hero-title">Inbox</h1>
        <div className="empty-state">Loading…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="comic-panel">
        <h1 className="hero-title">Inbox</h1>
        <div className="auth-error"><p>{error}</p></div>
      </section>
    );
  }

  if (threads.length === 0) {
    return (
      <section className="comic-panel">
        <h1 className="hero-title">Inbox</h1>
        <div className="inbox-toolbar"><button type="button" className="primary-btn" onClick={() => setPickerOpen(true)}>New message</button></div>
        <NewFollowersStrip followers={newFollowers} />
        <PendingPurchasesStrip purchases={pendingPurchases} />
        <EmptyState
          title="No messages yet"
          body="When another collector messages you, the conversation will show up here. You can also start one from any profile."
        />
        {pickerOpen && <NewMessagePicker onClose={() => setPickerOpen(false)} />}
      </section>
    );
  }

  return (
    <section className="comic-panel">
      <h1 className="hero-title">Inbox</h1>
      <div className="inbox-toolbar">
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" />
        <button type="button" className="primary-btn" onClick={() => setPickerOpen(true)}>New message</button>
      </div>
      <NewFollowersStrip followers={newFollowers} />
      <PendingPurchasesStrip purchases={pendingPurchases} />
      <ul className="inbox-thread-list">
        {filteredThreads.map((t) => {
          const username = t.profile?.username || "unknown";
          const name = t.profile?.display_name || t.profile?.username || "Unknown user";
          const preview = (t.lastMessage.body || "").slice(0, 110);
          const isUnread = t.unread > 0;
          return (
            <li key={t.otherId} className={`inbox-thread ${isUnread ? "is-unread" : ""}`}>
              <Link href={`/inbox/${username}`} className="inbox-thread-link">
                <div className="inbox-thread-avatar">
                  <Avatar profile={t.profile || { id: t.otherId, username }} />
                </div>
                <div className="inbox-thread-body">
                  <div className="inbox-thread-top">
                    <strong>{name}</strong>
                    <span className="inbox-thread-time">{formatTimeAgo(t.lastMessage.created_at)}</span>
                  </div>
                  <div className="inbox-thread-preview">{preview || <em>(empty)</em>}</div>
                </div>
                {isUnread && <span className="inbox-thread-unread-dot" aria-label={`${t.unread} unread`} />}
              </Link>
            </li>
          );
        })}
      </ul>
      {filteredThreads.length === 0 && <p className="people-state">No conversations match that search.</p>}
      {pickerOpen && <NewMessagePicker onClose={() => setPickerOpen(false)} />}
    </section>
  );
}
