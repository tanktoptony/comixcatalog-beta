import { after, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { notifyRecipient } from "@/lib/messageEmail";
import { getServiceClient } from "@/lib/supabase/service";
import { findOffPlatformPaymentTerms } from "@/lib/messageContent";

const MESSAGE_COLUMNS = "id, sender_id, recipient_id, order_id, is_system, body, read_at, created_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  const recipientUsername =
    typeof payload?.recipient === "string" ? payload.recipient.trim() : "";
  const orderId = typeof payload?.order_id === "string" ? payload.order_id.trim() : "";
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!recipientUsername && !orderId) return jsonError("Recipient is required.", 400);
  if (orderId && !UUID.test(orderId)) return jsonError("Invalid order.", 400);
  if (!body) return jsonError("Message can't be empty.", 400);
  if (body.length > 4000) return jsonError("Message is too long.", 400);

  try {
    const supabase = getServiceClient();
    let order = null;
    if (orderId) {
      const { data, error } = await supabase
        .from("orders")
        .select("id,buyer_id,seller_id")
        .eq("id", orderId)
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .maybeSingle();
      if (error) throw new Error(`order lookup failed: ${error.message}`);
      if (!data) return jsonError("Order not found.", 404);
      order = data;
    }
    // Order threads address the other party by id (a buyer may have no username).
    const recipientQuery = supabase.from("profiles").select("id, username");
    const { data: recipient, error: recipientError } = await (order
      ? recipientQuery.eq("id", order.buyer_id === user.id ? order.seller_id : order.buyer_id)
      : recipientQuery.eq("username", recipientUsername)) // exact, like the thread page; ilike treats _ and % as wildcards
      .maybeSingle();
    if (recipientError) throw new Error(`recipient lookup failed: ${recipientError.message}`);
    if (!recipient) return jsonError("Couldn't find that user.", 404);
    if (recipient.id === user.id) return jsonError("You can't message yourself.", 400);

    if (!order) {
      const { count: blockCount, error: blockError } = await supabase
        .from("user_blocks")
        .select("blocker_id", { count: "exact", head: true })
        .or(
          `and(blocker_id.eq.${user.id},blocked_id.eq.${recipient.id}),` +
            `and(blocker_id.eq.${recipient.id},blocked_id.eq.${user.id})`
        );
      if (blockError) throw new Error(`block lookup failed: ${blockError.message}`);
      if ((blockCount ?? 0) > 0) return jsonError("You can't message this member.", 403);
    }

    const { data: sender, error: senderError } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    if (senderError) throw new Error(`sender profile lookup failed: ${senderError.message}`);

    const { data: message, error: insertError } = await supabase
      .from("messages")
      .insert({
        sender_id: user.id,
        recipient_id: recipient.id,
        order_id: order?.id || null,
        body,
      })
      .select(MESSAGE_COLUMNS)
      .single();
    if (insertError) throw new Error(`message insert failed: ${insertError.message}`);
    const terms = findOffPlatformPaymentTerms(body);
    if (terms.length > 0) {
      const { error: flagError } = await supabase.from("message_flags").insert({
        message_id: message.id,
        kind: "offplatform_payment",
        terms,
      });
      if (flagError) {
        console.error("message payment warning flag failed:", flagError);
      }
      if (order) {
        const { error: orderFlagError } = await supabase.from("order_flags").upsert({
          order_id: order.id,
          kind: "offplatform_terms",
          detail: { message_id: message.id, terms },
        }, {
          onConflict: "order_id,kind",
          ignoreDuplicates: true,
        });
        if (orderFlagError) {
          console.error("order payment warning flag failed:", orderFlagError);
        }
      }
    }
    after(() => notifyRecipient({
      supabase,
      senderId: user.id,
      senderUsername: sender?.username ?? null,
      recipientId: recipient.id,
      recipientUsername: recipient.username,
    }));
    return NextResponse.json({
      ...message,
      warning: terms.length > 0,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/messages failed:", error);
    return jsonError("Could not send message.", 500);
  }
}
