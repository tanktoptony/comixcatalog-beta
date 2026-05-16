"use client";

// Subscribes to the user's unread inbound message count. Used by the header
// Inbox icon badge. Reuses the same RLS-protected `messages` table — the
// partial index `messages_recipient_unread_idx` makes the count fast.

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";

export function useUnreadMessageCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }

    const supabase = getSupabaseClient();
    let cancelled = false;
    let channel = null;

    async function refresh() {
      const { count: c } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .is("read_at", null);
      if (!cancelled) setCount(c ?? 0);
    }

    refresh();

    // Refresh on any insert/update to messages where we're the recipient.
    // The RLS policy already restricts what we'd see, but we still scope
    // client-side to avoid extra refreshes on the sender side.
    channel = supabase
      .channel(`unread-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          if (payload.new?.recipient_id === user.id) refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          if (payload.new?.recipient_id === user.id) refresh();
        }
      )
      .subscribe();

    // Soft refresh every 30s as a fallback.
    const poll = setInterval(refresh, 30000);

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [user]);

  return count;
}
