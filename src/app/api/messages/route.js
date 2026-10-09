import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { checkLimits, MESSAGE_LIMITS } from "@/lib/messageLimits";
import { getServiceClient } from "@/lib/supabase/service";

const MESSAGE_COLUMNS = "id, sender_id, recipient_id, body, read_at, created_at";

function jsonError(error, status) {
  return NextResponse.json({ error }, { status });
}

async function exactCount(query, label) {
  const { count, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return count ?? 0;
}

async function hasConversation(supabase, senderId, recipientId, before) {
  const outbound = supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", senderId)
    .eq("recipient_id", recipientId);
  const inbound = supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", recipientId)
    .eq("recipient_id", senderId);
  const [sent, received] = await Promise.all([
    exactCount(before ? outbound.lt("created_at", before) : outbound, "outbound conversation lookup failed"),
    exactCount(before ? inbound.lt("created_at", before) : inbound, "inbound conversation lookup failed"),
  ]);
  return sent + received > 0;
}

async function countNewConversationsToday(supabase, senderId, since) {
  const { data, error } = await supabase
    .from("messages")
    .select("recipient_id, created_at")
    .eq("sender_id", senderId)
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`recent conversation lookup failed: ${error.message}`);

  const firstSentByRecipient = new Map();
  for (const message of data ?? []) {
    if (!firstSentByRecipient.has(message.recipient_id)) {
      firstSentByRecipient.set(message.recipient_id, message.created_at);
    }
  }

  const checks = [...firstSentByRecipient].map(async ([recipientId, firstSentAt]) =>
    (await hasConversation(supabase, senderId, recipientId, firstSentAt)) ? 0 : 1
  );
  const results = await Promise.all(checks);
  return results.reduce((sum, value) => sum + value, 0);
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

  const recipientUsername =
    typeof payload?.recipient === "string" ? payload.recipient.trim() : "";
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!recipientUsername) return jsonError("Recipient is required.", 400);
  if (!body) return jsonError("Message can't be empty.", 400);
  if (body.length > 4000) return jsonError("Message is too long.", 400);

  try {
    const supabase = getServiceClient();
    const { data: recipient, error: recipientError } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("username", recipientUsername) // exact, like the thread page; ilike treats _ and % as wildcards
      .maybeSingle();
    if (recipientError) throw new Error(`recipient lookup failed: ${recipientError.message}`);
    if (!recipient) return jsonError("Couldn't find that user.", 404);
    if (recipient.id === user.id) return jsonError("You can't message yourself.", 400);

    const { count: blockCount, error: blockError } = await supabase
      .from("user_blocks")
      .select("blocker_id", { count: "exact", head: true })
      .or(
        `and(blocker_id.eq.${user.id},blocked_id.eq.${recipient.id}),` +
          `and(blocker_id.eq.${recipient.id},blocked_id.eq.${user.id})`
      );
    if (blockError) throw new Error(`block lookup failed: ${blockError.message}`);
    if ((blockCount ?? 0) > 0) return jsonError("You can't message this member.", 403);

    const now = Date.now();
    const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const [sentLastHour, isNewConversation, profileResult] = await Promise.all([
      exactCount(
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("sender_id", user.id)
          .gte("created_at", hourAgo),
        "hourly message count failed"
      ),
      hasConversation(supabase, user.id, recipient.id),
      supabase.from("profiles").select("created_at").eq("id", user.id).single(),
    ]);
    if (profileResult.error || !profileResult.data?.created_at) {
      throw new Error(`sender profile lookup failed: ${profileResult.error?.message || "missing created_at"}`);
    }

    const accountCreatedAt = new Date(profileResult.data.created_at).getTime();
    if (!Number.isFinite(accountCreatedAt)) throw new Error("sender profile has invalid created_at");
    const isNewAccount =
      now - accountCreatedAt <
      MESSAGE_LIMITS.newAccountDays * 24 * 60 * 60 * 1000;
    const hourlyLimitError = checkLimits({
      isNewAccount,
      sentLastHour,
      newConversationsToday: 0,
      isNewConversation: false,
    });
    if (hourlyLimitError) return jsonError(hourlyLimitError.error, hourlyLimitError.status);

    const newConversationsToday = isNewConversation
      ? await countNewConversationsToday(supabase, user.id, dayAgo)
      : 0;
    const limitError = checkLimits({
      isNewAccount,
      sentLastHour,
      newConversationsToday,
      isNewConversation,
    });
    if (limitError) return jsonError(limitError.error, limitError.status);

    const { data: message, error: insertError } = await supabase
      .from("messages")
      .insert({ sender_id: user.id, recipient_id: recipient.id, body })
      .select(MESSAGE_COLUMNS)
      .single();
    if (insertError) throw new Error(`message insert failed: ${insertError.message}`);
    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("POST /api/messages failed:", error);
    return jsonError("Could not send message.", 500);
  }
}
