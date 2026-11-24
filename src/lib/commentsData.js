// Reads and writes for comments (migration 0114). Service role only; the
// pure rules live in src/lib/comments.js.

import { buildThread, canEditComment, commentExcerpt, countThread, extractMentions, notificationTargets } from "@/lib/comments";
import { loadBlocked } from "@/lib/feed/loadFeed";
import { issueNumberSuffix } from "@/lib/issueNumberLabel";
import { canViewList } from "@/lib/lists";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";
import { bestYearFor } from "@/lib/years";

const PROFILE_COLUMNS = "id, username, avatar_key, avatar_url, is_public";
const COMMENT_COLUMNS = "id, user_id, target_type, target_id, parent_id, body, created_at, edited_at, deleted_at";

function must(result, what) {
  if (result.error) throw new Error(`${what} failed: ${result.error.message}`);
  return result.data;
}

async function issueLabel(db, gcdId) {
  const issue = must(await db.from("gcd_issues")
    .select("gcd_id, base_gcd_issue_id, series_gcd_id, issue_number, key_date, publication_date")
    .eq("gcd_id", Number(gcdId)).maybeSingle(), "comment issue lookup");
  if (!issue) return null;
  const base = Number(issue.base_gcd_issue_id || issue.gcd_id);
  const series = issue.series_gcd_id == null ? null : must(await db.from("series")
    .select("title").eq("gcd_id", Number(issue.series_gcd_id)).limit(1).maybeSingle(), "comment series lookup");
  const year = bestYearFor(issue);
  const label = `${series?.title || "Untitled"}${issueNumberSuffix(issue.issue_number)}${year ? ` (${year})` : ""}`;
  return { base, label };
}

// What a comment hangs off: its canonical id, owner (who hears about new
// comments), a readable label, the page it lives on, and whether the viewer
// may see it. Returns null when the target doesn't exist.
export async function resolveTarget(db, targetType, targetId, viewerId = null) {
  if (targetType === "issue") {
    const issue = await issueLabel(db, targetId);
    if (!issue) return null;
    return { targetType, targetId: String(issue.base), ownerId: null, label: issue.label, url: `/issue/gcd-${issue.base}`, viewable: true };
  }

  if (targetType === "list") {
    const list = must(await db.from("collector_lists").select("id, user_id, title, slug, is_public")
      .eq("id", targetId).maybeSingle(), "comment list lookup");
    if (!list) return null;
    const owner = must(await db.from("profiles").select(PROFILE_COLUMNS).eq("id", list.user_id).maybeSingle(), "comment list owner lookup");
    return {
      targetType,
      targetId: list.id,
      ownerId: list.user_id,
      label: `the list "${list.title}"`,
      url: owner?.username ? `/u/${owner.username}/lists/${list.slug}` : "/lists",
      viewable: canViewList(list, owner, viewerId),
      publicToAll: canViewList(list, owner, null),
    };
  }

  if (targetType === "review") {
    const review = must(await db.from("issue_reviews").select("id, user_id, base_gcd_issue_id")
      .eq("id", targetId).maybeSingle(), "comment review lookup");
    if (!review) return null;
    const [issue, author] = await Promise.all([
      issueLabel(db, review.base_gcd_issue_id),
      db.from("profiles").select(PROFILE_COLUMNS).eq("id", review.user_id).maybeSingle().then((result) => must(result, "comment review author lookup")),
    ]);
    const issueText = issue?.label || "an issue";
    return {
      targetType,
      targetId: review.id,
      ownerId: review.user_id,
      label: author?.username ? `@${author.username}'s review of ${issueText}` : `a review of ${issueText}`,
      url: `/issue/gcd-${Number(review.base_gcd_issue_id)}#reviews`,
      // Reviews are public once listed; a private member's review is not
      // listed, so it can't collect public replies either.
      viewable: (Boolean(author?.username) && author.is_public !== false) || String(review.user_id) === String(viewerId),
    };
  }

  return null;
}

async function profilesByIds(db, ids) {
  const unique = [...new Set(ids.map(String))];
  const rows = [];
  for (let index = 0; index < unique.length; index += 200) {
    rows.push(...must(await db.from("profiles").select(PROFILE_COLUMNS).in("id", unique.slice(index, index + 200)), "comment profiles lookup"));
  }
  return new Map(rows.map((row) => [String(row.id), row]));
}

async function profilesByUsernames(db, usernames) {
  const unique = [...new Set(usernames.map((name) => String(name).toLowerCase()))];
  if (!unique.length) return [];
  return must(await db.from("profiles").select("id, username").in("username", unique.slice(0, 200)), "mention lookup");
}

function shapeComment(row, profile, viewerId, ownerId) {
  const mine = viewerId && String(row.user_id) === String(viewerId);
  return {
    id: row.id,
    user_id: row.user_id,
    parent_id: row.parent_id,
    body: row.body,
    created_at: row.created_at,
    edited_at: row.edited_at,
    username: profile.username,
    avatar_key: profile.avatar_key,
    avatar_url: profile.avatar_url,
    // Private members still show by name (commenting is public) but their
    // name doesn't link to a profile nobody else can open.
    linkable: profile.is_public !== false,
    canEdit: canEditComment(row, viewerId),
    canDelete: Boolean(mine || (viewerId && ownerId && String(ownerId) === String(viewerId))),
  };
}

// The whole thread for one target, shaped for CommentThread. Comments from
// members without a username (unfinished signups) are left out.
export async function loadThread(db, { targetType, targetId, ownerId = null }, viewerId = null) {
  const rows = await fetchAllPages(() => db.from("comments").select(COMMENT_COLUMNS)
    .eq("target_type", targetType).eq("target_id", String(targetId)), "id", { maxRows: 5000 });
  const profiles = await profilesByIds(db, rows.map((row) => row.user_id));
  const named = rows.filter((row) => profiles.get(String(row.user_id))?.username);
  const blocked = viewerId ? [...(await loadBlocked(db, viewerId))] : [];
  const thread = buildThread(named, { blockedIds: blocked });

  const mentioned = thread.flatMap((item) => [item, ...(item.replies ?? [])])
    .filter((item) => !item.placeholder).flatMap((item) => extractMentions(item.body));
  const known = (await profilesByUsernames(db, mentioned)).map((row) => row.username);

  const shape = (row) => shapeComment(row, profiles.get(String(row.user_id)), viewerId, ownerId);
  return {
    count: countThread(thread),
    knownUsernames: known,
    thread: thread.map((item) => ({
      ...(item.placeholder ? { id: item.id, created_at: item.created_at, placeholder: item.placeholder } : shape(item)),
      replies: (item.replies ?? []).map(shape),
    })),
  };
}

// Comment counts for many targets of one type (review reply counts).
export async function commentCounts(db, targetType, targetIds) {
  const ids = [...new Set(targetIds.map(String))];
  const counts = new Map(ids.map((id) => [id, 0]));
  if (!ids.length) return counts;
  for (let index = 0; index < ids.length; index += 200) {
    const rows = await fetchAllPages(() => db.from("comments").select("id, target_id")
      .eq("target_type", targetType).in("target_id", ids.slice(index, index + 200)).is("deleted_at", null), "id", { maxRows: 20000 });
    for (const row of rows) counts.set(String(row.target_id), (counts.get(String(row.target_id)) ?? 0) + 1);
  }
  return counts;
}

// Writes the notifications for a new comment. Never throws: a notification
// failure must not lose the comment.
export async function notifyForComment(db, { comment, target, parentAuthorId = null }) {
  try {
    const mentionedNames = extractMentions(comment.body);
    const mentioned = await profilesByUsernames(db, mentionedNames);
    const blocked = await loadBlocked(db, comment.user_id);
    const targets = notificationTargets({
      commenterId: comment.user_id,
      targetOwnerId: target.ownerId,
      parentAuthorId,
      mentionedIds: mentioned.map((row) => row.id),
      blockedPairs: [...blocked],
    });
    if (!targets.length) return 0;

    // A private list's owner is the only one who can open it; don't send a
    // mention to someone who would land on "This list is private".
    const visibleTargets = target.targetType === "list" && !target.publicToAll
      ? targets.filter((row) => String(row.user_id) === String(target.ownerId))
      : targets;

    const url = `${target.url.split("#")[0]}#comment-${comment.id}`;
    const rows = visibleTargets.map(({ user_id, kind }) => ({
      user_id,
      actor_id: comment.user_id,
      kind,
      url,
      label: target.label.slice(0, 300),
      excerpt: commentExcerpt(comment.body, 140),
      comment_id: comment.id,
    }));
    if (!rows.length) return 0;
    const { error } = await db.from("notifications").insert(rows);
    if (error) throw error;
    return rows.length;
  } catch (error) {
    console.error("comment notifications failed:", error?.message ?? error);
    return 0;
  }
}

export { COMMENT_COLUMNS };
