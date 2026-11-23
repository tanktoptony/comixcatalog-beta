"use client";

// One conversation: messages between you and `username`. Rendered by
// /inbox/[username] (variant "pane", the right side of the two-pane inbox)
// and by the chat dock (variant "dock"). Realtime via Supabase
// postgres_changes, with a 10 s polling fallback in case the websocket
// drops. Messages are marked read only while the conversation is on screen.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { inboxCache } from "@/lib/inboxCache";
import { authedFetch } from "@/lib/apiClient";
import { containsMessageUrl, findOffPlatformPaymentTerms } from "@/lib/messageContent";
import { UNREAD_CHANGED_EVENT } from "@/hooks/useUnreadMessageCount";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import styles from "./ThreadView.module.css";
import ReportButton from "@/components/ReportButton";
import { messageDateLabel, shouldStartMessageGroup } from "@/lib/messageThreads";
import { QUICK_REACTIONS, groupReactions, replaceShortcodes, searchEmoji, shortcodeFor, shortcodeQueryAt, toggleReactionRows } from "@/lib/emoji";
import EmojiPicker from "@/components/inbox/EmojiPicker";

const REACTION_COLUMNS = "message_id, user_id, emoji, created_at";
// Reactions are fetched for the newest messages only; older ones keep theirs
// in the database but rarely matter in a long conversation.
const REACTION_WINDOW = 200;

const MAX_BODY = 4000;
// Shown to everyone, including people who can't use checkout yet, so it can't point at checkout.
const PAYMENT_WARNING = "Heads up: Friends and Family, Zelle, wires and gift cards come with zero buyer protection, which is exactly why scammers ask for them. PayPal Goods and Services protects you.";

function deliveryStatus(message) {
  if (message.__optimistic) return { label: "Sending…", read: false };
  if (message.read_at) return { label: `Read ${formatTimestamp(message.read_at)}`, read: true };
  return { label: "Delivered", read: false };
}

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

// variant: "pane" (inbox page) or "dock" (popup). onBack replaces the back
// link with a button (the dock goes back to its list without navigating).
export default function ThreadView({ username, variant = "pane", onBack }) {
  const router = useRouter();
  const { user, profile: myProfile, loading: authLoading } = useAuth();

  // Cached copies from this tab (src/lib/inboxCache.js) render immediately;
  // the effects below refresh them.
  const [otherProfile, setOtherProfile] = useState(() =>
    user ? inboxCache(user.id).profiles.get(username) ?? null : null
  );
  const [messages, setMessages] = useState(() => {
    if (!user) return null;
    const p = inboxCache(user.id).profiles.get(username);
    return p ? inboxCache(user.id).messages.get(p.id) ?? null : null;
  });
  // "Make an offer" on a marketplace listing links here with ?about=<book>,
  // so the first message starts with the book already named.
  // Only the inbox page reads these; the dock ignores the page's query string.
  const searchParams = useSearchParams();
  const query = variant === "pane" ? searchParams : new URLSearchParams();
  const about = query.get("about");
  const issueParam = Number(query.get("issue"));
  const copyParam = query.get("copy");
  const askKind = ["sell", "have", "want"].includes(query.get("ask")) ? query.get("ask") : null;
  const [attachedBook, setAttachedBook] = useState(null);
  const [contextRemoved, setContextRemoved] = useState(false);
  const [bookCache, setBookCache] = useState({});
  // A book link (?issue=&ask=) writes its own opener below, so ?about= only
  // prefills when no ask kind came with it.
  const [body, setBody] = useState(() =>
    about && !askKind ? `Hi! I'm interested in your ${about.slice(0, 200)}. Would you take an offer?` : ""
  );
  // Reaction rows for the newest messages. reactionsOn turns off the
  // reaction controls if the table can't be read (before migration 0117).
  const [reactions, setReactions] = useState([]);
  const [reactionsOn, setReactionsOn] = useState(true);
  // The open emoji picker: "composer" (insert into the message) or a
  // message id (react to it). barFor: the message whose quick-reaction bar
  // is open on touch screens, where there's no hover.
  const [pickerFor, setPickerFor] = useState(null);
  const [barFor, setBarFor] = useState(null);
  // Opening a different conversation can reuse this component, so swap to
  // that thread's cached state during render instead of briefly showing the
  // previous person's messages.
  const [shownUsername, setShownUsername] = useState(username);
  if (shownUsername !== username) {
    setShownUsername(username);
    const p = user ? inboxCache(user.id).profiles.get(username) ?? null : null;
    setOtherProfile(p);
    setMessages(p ? inboxCache(user.id).messages.get(p.id) ?? null : null);
    setReactions([]);
    setPickerFor(null);
    setBarFor(null);
  }
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const scrollerRef = useRef(null);
  const textareaRef = useRef(null);
  // :shortcode autocomplete in the composer.
  const [caret, setCaret] = useState(0);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [suggestDismissedAt, setSuggestDismissedAt] = useState(null);
  const shortcode = shortcodeQueryAt(body, caret);
  const suggestions = shortcode && suggestDismissedAt !== shortcode.start ? searchEmoji(shortcode.query, 6) : [];
  const reactionsByMessage = useMemo(() => {
    const byId = new Map();
    for (const row of reactions) {
      if (!byId.has(row.message_id)) byId.set(row.message_id, []);
      byId.get(row.message_id).push(row);
    }
    return byId;
  }, [reactions]);
  // Only your latest message carries Sending / Delivered / Read, the way
  // phone messaging does. The 10s poll refreshes read_at, so Read appears
  // within seconds of the other collector opening the thread.
  const lastMineId = useMemo(() => {
    if (!user || !messages) return null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.sender_id === user.id && !m.is_system) return m.id;
    }
    return null;
  }, [messages, user]);

  const prefilledIssue = useRef(null);

  useEffect(() => {
    const messageIds = (messages ?? []).map((message) => Number(message.gcd_issue_id)).filter(Number.isInteger);
    if (Number.isInteger(issueParam) && issueParam > 0) messageIds.push(issueParam);
    const missing = [...new Set(messageIds)].filter((id) => !bookCache[id]);
    if (!missing.length) return;
    let cancelled = false;
    fetch(`/api/issues/context?ids=${missing.join(",")}`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then(({ issues }) => {
        if (cancelled) return;
        const additions = Object.fromEntries((issues ?? []).map((book) => [book.gcd_issue_id, book]));
        setBookCache((current) => ({ ...current, ...additions }));
        if (!contextRemoved && issueParam && additions[issueParam]) setAttachedBook(additions[issueParam]);
      })
      .catch(() => { if (!cancelled && issueParam) setError("Could not attach that book."); });
    return () => { cancelled = true; };
  }, [messages, issueParam, bookCache, attachedBook, contextRemoved]);

  useEffect(() => {
    const book = bookCache[issueParam];
    if (!book || !askKind || body || prefilledIssue.current === issueParam) return;
    const name = `${book.series_title}${book.issue_number ? ` #${book.issue_number}` : ""}`;
    const text = askKind === "sell"
      ? `Hi! Would you consider selling or trading your copy of ${name}?`
      : askKind === "have"
        ? `Hi! I have ${name}, which is on your wantlist. Interested?`
        : `Hi! I'm looking for ${name}. Do you have a copy?`;
    prefilledIssue.current = issueParam;
    setBody(text);
  }, [askKind, body, bookCache, issueParam]);

  const contextBook = contextRemoved ? null : (attachedBook ?? bookCache[issueParam] ?? null);

  // Resolve the other user by username.
  useEffect(() => {
    // Start as soon as we know who's signed in (AuthContext's `loading`
    // also waits on the profile row, which this lookup doesn't need).
    if (!user) {
      if (authLoading) return;
      // Come back here after signing in, so a buyer who tapped "Make an
      // offer" signed out lands on the pre-filled message.
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }

    // Fast-path: self-message check happens client-side against our own
    // cached profile, before any DB roundtrip. Avoids hanging on profiles-
    // table RLS if our own session is slow to authorize.
    if (myProfile?.username && username === myProfile.username) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("You can't message yourself.");
      setOtherProfile(null);
      return;
    }

    const cached = inboxCache(user.id).profiles.get(username);
    if (cached && cached.id !== user.id) {
      setOtherProfile(cached);
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
        .select("id, username, display_name, avatar_url, avatar_key")
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
      inboxCache(user.id).profiles.set(username, data);
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
        .select("id, sender_id, recipient_id, body, is_system, order_id, gcd_issue_id, collection_id, read_at, created_at")
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
      inboxCache(user.id).messages.set(otherProfile.id, data ?? []);
      latestRows = data ?? [];
      loadReactions(latestRows);

      await markRead(data ?? []);
    }

    // Reactions for the newest messages, 100 ids per request (URL length).
    let latestRows = [];
    async function loadReactions(rows) {
      const ids = rows.filter((m) => !m.is_system && !m.__optimistic).map((m) => m.id).slice(-REACTION_WINDOW);
      if (ids.length === 0) {
        if (!cancelled) setReactions([]);
        return;
      }
      const found = [];
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error: reactionError } = await supabase
          .from("message_reactions")
          .select(REACTION_COLUMNS)
          .in("message_id", ids.slice(i, i + 100));
        if (cancelled) return;
        if (reactionError) {
          setReactionsOn(false);
          return;
        }
        found.push(...(data ?? []));
      }
      setReactionsOn(true);
      setReactions(found);
    }

    // Mark inbound messages read only while the thread is on screen, then
    // tell the header badge and the inbox list right away instead of
    // leaving them stale until their next poll (useUnreadMessageCount).
    async function markRead(rows) {
      if (document.visibilityState !== "visible") return;
      const unreadIds = rows
        .filter((m) => m.recipient_id === user.id && m.read_at == null)
        .map((m) => m.id);
      if (unreadIds.length === 0) return;
      const now = new Date().toISOString();
      const { error: readError } = await supabase.from("messages").update({ read_at: now }).in("id", unreadIds);
      if (readError || cancelled) return;
      const ids = new Set(unreadIds);
      setMessages((prev) => (prev ?? []).map((m) => (ids.has(m.id) ? { ...m, read_at: now } : m)));
      const thread = inboxCache(user.id).threads?.find((t) => t.otherId === otherProfile.id);
      if (thread) thread.unread = 0;
      window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT));
    }

    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);

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
          if (!latestRows.some((x) => x.id === m.id)) latestRows = [...latestRows, m];
          setMessages((prev) => {
            if (!prev) return [m];
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, m];
          });
          markRead([m]);
        }
      )
      .subscribe();

    // Reactions get their own channel so a problem subscribing to them can't
    // take message delivery down with it. Any change re-reads this thread's
    // reactions (the payload of a delete carries only the key).
    let reactionTimer = null;
    const reactionChannel = supabase
      .channel(`thread-reactions-${user.id}-${otherProfile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => {
        clearTimeout(reactionTimer);
        reactionTimer = setTimeout(() => loadReactions(latestRows), 300);
      })
      .subscribe();

    // Polling fallback covers a stalled postgres_changes connection.
    pollInterval = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 10000);

    return () => {
      cancelled = true;
      clearTimeout(reactionTimer);
      supabase.removeChannel(reactionChannel);
      if (channel) supabase.removeChannel(channel);
      if (pollInterval) clearInterval(pollInterval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, otherProfile]);

  // RLS only exposes blocks created by the viewer, so this does not reveal
  // whether the other member has blocked them.
  useEffect(() => {
    if (!user || !otherProfile) return;
    let cancelled = false;
    const supabase = getSupabaseClient();
    supabase
      .from("user_blocks")
      .select("blocked_id")
      .eq("blocker_id", user.id)
      .eq("blocked_id", otherProfile.id)
      .maybeSingle()
      .then(({ data, error: blockError }) => {
        if (cancelled) return;
        if (blockError) {
          setError(blockError.message);
          return;
        }
        setIsBlocked(Boolean(data));
      });
    return () => {
      cancelled = true;
    };
  }, [user, otherProfile]);

  // Keep the tab cache current with sends and live arrivals too.
  useEffect(() => {
    if (user && otherProfile && messages) inboxCache(user.id).messages.set(otherProfile.id, messages);
  }, [user, otherProfile, messages]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages?.length]);

  async function handleSend(e) {
    e.preventDefault();
    if (sending || isBlocked) return;
    const trimmed = replaceShortcodes(body.trim());
    setPickerFor(null);
    if (!trimmed || !user || !otherProfile) return;
    if (trimmed.length > MAX_BODY) {
      setError(`Message too long (${trimmed.length}/${MAX_BODY}).`);
      return;
    }

    setSending(true);
    setError(null);

    const optimistic = {
      id: `optimistic-${Date.now()}`,
      sender_id: user.id,
      recipient_id: otherProfile.id,
      body: trimmed,
      read_at: null,
      created_at: new Date().toISOString(),
      gcd_issue_id: contextBook?.gcd_issue_id ?? null,
      collection_id: copyParam || null,
      __optimistic: true,
    };

    setBody("");
    setMessages((prev) => (prev ? [...prev, optimistic] : [optimistic]));

    let data;
    let sendError = null;
    try {
      const response = await authedFetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: otherProfile.username, body: trimmed, ...(contextBook ? { about: { gcd_issue_id: contextBook.gcd_issue_id, ...(copyParam ? { collection_id: copyParam } : {}) } } : {}) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) sendError = result.error || "Could not send message.";
      else data = result;
    } catch {
      sendError = "Could not send message.";
    }

    if (sendError) {
      setError(sendError);
      // Roll back the optimistic insert.
      setMessages((prev) => (prev ?? []).filter((m) => m.id !== optimistic.id));
      setBody(trimmed);
    } else {
      // The book rides on the first message only; later replies are plain.
      if (contextBook) { setAttachedBook(null); setContextRemoved(true); }
      // Replace optimistic with server-truth row.
      setMessages((prev) =>
        (prev ?? []).map((m) => (m.id === optimistic.id ? data : m))
      );
    }
    setSending(false);
  }

  // Add or remove your reaction; the server's list replaces the guess.
  async function toggleReaction(messageId, emoji) {
    if (!user || isBlocked) return;
    setPickerFor(null);
    setBarFor(null);
    const flip = (rows) => toggleReactionRows(rows, { messageId, userId: user.id, emoji });
    setReactions(flip);
    try {
      const response = await authedFetch("/api/messages/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: messageId, emoji }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not save that reaction.");
      setReactions((rows) => [...rows.filter((r) => r.message_id !== messageId), ...(result.reactions ?? [])]);
    } catch (reactionError) {
      setReactions(flip);
      setError(reactionError.message);
    }
  }

  // Put text at the caret (or replace a range) and keep typing from there.
  function insertAtCaret(text, from, to) {
    const el = textareaRef.current;
    const start = from ?? el?.selectionStart ?? body.length;
    const end = to ?? el?.selectionEnd ?? body.length;
    const next = body.slice(0, start) + text + body.slice(end);
    const pos = start + text.length;
    setBody(next);
    setCaret(pos);
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pos, pos);
    });
  }

  function pickSuggestion(entry) {
    if (!shortcode || !entry) return;
    insertAtCaret(`${entry.emoji} `, shortcode.start, shortcode.end);
    setSuggestIndex(0);
  }

  // Typing a whole :code: turns it into the emoji right away, like Slack.
  function handleBodyChange(event) {
    const raw = event.target.value;
    const rawCaret = event.target.selectionStart ?? raw.length;
    const converted = replaceShortcodes(raw);
    if (converted === raw) {
      setBody(raw);
      setCaret(rawCaret);
    } else {
      const before = replaceShortcodes(raw.slice(0, rawCaret));
      setBody(converted);
      setCaret(before.length);
      requestAnimationFrame(() => textareaRef.current?.setSelectionRange(before.length, before.length));
    }
    setSuggestIndex(0);
    setSuggestDismissedAt(null);
  }

  async function handleBlock() {
    if (!user || !otherProfile || blockBusy) return;
    setBlockBusy(true);
    setError(null);
    const supabase = getSupabaseClient();
    const { error: blockError } = await supabase.from("user_blocks").insert({
      blocker_id: user.id,
      blocked_id: otherProfile.id,
    });
    if (blockError) setError(blockError.message);
    else {
      setIsBlocked(true);
      setBody("");
    }
    setConfirmingBlock(false);
    setBlockBusy(false);
  }

  async function handleUnblock() {
    if (!user || !otherProfile || blockBusy) return;
    setBlockBusy(true);
    setError(null);
    const supabase = getSupabaseClient();
    const { error: blockError } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", otherProfile.id);
    if (blockError) setError(blockError.message);
    else setIsBlocked(false);
    setBlockBusy(false);
  }

  const viewClass = `${styles.view} ${variant === "dock" ? styles.viewDock : styles.viewPane}`;
  const backArrow = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
  const backControl = onBack
    ? <button type="button" className={styles.back} onClick={onBack} aria-label="Back to conversations">{backArrow}</button>
    : <Link href="/inbox" className={styles.back} aria-label="Back to inbox">{backArrow}</Link>;

  if ((!user && authLoading) || (messages === null && !error)) {
    return (
      <section className={viewClass} aria-busy="true">
        <header className={styles.topbar}>
          {backControl}
          <span className={styles.peer}>
            <span className={`${styles.peerAvatar} ${styles.skeleton}`} />
            <span className={styles.peerMeta}><span className={styles.peerName}>@{username}</span></span>
          </span>
        </header>
        <div className={styles.scroller}>
          <div className={styles.loadingRows} aria-label="Loading conversation">
            <span /><span /><span />
          </div>
        </div>
      </section>
    );
  }

  if (error && !otherProfile) {
    return (
      <section className={viewClass}>
        <header className={styles.topbar}>{backControl}</header>
        <div className={styles.scroller}>
          <div className={styles.empty}>
            <p>{error}</p>
            {!onBack && <Link href="/inbox" className="link">Back to inbox</Link>}
          </div>
        </div>
      </section>
    );
  }

  const otherName = otherProfile?.display_name || otherProfile?.username || username;
  const canReact = (m) => reactionsOn && !isBlocked && !m.__optimistic && !m.is_system;

  return (
    <section className={viewClass}>
      <header className={styles.topbar}>
        {backControl}
        <Link
          href={`/u/${otherProfile?.username || username}`}
          className={styles.peer}
          title={`View ${otherName}'s profile`}
        >
          <span className={styles.peerAvatar}>
            <Avatar profile={otherProfile || { username }} />
          </span>
          <span className={styles.peerMeta}>
            <span className={styles.peerName}>{otherName}</span>
            <span className={styles.peerHandle}>@{otherProfile?.username || username}</span>
          </span>
        </Link>
        <div className={styles.blockActions}>
          {isBlocked ? (
            <button type="button" onClick={handleUnblock} disabled={blockBusy}>
              Unblock @{otherProfile?.username || username}
            </button>
          ) : confirmingBlock ? (
            <>
              <span>Block @{otherProfile?.username || username}?</span>
              <button type="button" onClick={handleBlock} disabled={blockBusy}>Yes</button>
              <button type="button" onClick={() => setConfirmingBlock(false)} disabled={blockBusy}>Cancel</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmingBlock(true)}>
              Block @{otherProfile?.username || username}
            </button>
          )}
          {otherProfile && <ReportButton targetType="user" targetId={otherProfile.id} ownerId={otherProfile.id} />}
        </div>
      </header>

      <div className={styles.scroller} ref={scrollerRef}>
        {messages && messages.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyGlyph} aria-hidden="true">💬</div>
            <p>Say hi. This is the start of your conversation with <strong>{otherName}</strong>.</p>
          </div>
        )}
        {messages?.map((m, idx) => {
          const mine = m.sender_id === user.id;
          const status = m.id === lastMineId ? deliveryStatus(m) : null;
          const prev = messages[idx - 1];
          const startsGroup = shouldStartMessageGroup(m, prev);
          const grouped = !startsGroup;
          const startsDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
          const classNames = [
            styles.msg,
            mine ? styles.msgMine : styles.msgTheirs,
            grouped ? styles.msgGrouped : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div key={m.id} className={styles.messageBlock}>
              {startsDay && (
                <div className={styles.dateSeparator}>
                  <span>{messageDateLabel(m.created_at)}</span>
                </div>
              )}
              {m.is_system ? (
                <div className={styles.systemNote}>
                  <span className={styles.systemLabel}>ComixCatalog</span>
                  <p>{m.body}</p>
                  {m.order_id && <Link href={`/orders/${m.order_id}`}>View order</Link>}
                  <div className={styles.meta}>{formatTimestamp(m.created_at)}</div>
                </div>
              ) : (
              <div className={classNames} data-bar={barFor === m.id ? "open" : undefined}>
                <div className={styles.bubbleRow}>
                  <div
                    className={styles.bubble}
                    onClick={() => { if (canReact(m)) setBarFor((current) => (current === m.id ? null : m.id)); }}
                  >
                    {m.body}
                  </div>
                  {canReact(m) && (
                    <div className={styles.reactBar} role="toolbar" aria-label="React to this message">
                      {QUICK_REACTIONS.map((emoji) => (
                        <button key={emoji} type="button" onClick={() => toggleReaction(m.id, emoji)} aria-label={`React ${shortcodeFor(emoji)}`} title={`:${shortcodeFor(emoji)}:`}>
                          {emoji}
                        </button>
                      ))}
                      <button type="button" className={styles.reactMore} onClick={() => setPickerFor(m.id)} aria-label="More reactions" title="More reactions">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" /><path d="M8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8" /><path d="M9 9.5h.01M15 9.5h.01" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
                {(() => {
                  const chips = groupReactions(reactionsByMessage.get(m.id), user.id);
                  if (!chips.length) return null;
                  return (
                    <div className={styles.chips}>
                      {chips.map((chip) => {
                        const who = chip.userIds.map((id) => (id === user.id ? "You" : otherName)).join(" and ");
                        return (
                          <button
                            key={chip.emoji}
                            type="button"
                            className={chip.mine ? styles.chipMine : styles.chip}
                            onClick={() => toggleReaction(m.id, chip.emoji)}
                            disabled={!reactionsOn || isBlocked}
                            title={`${who} reacted with :${shortcodeFor(chip.emoji)}:`}
                            aria-pressed={chip.mine}
                          >
                            <span>{chip.emoji}</span>{chip.count > 1 && <small>{chip.count}</small>}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
                {m.gcd_issue_id && bookCache[m.gcd_issue_id] && <BookCard book={bookCache[m.gcd_issue_id]} styles={styles} />}
                {findOffPlatformPaymentTerms(m.body).length > 0 && (
                  <div className={styles.paymentWarning}>{PAYMENT_WARNING}</div>
                )}
                {!mine && containsMessageUrl(m.body) && (
                  <div className={styles.linkWarning}>
                    Contains a link. Never pay through a link someone sends you.
                  </div>
                )}
                <div className={styles.meta}>{formatTimestamp(m.created_at)}</div>
                {status && (
                  <div className={`${styles.status} ${status.read ? styles.statusRead : ""}`} aria-live="polite">
                    {status.label}
                  </div>
                )}
              </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {isBlocked && (
        <div className={styles.blockNotice}>
          You blocked @{otherProfile?.username || username}. They can&apos;t message you.
        </div>
      )}

      <form onSubmit={handleSend} className={styles.composer}>
        {contextBook && <div className={styles.aboutBook}><BookCard book={contextBook} styles={styles} label="About this book" /><button type="button" onClick={() => { setAttachedBook(null); setContextRemoved(true); }} aria-label="Remove book">×</button></div>}
        {pickerFor && (
          <EmojiPicker
            title={pickerFor === "composer" ? null : "React to message"}
            onPick={(emoji) => {
              if (pickerFor === "composer") { insertAtCaret(emoji); setPickerFor(null); }
              else toggleReaction(pickerFor, emoji);
            }}
            onClose={() => setPickerFor(null)}
          />
        )}
        {suggestions.length > 0 && (
          <ul className={styles.suggest} role="listbox" aria-label="Emoji suggestions">
            {suggestions.map((entry, i) => (
              <li key={entry.emoji} role="option" aria-selected={i === suggestIndex}>
                <button
                  type="button"
                  className={i === suggestIndex ? styles.suggestActive : undefined}
                  onMouseDown={(event) => { event.preventDefault(); pickSuggestion(entry); }}
                >
                  <span>{entry.emoji}</span>:{entry.name}:
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className={styles.emojiButton}
          onClick={() => setPickerFor((current) => (current === "composer" ? null : "composer"))}
          disabled={isBlocked}
          aria-label="Add emoji"
          aria-expanded={pickerFor === "composer"}
          title="Emoji (or type :name)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8" /><path d="M9 9.5h.01M15 9.5h.01" />
          </svg>
        </button>
        <textarea
          ref={textareaRef}
          className={styles.composerInput}
          placeholder={`Message ${otherName}…`}
          value={body}
          onChange={handleBodyChange}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          rows={1}
          maxLength={MAX_BODY}
          disabled={isBlocked}
          onKeyDown={(e) => {
            if (suggestions.length > 0) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const step = e.key === "ArrowDown" ? 1 : -1;
                setSuggestIndex((i) => (i + step + suggestions.length) % suggestions.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pickSuggestion(suggestions[suggestIndex] ?? suggestions[0]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setSuggestDismissedAt(shortcode.start);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
        />
        <button
          type="submit"
          className={styles.send}
          disabled={sending || isBlocked || !body.trim()}
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

function BookCard({ book, styles, label }) {
  return <Link href={`/issue/gcd-${book.gcd_issue_id}`} className={styles.bookCard}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {book.cover && <img src={book.cover} alt="" width="36" height="54" />}
    <span>{label && <small>{label}</small>}<strong>{book.series_title}{book.issue_number ? ` #${book.issue_number}` : ""}</strong>{book.year && <em>{book.year}</em>}</span>
  </Link>;
}
