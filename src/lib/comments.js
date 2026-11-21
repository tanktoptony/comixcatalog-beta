// Comments under issues, lists and reviews. Pure functions only (relative
// imports, so `node --test` can load this); reads and writes live in
// src/lib/commentsData.js and src/app/api/comments.

export const COMMENT_MAX = 2000;
export const MENTION_LIMIT = 5;
export const DAILY_COMMENT_LIMIT = 100;
export const EDIT_WINDOW_MINUTES = 15;
export const COMMENT_TARGET_TYPES = ["issue", "list", "review"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Same rule as invites and signup: 3-20 letters, digits or underscores.
// An @ right after a word character is an email address, not a mention.
const MENTION = /(^|[^A-Za-z0-9_@.])@([A-Za-z0-9_]{3,20})(?![A-Za-z0-9_])/g;

export function isUuid(value) {
  return UUID.test(String(value ?? ""));
}

export function cleanCommentBody(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .replace(/\n{3,}/g, "\n\n");
}

export function validTargetId(targetType, targetId) {
  const id = String(targetId ?? "").trim();
  if (targetType === "issue") return /^[1-9]\d{0,9}$/.test(id) ? id : null;
  if (targetType === "list" || targetType === "review") return isUuid(id) ? id.toLowerCase() : null;
  return null;
}

export function validateCommentInput(input) {
  const targetType = input?.target_type ?? input?.targetType;
  if (!COMMENT_TARGET_TYPES.includes(targetType)) return { error: "Invalid comment target." };

  const targetId = validTargetId(targetType, input?.target_id ?? input?.targetId);
  if (!targetId) return { error: "Invalid comment target." };

  const rawParent = input?.parent_id ?? input?.parentId ?? null;
  if (rawParent != null && rawParent !== "" && !isUuid(rawParent)) return { error: "Invalid reply." };
  const parentId = rawParent ? String(rawParent).toLowerCase() : null;

  if (typeof input?.body !== "string") return { error: "Write a comment first." };
  const body = cleanCommentBody(input.body);
  if (!body) return { error: "Write a comment first." };
  if (body.length > COMMENT_MAX) return { error: "Comments can be up to 2,000 characters." };

  return { value: { targetType, targetId, parentId, body } };
}

export function validateCommentEdit(input) {
  if (typeof input?.body !== "string") return { error: "Write a comment first." };
  const body = cleanCommentBody(input.body);
  if (!body) return { error: "Write a comment first." };
  if (body.length > COMMENT_MAX) return { error: "Comments can be up to 2,000 characters." };
  return { value: { body } };
}

// Lowercased usernames mentioned in a comment, in order, first MENTION_LIMIT.
export function extractMentions(body) {
  const found = [];
  for (const match of String(body ?? "").matchAll(MENTION)) {
    const username = match[2].toLowerCase();
    if (!found.includes(username)) found.push(username);
    if (found.length >= MENTION_LIMIT) break;
  }
  return found;
}

// Splits a body into text and mention segments so the UI can link mentions
// without rendering HTML. Only usernames that exist become mentions.
export function renderSegments(body, knownUsernames = []) {
  const text = String(body ?? "");
  const known = new Set([...knownUsernames].map((name) => String(name).toLowerCase()));
  const segments = [];
  let last = 0;

  for (const match of text.matchAll(MENTION)) {
    const username = match[2];
    if (!known.has(username.toLowerCase())) continue;
    const start = match.index + match[1].length;
    if (start > last) segments.push({ type: "text", text: text.slice(last, start) });
    segments.push({ type: "mention", username });
    last = start + 1 + username.length;
  }

  if (last < text.length) segments.push({ type: "text", text: text.slice(last) });
  return segments;
}

export function canEditComment(comment, viewerId, now = Date.now()) {
  if (!viewerId || String(comment?.user_id) !== String(viewerId) || comment?.deleted_at) return false;
  const created = new Date(comment.created_at).getTime();
  return Number.isFinite(created) && now - created <= EDIT_WINDOW_MINUTES * 60_000;
}

// Rows: comments for one target, any order. Returns top-level comments
// oldest first with replies (oldest first) under each. Blocked authors are
// removed; a removed or deleted parent that still has visible replies stays
// as a placeholder so the replies keep their context.
export function buildThread(rows, { blockedIds = [] } = {}) {
  const blocked = new Set([...blockedIds].map(String));
  const byTime = (a, b) => String(a.created_at).localeCompare(String(b.created_at));
  const visible = (row) => !blocked.has(String(row.user_id)) && !row.deleted_at;

  const repliesByParent = new Map();
  for (const row of rows ?? []) {
    if (!row.parent_id) continue;
    const key = String(row.parent_id);
    if (!repliesByParent.has(key)) repliesByParent.set(key, []);
    repliesByParent.get(key).push(row);
  }

  const thread = [];
  for (const row of [...(rows ?? [])].filter((item) => !item.parent_id).sort(byTime)) {
    const replies = (repliesByParent.get(String(row.id)) ?? []).filter(visible).sort(byTime);
    if (visible(row)) {
      thread.push({ ...row, replies });
    } else if (replies.length) {
      const placeholder = row.deleted_at ? "deleted" : "hidden";
      thread.push({ id: row.id, created_at: row.created_at, placeholder, replies });
    }
  }
  return thread;
}

export function countThread(thread) {
  return (thread ?? []).reduce((sum, item) => sum + (item.placeholder ? 0 : 1) + (item.replies?.length ?? 0), 0);
}

// Who hears about a new comment. One notification per person, with the most
// specific reason: a reply beats a mention beats "commented on your list".
// Never the commenter, never across a block in either direction.
export function notificationTargets({ commenterId, targetOwnerId = null, parentAuthorId = null, mentionedIds = [], blockedPairs = [] }) {
  const me = String(commenterId);
  const blocked = new Set([...blockedPairs].map(String));
  const kinds = new Map();
  const add = (userId, kind) => {
    if (!userId) return;
    const id = String(userId);
    if (id === me || blocked.has(id) || kinds.has(id)) return;
    kinds.set(id, kind);
  };

  add(parentAuthorId, "reply");
  for (const id of mentionedIds) add(id, "mention");
  add(targetOwnerId, "comment");
  return [...kinds].map(([user_id, kind]) => ({ user_id, kind }));
}

export function commentExcerpt(body, limit = 140) {
  const text = String(body ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  const slice = text.slice(0, limit + 1);
  const cut = slice.lastIndexOf(" ");
  return `${slice.slice(0, cut > 40 ? cut : limit).trim()}...`;
}

export function notificationSentence({ kind, actor, label }) {
  const who = actor ? `@${actor}` : "Someone";
  if (kind === "reply") return `${who} replied to your comment on ${label}`;
  if (kind === "mention") return `${who} mentioned you on ${label}`;
  // A "comment" notification only goes to the list or review owner, so the
  // stored neutral label reads as theirs.
  if (kind === "comment") {
    const owned = String(label).replace(/^the list /, "your list ").replace(/^@[A-Za-z0-9_]+'s review /, "your review ");
    return `${who} commented on ${owned}`;
  }
  return `${who} on ${label}`;
}
