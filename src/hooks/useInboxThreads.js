"use client";

// The signed-in member's conversation list, shared by the two-pane inbox
// (src/app/inbox/layout.js) and the chat dock. A "thread" is every message
// between you and one other member, collapsed to the newest line.
//
// Reads go straight to Supabase under the member's session: RLS on
// `messages` only returns rows they sent or received. The list refreshes
// when a conversation marks messages read (UNREAD_CHANGED_EVENT), when a
// message to or from them arrives (realtime), every 30 s while the tab is
// visible (in case the websocket stalls), and when the tab comes back.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { inboxCache } from "@/lib/inboxCache";
import { getSupabaseClient } from "@/lib/supabase/client";
import { authedFetch } from "@/lib/apiClient";
import { UNREAD_CHANGED_EVENT } from "@/hooks/useUnreadMessageCount";
import { summarizeThreads } from "@/lib/messageThreads";

const POLL_MS = 30000;
const QUERY_TIMEOUT_MS = 8000;

async function fetchThreads(userId) {
  const supabase = getSupabaseClient();
  // Hard timeout: if RLS/session resolution stalls, show an error rather
  // than "Loading…" forever.
  const msgsQuery = supabase
    .from("messages")
    .select("id, sender_id, recipient_id, body, is_system, read_at, created_at")
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(500);
  const { data: msgs, error: msgError } = await Promise.race([
    msgsQuery,
    new Promise((resolve) => setTimeout(() => resolve({ data: null, error: { message: "Inbox query timed out." } }), QUERY_TIMEOUT_MS)),
  ]);
  if (msgError) return { error: msgError.message };

  const byOther = new Map(summarizeThreads(msgs ?? [], userId).map((thread) => [thread.otherId, thread]));
  const otherIds = [...byOther.keys()];
  if (otherIds.length === 0) return { threads: [] };

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, avatar_key, display_name")
    .in("id", otherIds);
  if (profilesError) {
    console.error("Inbox profile lookup failed:", profilesError.code, profilesError.message);
    return { error: "Failed to load conversations." };
  }

  const profilesById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const threads = [...byOther.values()]
    .map((t) => ({ ...t, profile: profilesById.get(t.otherId) ?? null }))
    .sort((a, b) => new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime());

  const cache = inboxCache(userId);
  cache.threads = threads;
  // Prime conversations so opening one skips the profile lookup.
  for (const t of threads) if (t.profile?.username) cache.profiles.set(t.profile.username, t.profile);
  return { threads };
}

// `notifications: true` also loads Activity / New followers / Pending
// purchases once and marks them seen (the inbox page does; the dock doesn't,
// so peeking at a chat doesn't clear the inbox's activity dots).
export function useInboxThreads(user, { notifications = false } = {}) {
  // Last copy from this tab (src/lib/inboxCache.js) renders immediately.
  const [threads, setThreads] = useState(() => (user ? inboxCache(user.id).threads : null));
  const [error, setError] = useState(null);
  const [newFollowers, setNewFollowers] = useState([]);
  const [pendingPurchases, setPendingPurchases] = useState([]);
  const [activity, setActivity] = useState([]);
  const inFlight = useRef(false);
  const userId = user?.id ?? null;

  const reload = useCallback(async () => {
    if (!userId || inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await fetchThreads(userId);
      if (result.error) {
        setError(result.error);
        // Leave the loading state, or the error never renders on a first visit.
        setThreads((current) => current ?? []);
      } else {
        setError(null);
        setThreads(result.threads);
      }
    } finally {
      inFlight.current = false;
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    reload();

    const supabase = getSupabaseClient();
    let debounce = null;
    const soon = () => { clearTimeout(debounce); debounce = setTimeout(() => { if (!cancelled) reload(); }, 400); };
    const channel = supabase
      .channel(`inbox-list-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new;
        if (m?.sender_id === userId || m?.recipient_id === userId) soon();
      })
      .subscribe();
    const poll = setInterval(() => { if (document.visibilityState === "visible") reload(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") soon(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(UNREAD_CHANGED_EVENT, soon);

    return () => {
      cancelled = true;
      clearTimeout(debounce);
      supabase.removeChannel(channel);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(UNREAD_CHANGED_EVENT, soon);
    };
  }, [userId, reload]);

  // Keep the fetched rows for this visit, then advance the cutoff and
  // refresh the header badge immediately.
  useEffect(() => {
    if (!userId || !notifications) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const response = await authedFetch("/api/inbox-notifications", { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (cancelled) return;
        setNewFollowers(body.recentFollowers ?? []);
        setPendingPurchases(body.pendingPurchases ?? []);
        setActivity(body.recentNotifications ?? []);
        const seen = await authedFetch("/api/inbox-notifications", { method: "POST" });
        if (seen.ok && !cancelled) window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT));
      } catch {
        // Messages remain usable if the optional strips cannot load.
      }
    })();
    return () => { cancelled = true; };
  }, [userId, notifications]);

  return { threads, error, newFollowers, pendingPurchases, activity, reload };
}

// The inbox layout loads once and hands the result to its pages.
export const InboxDataContext = createContext(null);
export function useInboxData() {
  return useContext(InboxDataContext);
}
