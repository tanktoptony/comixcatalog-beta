"use client";

// Tracks the user's unread inbound message count. Used by the header
// Inbox icon badge. Reuses the same RLS-protected `messages` table — the
// partial index `messages_recipient_unread_idx` makes the count fast.

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";

// Fired on window by the thread page after it marks messages read, so the
// badge updates immediately instead of on its next 60 s poll.
export const UNREAD_CHANGED_EVENT = "cc:unread-changed";

export function useUnreadMessageCount() {
  const { user } = useAuth();
  // Tagged with the user it was fetched for, so a different account never
  // sees the previous one's number, with no state reset in the effect.
  const [unread, setUnread] = useState({ userId: null, count: 0 });

  useEffect(() => {
    if (!user) return;

    const supabase = getSupabaseClient();
    let cancelled = false;

    async function refresh() {
      const { count: c } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .is("read_at", null);
      if (!cancelled) setUnread({ userId: user.id, count: c ?? 0 });
    }

    refresh();

    // Polling only, every 60 s while the tab is visible, plus a refresh when
    // the tab comes back. This used to also hold a Supabase Realtime
    // subscription to EVERY insert/update on messages (unfiltered), opened
    // by every signed-in visitor on every page via the header badge;
    // Realtime change polling was the largest consumer of database time in
    // pg_stat_statements (2026-10-01). A badge can be a minute behind.
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60000);
    function onVisible() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(UNREAD_CHANGED_EVENT, refresh);

    return () => {
      cancelled = true;
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(UNREAD_CHANGED_EVENT, refresh);
    };
  }, [user]);

  return user && unread.userId === user.id ? unread.count : 0;
}
