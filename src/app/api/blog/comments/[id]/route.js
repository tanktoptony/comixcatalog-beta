import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function DELETE(req, context) {
  const { id } = context.params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const body = await req.json();
  const { user_id } = body;

  const { data: comment } = await supabase
    .from("blog_comments")
    .select("user_id")
    .eq("id", id)
    .single();

  if (!comment || String(comment.user_id) !== String(user_id)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await supabase
    .from("blog_comments")
    .delete()
    .eq("id", id);

  return NextResponse.json({ success: true });
}
