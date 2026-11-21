import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { canEditComment, isUuid, validateCommentEdit } from "@/lib/comments";
import { COMMENT_COLUMNS, resolveTarget } from "@/lib/commentsData";
import { getServiceClient } from "@/lib/supabase/service";

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function loadComment(db, id) {
  if (!isUuid(id)) return null;
  const { data, error } = await db.from("comments").select(COMMENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data && !data.deleted_at ? data : null;
}

function expire(comment) {
  if (comment.target_type === "issue") revalidateTag(`issue:${comment.target_id}`, { expire: 0 });
}

// Edit your own comment within 15 minutes of posting it.
export async function PATCH(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const parsed = validateCommentEdit(await req.json().catch(() => null));
  if (parsed.error) return json({ error: parsed.error }, 400);

  const db = getServiceClient();
  try {
    const { id } = await params;
    const comment = await loadComment(db, id);
    if (!comment || String(comment.user_id) !== String(user.id)) return json({ error: "Comment not found." }, 404);
    if (!canEditComment(comment, user.id)) return json({ error: "Comments can only be edited for 15 minutes." }, 403);

    const { data, error } = await db.from("comments")
      .update({ body: parsed.value.body, edited_at: new Date().toISOString() })
      .eq("id", comment.id).select(COMMENT_COLUMNS).single();
    if (error) throw error;
    expire(comment);
    return json({ comment: data });
  } catch (error) {
    console.error("PATCH /api/comments/[id] failed:", error);
    return json({ error: "Could not save your edit." }, 500);
  }
}

// The author, or the owner of the list or review it sits under, can delete.
// Soft delete: replies keep their place under a "Comment deleted" line.
export async function DELETE(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const db = getServiceClient();
  try {
    const { id } = await params;
    const comment = await loadComment(db, id);
    if (!comment) return json({ error: "Comment not found." }, 404);

    let allowed = String(comment.user_id) === String(user.id);
    if (!allowed && comment.target_type !== "issue") {
      const target = await resolveTarget(db, comment.target_type, comment.target_id, user.id);
      allowed = Boolean(target?.ownerId) && String(target.ownerId) === String(user.id);
    }
    if (!allowed) return json({ error: "Comment not found." }, 404);

    const { error } = await db.from("comments").update({ deleted_at: new Date().toISOString() }).eq("id", comment.id);
    if (error) throw error;
    // Its notifications go too, so nobody opens a link to a deleted comment.
    const cleanup = await db.from("notifications").delete().eq("comment_id", comment.id);
    if (cleanup.error) console.error("comment notification cleanup failed:", cleanup.error.message);
    expire(comment);
    return json({ deleted: true });
  } catch (error) {
    console.error("DELETE /api/comments/[id] failed:", error);
    return json({ error: "Could not delete the comment." }, 500);
  }
}
