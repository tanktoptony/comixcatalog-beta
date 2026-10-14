import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { feedbackRatingValue } from "@/lib/feedback";
import { getServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch((error) => {
    console.error("Feedback request JSON failed:", error);
    return null;
  });
  const rating = feedbackRatingValue(body?.rating);
  const comment = typeof body?.comment === "string" ? body.comment.trim() : "";
  if (rating == null) return NextResponse.json({ error: "Choose a rating." }, { status: 400 });
  if (comment.length > 500) return NextResponse.json({ error: "Comment must be 500 characters or fewer." }, { status: 400 });
  const { id } = await params;
  const { data, error } = await getServiceClient().rpc("order_leave_feedback", {
    p_order: id,
    p_author: user.id,
    p_rating: rating,
    p_comment: comment,
  });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "You already left feedback." }, { status: 409 });
    if (error.code === "42501") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error.code === "55000") return NextResponse.json({ error: error.message }, { status: 409 });
    console.error(`POST /api/orders/${id}/feedback failed:`, error);
    return NextResponse.json({ error: "Could not save feedback." }, { status: 500 });
  }
  return NextResponse.json({
    status: "saved",
    visible: new Date(data.visible_at).getTime() <= Date.now(),
  });
}
