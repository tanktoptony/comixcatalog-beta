// POST /api/messages/reactions  { message_id, emoji }
// Toggles the signed-in member's reaction on a direct message: adds it, or
// removes it if they already reacted with that emoji. Returns every
// reaction on the message so the client can settle its optimistic state.
//
// Browsers can read reactions (RLS, participants only) but not write them
// (migration 0117); this route checks that the member is in the
// conversation, that neither side has blocked the other, and that the
// emoji is on the picker's list.

import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";
import { isKnownEmoji } from "@/lib/emoji";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOURLY_LIMIT = 300;
const COLUMNS = "message_id, user_id, emoji, created_at";

function jsonError(error, status) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return jsonError("Unauthorized", 401);

  let payload;
  try {
    payload = await req.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }
  const messageId = typeof payload?.message_id === "string" ? payload.message_id.trim() : "";
  const emoji = typeof payload?.emoji === "string" ? payload.emoji : "";
  if (!UUID.test(messageId)) return jsonError("Invalid message.", 400);
  if (!isKnownEmoji(emoji)) return jsonError("Pick an emoji from the list.", 400);

  try {
    const supabase = getServiceClient();
    const { data: message, error: messageError } = await supabase
      .from("messages")
      .select("id, sender_id, recipient_id, is_system")
      .eq("id", messageId)
      .maybeSingle();
    if (messageError) throw new Error(`message lookup failed: ${messageError.message}`);
    if (!message || (message.sender_id !== user.id && message.recipient_id !== user.id)) {
      return jsonError("Message not found.", 404);
    }
    if (message.is_system) return jsonError("You can't react to order notes.", 400);

    const otherId = message.sender_id === user.id ? message.recipient_id : message.sender_id;
    const { count: blockCount, error: blockError } = await supabase
      .from("user_blocks")
      .select("blocker_id", { count: "exact", head: true })
      .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${otherId}),and(blocker_id.eq.${otherId},blocked_id.eq.${user.id})`);
    if (blockError) throw new Error(`block lookup failed: ${blockError.message}`);
    if ((blockCount ?? 0) > 0) return jsonError("You can't react in this conversation.", 403);

    const { data: existing, error: existingError } = await supabase
      .from("message_reactions")
      .select("message_id")
      .eq("message_id", messageId)
      .eq("user_id", user.id)
      .eq("emoji", emoji)
      .maybeSingle();
    if (existingError) throw new Error(`reaction lookup failed: ${existingError.message}`);

    if (existing) {
      const { error: deleteError } = await supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", user.id)
        .eq("emoji", emoji);
      if (deleteError) throw new Error(`reaction delete failed: ${deleteError.message}`);
    } else {
      const since = new Date(Date.now() - 3600_000).toISOString();
      const { count: recent, error: countError } = await supabase
        .from("message_reactions")
        .select("message_id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", since);
      if (countError) throw new Error(`reaction count failed: ${countError.message}`);
      if ((recent ?? 0) >= HOURLY_LIMIT) return jsonError("Too many reactions. Try again in a bit.", 429);

      const { error: insertError } = await supabase
        .from("message_reactions")
        .insert({ message_id: messageId, user_id: user.id, emoji });
      // A double tap can race the lookup above; the row exists either way.
      if (insertError && insertError.code !== "23505") throw new Error(`reaction insert failed: ${insertError.message}`);
    }

    const { data: reactions, error: listError } = await supabase
      .from("message_reactions")
      .select(COLUMNS)
      .eq("message_id", messageId)
      .order("created_at", { ascending: true });
    if (listError) throw new Error(`reaction list failed: ${listError.message}`);
    return NextResponse.json({ reactions: reactions ?? [], added: !existing });
  } catch (error) {
    console.error("POST /api/messages/reactions failed:", error);
    return jsonError("Could not save that reaction.", 500);
  }
}
