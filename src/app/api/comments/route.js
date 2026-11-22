import { revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { DAILY_COMMENT_LIMIT, validateCommentInput, validTargetId } from "@/lib/comments";
import { COMMENT_COLUMNS, loadThread, notifyForComment, resolveTarget } from "@/lib/commentsData";
import { loadBlocked } from "@/lib/feed/loadFeed";
import { getServiceClient } from "@/lib/supabase/service";
import { emailInstantActivityForComment } from "@/lib/activityEmailSend";

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

// Issue comments are part of the cached issue page data (pageData.js).
function expireTarget(target) {
  if (target.targetType === "issue") revalidateTag(`issue:${target.targetId}`, { expire: 0 });
}

export async function GET(req) {
  const params = new URL(req.url).searchParams;
  const targetType = params.get("type");
  const targetId = validTargetId(targetType, params.get("id"));
  if (!targetId) return json({ error: "Invalid comment target." }, 400);

  const user = await getAuthedUser(req);
  const db = getServiceClient();
  try {
    const target = await resolveTarget(db, targetType, targetId, user?.id ?? null);
    if (!target || !target.viewable) return json({ error: "Not found." }, 404);
    const data = await loadThread(db, target, user?.id ?? null);
    return json(data);
  } catch (error) {
    console.error("GET /api/comments failed:", error);
    return json({ error: "Could not load comments." }, 500);
  }
}

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return json({ error: "Sign in to comment." }, 401);

  const parsed = validateCommentInput(await req.json().catch(() => null));
  if (parsed.error) return json({ error: parsed.error }, 400);
  const { targetType, targetId, parentId, body } = parsed.value;

  const db = getServiceClient();
  try {
    const profileResult = await db.from("profiles").select("id, username").eq("id", user.id).maybeSingle();
    if (profileResult.error) throw profileResult.error;
    if (!profileResult.data?.username) return json({ error: "Pick a username first." }, 400);

    const target = await resolveTarget(db, targetType, targetId, user.id);
    if (!target || !target.viewable) return json({ error: "That page could not be found." }, 404);

    // Commenting on a list or review owned by someone who blocked you (or
    // whom you blocked) is not allowed; issue pages have no owner.
    if (target.ownerId && String(target.ownerId) !== String(user.id)) {
      const blocked = await loadBlocked(db, user.id);
      if (blocked.has(String(target.ownerId))) return json({ error: "You can't comment here." }, 403);
    }

    let parentAuthorId = null;
    if (parentId) {
      const parentResult = await db.from("comments").select("id, user_id, target_type, target_id, parent_id, deleted_at")
        .eq("id", parentId).maybeSingle();
      if (parentResult.error) throw parentResult.error;
      const parent = parentResult.data;
      if (!parent || parent.deleted_at || parent.parent_id || parent.target_type !== target.targetType || String(parent.target_id) !== String(target.targetId)) {
        return json({ error: "That comment can't be replied to." }, 400);
      }
      parentAuthorId = parent.user_id;
    }

    const since = new Date(Date.now() - 86_400_000).toISOString();
    const countResult = await db.from("comments").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).gte("created_at", since);
    if (countResult.error) throw countResult.error;
    if ((countResult.count ?? 0) >= DAILY_COMMENT_LIMIT) {
      return json({ error: "You've commented a lot today. Try again tomorrow." }, 429);
    }

    const insert = await db.from("comments").insert({
      user_id: user.id,
      target_type: target.targetType,
      target_id: String(target.targetId),
      parent_id: parentId,
      body,
    }).select(COMMENT_COLUMNS).single();
    if (insert.error) throw insert.error;

    await notifyForComment(db, { comment: insert.data, target, parentAuthorId });
    // "Right away" activity emails, after the response (off until
    // ACTIVITY_EMAILS_LIVE is set, so nothing goes out before a test).
    if (process.env.ACTIVITY_EMAILS_LIVE === "true") after(() => emailInstantActivityForComment(getServiceClient(), insert.data.id));
    expireTarget(target);
    return json({ comment: insert.data }, 201);
  } catch (error) {
    console.error("POST /api/comments failed:", error);
    return json({ error: "Could not post your comment." }, 500);
  }
}
