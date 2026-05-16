"use client";

// Single thread view — messages between you and the user at /[username].
// Realtime via Supabase postgres_changes. Polling fallback every 15s in case
// the websocket drops. Marking-as-read happens client-side when a message
// becomes visible (i.e. when the thread is open).

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import styles from "./thread.module.css";

const MAX_BODY = 4000;

function formatTimestamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ThreadPage() {
  const { username } = useParams();
  const router = useRouter();
  const { user, profile: myProfile, loading: authLoading } = useAuth();

  const [otherProfile, setOtherProfile] = useState(null);
  const [messages, setMessages] = useState(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const scrollerRef = useRef(null);

  // Resolve the other user by username.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }

    // Fast-path: self-message check happens client-side against our own
    // cached profile, before any DB roundtrip. Avoids hanging on profiles-
    // table RLS if our own session is slow to authorize.
    if (myProfile?.username && username === myProfile.username) {
      setError("You can't message yourself.");
      setOtherProfile(null);
      return;
    }

    let cancelled = false;
    let timeoutId = null;

    (async () => {
      const supabase = getSupabaseClient();

      // Hard timeout — RLS on profiles can stall the request indefinitely
      // if session resolution is slow. Surfacing an error is better than a
      // permanent "Loading…".
      const lookup = supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("username", username)
        .maybeSingle();

      const result = await Promise.race([
        lookup,
        new Promise((resolve) => {
          timeoutId = setTimeout(
            () => resolve({ data: null, error: { message: "Profile lookup timed out." } }),
            8000
          );
        }),
      ]);

      if (cancelled) return;
      const { data, error: pErr } = result || {};
      if (pErr || !data) {
        setError(pErr?.message || "Couldn't find that user.");
        setOtherProfile(null);
        return;
      }
      if (data.id === user.id) {
        setError("You can't message yourself.");
        setOtherProfile(null);
        return;
      }
      setOtherProfile(data);
    })();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [username, user, myProfile?.username, authLoading, router]);

  // Load + subscribe to messages once we know who the other party is.
  useEffect(() => {
    if (!user || !otherProfile) return;

    const supabase = getSupabaseClient();
    let cancelled = false;
    let channel = null;
    let pollInterval = null;

    async function load() {
      const { data, error: mErr } = await supabase
        .from("messages")
        .select("id, sender_id, recipient_id, body, read_at, created_at")
        .or(
          `and(sender_id.eq.${user.id},recipient_id.eq.${otherProfile.id}),` +
            `and(sender_id.eq.${otherProfile.id},recipient_id.eq.${user.id})`
        )
        .order("created_at", { ascending: true })
        .limit(500);
      if (cancelled) return;
      if (mErr) {
        setError(mErr.message);
        setMessages([]);
        return;
      }
      setMessages(data ?? []);

      // Mark any unread inbound as read.
      const unreadIds = (data ?? [])
        .filter((m) => m.recipient_id === user.id && m.read_at == null)
        .map((m) => m.id);
      if (unreadIds.length > 0) {
        const now = new Date().toISOString();
        await supabase.from("messages").update({ read_at: now }).in("id", unreadIds);
      }
    }

    load();

    // Realtime subscription — listens for new messages either direction.
    // The RLS policy filters; we still scope client-side for correctness.
    channel = supabase
      .channel(`thread-${user.id}-${otherProfile.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new;
          const involvesPair =
            (m.sender_id === user.id && m.recipient_id === otherProfile.id) ||
            (m.sender_id === otherProfile.id && m.recipient_id === user.id);
          if (!involvesPair) return;
          setMessages((prev) => {
            if (!prev) return [m];
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, m];
          });
        }
      )
      .subscribe();

    // Polling fallback — postgres_changes is reliable but can stall.
    pollInterval = setInterval(load, 15000);

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [user, otherProfile]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages?.length]);

  async function handleSend(e) {
    e.preventDefault();
    if (sending) return;
    const trimmed = body.trim();
    if (!trimmed || !user || !otherProfile) return;
    if (trimmed.length > MAX_BODY) {
      setError(`Message too long (${trimmed.length}/${MAX_BODY}).`);
      return;
    }

    setSending(true);
    setError(null);

    const supabase = getSupabaseClient();
    const optimistic = {
      id: `optimistic-${Date.now()}`,
      sender_id: user.id,
      recipient_id: otherProfile.id,
      body: trimmed,
      read_at: null,
      created_at: new Date().toISOString(),
      __optimistic: true,
    };

    setBody("");
    setMessages((prev) => (prev ? [...prev, optimistic] : [optimistic]));

    const { data, error: sErr } = await supabase
      .from("messages")
      .insert({
        sender_id: user.id,
        recipient_id: otherProfile.id,
        body: trimmed,
      })
      .select()
      .single();

    if (sErr) {
      setError(sErr.message);
      // Roll back the optimistic insert.
      setMessages((prev) => (prev ?? []).filter((m) => m.id !== optimistic.id));
      setBody(trimmed);
    } else {
      // Replace optimistic with server-truth row.
      setMessages((prev) =>
        (prev ?? []).map((m) => (m.id === optimistic.id ? data : m))
      );
    }
    setSending(false);
  }

  if (authLoading || (messages === null && !error)) {
    return (
      <section className="comic-panel">
        <h1 className="hero-title">Conversation</h1>
        <div className="empty-state">Loading…</div>
      </section>
    );
  }

  if (error && !otherProfile) {
    return (
      <section className="comic-panel">
        <h1 className="hero-title">Conversation</h1>
        <div className="auth-error"><p>{error}</p></div>
        <p style={{ marginTop: 16 }}>
          <Link href="/inbox" className="link">← Back to inbox</Link>
        </p>
      </section>
    );
  }

  const otherName = otherProfile?.display_name || otherProfile?.username || username;

  return (
    <section className={styles.view}>
      <header className={styles.topbar}>
        <Link href="/inbox" className={styles.back} aria-label="Back to inbox">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <Link
          href={`/u/${otherProfile?.username || username}`}
          className={styles.peer}
          title={`View ${otherName}'s profile`}
        >
          <span className={styles.peerAvatar}>
            {otherProfile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={otherProfile.avatar_url} alt="" />
            ) : (
              <span aria-hidden="true">{otherName[0]?.toUpperCase() ?? "?"}</span>
            )}
          </span>
          <span className={styles.peerMeta}>
            <span className={styles.peerName}>{otherName}</span>
            <span className={styles.peerHandle}>@{otherProfile?.username || username}</span>
          </span>
        </Link>
      </header>

      <div className={styles.scroller} ref={scrollerRef}>
        {messages && messages.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyGlyph} aria-hidden="true">💬</div>
            <p>Say hi — this is the start of your conversation with <strong>{otherName}</strong>.</p>
          </div>
        )}
        {messages?.map((m, idx) => {
          const mine = m.sender_id === user.id;
          const prev = messages[idx - 1];
          const grouped = prev && prev.sender_id === m.sender_id;
          const classNames = [
            styles.msg,
            mine ? styles.msgMine : styles.msgTheirs,
            grouped ? styles.msgGrouped : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div key={m.id} className={classNames}>
              <div className={styles.bubble}>{m.body}</div>
              <div className={styles.meta}>{formatTimestamp(m.created_at)}</div>
            </div>
          );
        })}
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <form onSubmit={handleSend} className={styles.composer}>
        <textarea
          className={styles.composerInput}
          placeholder={`Message ${otherName}…`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={1}
          maxLength={MAX_BODY}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
        />
        <button
          type="submit"
          className={styles.send}
          disabled={sending || !body.trim()}
          aria-label="Send message"
          title="Send (Enter)"
        >
          {sending ? (
            <span className={styles.spinner} aria-hidden="true" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          )}
        </button>
      </form>
    </section>
  );
}
