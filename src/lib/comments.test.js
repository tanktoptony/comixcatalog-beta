import test from "node:test";
import assert from "node:assert/strict";
import {
  buildThread,
  canEditComment,
  commentExcerpt,
  countThread,
  extractMentions,
  notificationSentence,
  notificationTargets,
  renderSegments,
  validateCommentEdit,
  validateCommentInput,
} from "./comments.js";

const LIST = "6f1c1e8e-3a52-4c55-9d0e-2f3a4b5c6d7e";

test("validateCommentInput accepts issue, list and review targets", () => {
  assert.deepEqual(validateCommentInput({ target_type: "issue", target_id: "48391", body: "  Great book  " }).value,
    { targetType: "issue", targetId: "48391", parentId: null, body: "Great book" });
  assert.equal(validateCommentInput({ target_type: "list", target_id: LIST.toUpperCase(), body: "x" }).value.targetId, LIST);
  assert.equal(validateCommentInput({ target_type: "review", target_id: LIST, body: "x", parent_id: LIST }).value.parentId, LIST);
});

test("validateCommentInput rejects bad input", () => {
  assert.ok(validateCommentInput({ target_type: "post", target_id: "1", body: "x" }).error);
  assert.ok(validateCommentInput({ target_type: "issue", target_id: "0", body: "x" }).error);
  assert.ok(validateCommentInput({ target_type: "issue", target_id: "12a", body: "x" }).error);
  assert.ok(validateCommentInput({ target_type: "list", target_id: "48391", body: "x" }).error);
  assert.ok(validateCommentInput({ target_type: "issue", target_id: "1", body: "   \n\n " }).error);
  assert.ok(validateCommentInput({ target_type: "issue", target_id: "1", body: "x", parent_id: "nope" }).error);
  assert.match(validateCommentInput({ target_type: "issue", target_id: "1", body: "a".repeat(2001) }).error, /2,000/);
  assert.equal(validateCommentInput({ target_type: "issue", target_id: "1", body: "a".repeat(2000) }).value.body.length, 2000);
});

test("bodies keep at most one blank line", () => {
  assert.equal(validateCommentInput({ target_type: "issue", target_id: "1", body: "a\r\n\r\n\r\n\r\nb" }).value.body, "a\n\nb");
  assert.equal(validateCommentEdit({ body: " fixed " }).value.body, "fixed");
  assert.ok(validateCommentEdit({ body: "" }).error);
});

test("extractMentions finds usernames, skips emails, dedupes, caps at five", () => {
  assert.deepEqual(extractMentions("Hey @Tanktop__ and @ana_b, mail me at a@b.com"), ["tanktop__", "ana_b"]);
  assert.deepEqual(extractMentions("@ab too short, @abc ok, (@xyz) ok"), ["abc", "xyz"]);
  assert.deepEqual(extractMentions("@one1 @two2 @three @four @five @six6"), ["one1", "two2", "three", "four", "five"]);
  assert.deepEqual(extractMentions("@same @SAME"), ["same"]);
});

test("renderSegments links only known usernames", () => {
  assert.deepEqual(renderSegments("Ask @ana_b or @ghost about it", ["ANA_B"]), [
    { type: "text", text: "Ask " },
    { type: "mention", username: "ana_b" },
    { type: "text", text: " or @ghost about it" },
  ]);
  assert.deepEqual(renderSegments("plain", []), [{ type: "text", text: "plain" }]);
  assert.deepEqual(renderSegments("@ana_b", ["ana_b"]), [{ type: "mention", username: "ana_b" }]);
});

test("canEditComment allows the author within 15 minutes only", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  const comment = { user_id: "u1", created_at: "2026-11-21T11:50:00Z" };
  assert.equal(canEditComment(comment, "u1", now), true);
  assert.equal(canEditComment(comment, "u2", now), false);
  assert.equal(canEditComment({ ...comment, created_at: "2026-11-21T11:40:00Z" }, "u1", now), false);
  assert.equal(canEditComment({ ...comment, deleted_at: "2026-11-21T11:55:00Z" }, "u1", now), false);
});

test("buildThread nests replies, drops blocked and deleted, keeps placeholders", () => {
  const rows = [
    { id: "c3", user_id: "u3", parent_id: null, created_at: "2026-11-21T03:00:00Z" },
    { id: "c1", user_id: "u1", parent_id: null, created_at: "2026-11-21T01:00:00Z" },
    { id: "r2", user_id: "u2", parent_id: "c1", created_at: "2026-11-21T02:30:00Z" },
    { id: "r1", user_id: "u2", parent_id: "c1", created_at: "2026-11-21T02:00:00Z" },
    { id: "rb", user_id: "bad", parent_id: "c1", created_at: "2026-11-21T02:10:00Z" },
    { id: "c2", user_id: "bad", parent_id: null, created_at: "2026-11-21T01:30:00Z" },
    { id: "rc2", user_id: "u1", parent_id: "c2", created_at: "2026-11-21T01:40:00Z" },
    { id: "c4", user_id: "u1", parent_id: null, created_at: "2026-11-21T04:00:00Z", deleted_at: "2026-11-21T04:05:00Z" },
    { id: "c5", user_id: "u1", parent_id: null, created_at: "2026-11-21T05:00:00Z", deleted_at: "2026-11-21T05:05:00Z" },
    { id: "rc5", user_id: "u3", parent_id: "c5", created_at: "2026-11-21T05:01:00Z" },
  ];
  const thread = buildThread(rows, { blockedIds: ["bad"] });
  assert.deepEqual(thread.map((item) => item.id), ["c1", "c2", "c3", "c5"]);
  assert.deepEqual(thread[0].replies.map((item) => item.id), ["r1", "r2"]);
  assert.equal(thread[1].placeholder, "hidden");
  assert.equal(thread[3].placeholder, "deleted");
  assert.equal(countThread(thread), 6);
});

test("notificationTargets picks one reason per person and respects blocks", () => {
  assert.deepEqual(notificationTargets({
    commenterId: "me", targetOwnerId: "owner", parentAuthorId: "parent", mentionedIds: ["parent", "friend", "me", "blocked"], blockedPairs: ["blocked"],
  }), [
    { user_id: "parent", kind: "reply" },
    { user_id: "friend", kind: "mention" },
    { user_id: "owner", kind: "comment" },
  ]);
  assert.deepEqual(notificationTargets({ commenterId: "owner", targetOwnerId: "owner" }), []);
  assert.deepEqual(notificationTargets({ commenterId: "me", targetOwnerId: "owner", mentionedIds: ["owner"] }), [{ user_id: "owner", kind: "mention" }]);
});

test("commentExcerpt and notificationSentence", () => {
  assert.equal(commentExcerpt("short  text"), "short text");
  const long = commentExcerpt("word ".repeat(60));
  assert.ok(long.endsWith("...") && long.length <= 144);
  assert.equal(notificationSentence({ kind: "reply", actor: "ana", label: "Saga #1 (2012)" }), "@ana replied to your comment on Saga #1 (2012)");
  assert.equal(notificationSentence({ kind: "comment", actor: "ana", label: 'the list "Bronze Age horror"' }), '@ana commented on your list "Bronze Age horror"');
  assert.equal(notificationSentence({ kind: "comment", actor: "ana", label: "@bo_b's review of Saga #1 (2012)" }), "@ana commented on your review of Saga #1 (2012)");
  assert.equal(notificationSentence({ kind: "mention", actor: "ana", label: 'the list "Bronze Age horror"' }), '@ana mentioned you on the list "Bronze Age horror"');
});
