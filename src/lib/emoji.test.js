import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMOJI, QUICK_REACTIONS, emojiForShortcode, groupReactions, isKnownEmoji, replaceShortcodes,
  searchEmoji, shortcodeFor, shortcodeQueryAt, toggleReactionRows,
} from "./emoji.js";

test("every glyph is unique and every quick reaction is in the set", () => {
  const glyphs = EMOJI.map((e) => e.emoji);
  assert.equal(new Set(glyphs).size, glyphs.length);
  for (const q of QUICK_REACTIONS) assert.ok(isKnownEmoji(q), q);
});

test("shortcodes and aliases resolve, unknown ones don't", () => {
  assert.equal(emojiForShortcode("fire"), "🔥");
  assert.equal(emojiForShortcode("+1"), "👍");
  assert.equal(emojiForShortcode("THUMBSUP"), "👍");
  assert.equal(emojiForShortcode("grail"), "🏆");
  assert.equal(emojiForShortcode("nope_not_real"), null);
  assert.equal(shortcodeFor("🔥"), "fire");
});

test("replaceShortcodes converts known codes and leaves times and unknowns alone", () => {
  assert.equal(replaceShortcodes("nice pickup :fire: :+1:"), "nice pickup 🔥 👍");
  assert.equal(replaceShortcodes("meet at 10:30:00"), "meet at 10:30:00");
  assert.equal(replaceShortcodes(":notathing: ok"), ":notathing: ok");
  assert.equal(replaceShortcodes(""), "");
});

test("shortcodeQueryAt finds the code being typed, not times or URLs", () => {
  assert.deepEqual(shortcodeQueryAt("love it :fi", 11), { query: "fi", start: 8, end: 11 });
  assert.deepEqual(shortcodeQueryAt(":+1", 3), { query: "+1", start: 0, end: 3 });
  assert.equal(shortcodeQueryAt("at 10:3", 7), null);
  assert.equal(shortcodeQueryAt("see https://x", 13), null);
  assert.equal(shortcodeQueryAt("one :f", 6), null, "needs two characters");
  // Caret in the middle: only text before it counts.
  assert.deepEqual(shortcodeQueryAt(":hea and more", 4), { query: "hea", start: 0, end: 4 });
});

test("searchEmoji ranks main-name prefixes, then aliases, then shorter names", () => {
  // Live check on 11-23 offered crossed_fingers first for ":fi".
  assert.deepEqual(searchEmoji("fi", 3).map((e) => e.emoji), ["🔥", "🥇", "🤞"]);
  const results = searchEmoji("hea").map((e) => e.emoji);
  assert.equal(results[0], "❤️", "heart is the shortest main name starting with hea");
  assert.ok(results.includes("😍"));
  assert.ok(searchEmoji("eyes").some((e) => e.emoji === "😍"), "inside match");
  assert.deepEqual(searchEmoji(""), []);
});

test("groupReactions counts each member once per emoji, in first-use order", () => {
  const rows = [
    { message_id: "m", user_id: "b", emoji: "🔥", created_at: "2026-11-23T10:00:02Z" },
    { message_id: "m", user_id: "a", emoji: "👍", created_at: "2026-11-23T10:00:01Z" },
    { message_id: "m", user_id: "a", emoji: "🔥", created_at: "2026-11-23T10:00:03Z" },
    { message_id: "m", user_id: "a", emoji: "🔥", created_at: "2026-11-23T10:00:04Z" },
    { message_id: "m", user_id: "a", emoji: "not-an-emoji", created_at: "2026-11-23T10:00:05Z" },
  ];
  assert.deepEqual(groupReactions(rows, "a").map(({ emoji, count, mine }) => [emoji, count, mine]), [
    ["👍", 1, true],
    ["🔥", 2, true],
  ]);
  assert.deepEqual(groupReactions(rows, "c").map((c) => c.mine), [false, false]);
});

test("toggleReactionRows adds then removes the same reaction", () => {
  const added = toggleReactionRows([], { messageId: "m", userId: "a", emoji: "🔥", now: "t" });
  assert.equal(added.length, 1);
  assert.deepEqual(toggleReactionRows(added, { messageId: "m", userId: "a", emoji: "🔥" }), []);
  const other = toggleReactionRows(added, { messageId: "m", userId: "b", emoji: "🔥", now: "t" });
  assert.equal(other.length, 2);
});
