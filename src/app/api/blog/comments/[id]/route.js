import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { getAuthedUser } from "@/lib/authServer";

export async function DELETE(req, context) {
  const { id } = context.params;

  const authedUser = await getAuthedUser(req);
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();

  const { data: comment } = await supabase
    .from("blog_comments")
    .select("user_id")
    .eq("id", id)
    .single();

  if (!comment || String(comment.user_id) !== String(authedUser.id)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await supabase
    .from("blog_comments")
    .delete()
    .eq("id", id);

  return NextResponse.json({ success: true });
}
