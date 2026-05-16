"use client";

// Inbox — list of message threads. A "thread" is the union of messages
// between you and one other user, collapsed to the most recent line.
//
// Client-side only — uses the user's Supabase session + RLS to fetch their
// own messages. No API route needed because the policies on `messages` make
// `select *` already safe (you can only see rows you sent or received).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import EmptyState from "@/components/EmptyState";

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
  const [threads, setThreads] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }

    let cancelled = false;

    async function load() {
      const supabase = getSupabaseClient();

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
      const byOther = new Map();
      for (const m of msgs ?? []) {
        const otherId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
        if (!byOther.has(otherId)) {
          byOther.set(otherId, {
            otherId,
            lastMessage: m,
            unread: 0,
          });
        }
        const t = byOther.get(otherId);
        // Newest-first ordering means the first hit is already the latest.
        if (m.recipient_id === user.id && m.read_at == null) {
          t.unread += 1;
        }
      }

      const otherIds = [...byOther.keys()];
      if (otherIds.length === 0) {
        setThreads([]);
        return;
      }

      // Hydrate profiles for the other participants.
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, display_name")
        .in("id", otherIds);

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

      setThreads(list);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, router]);

  if (authLoading || threads === null) {
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
        <EmptyState
          title="No messages yet"
          body="When another collector messages you, the conversation will show up here. You can also start one from any profile."
        />
      </section>
    );
  }

  return (
    <section className="comic-panel">
      <h1 className="hero-title">Inbox</h1>
      <ul className="inbox-thread-list">
        {threads.map((t) => {
          const username = t.profile?.username || "unknown";
          const name = t.profile?.display_name || t.profile?.username || "Unknown user";
          const preview = (t.lastMessage.body || "").slice(0, 110);
          const isUnread = t.unread > 0;
          return (
            <li key={t.otherId} className={`inbox-thread ${isUnread ? "is-unread" : ""}`}>
              <Link href={`/inbox/${username}`} className="inbox-thread-link">
                <div className="inbox-thread-avatar">
                  {t.profile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.profile.avatar_url} alt="" />
                  ) : (
                    <span aria-hidden="true">{name[0]?.toUpperCase() ?? "?"}</span>
                  )}
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
    </section>
  );
}
