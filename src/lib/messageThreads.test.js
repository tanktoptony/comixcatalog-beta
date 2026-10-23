import assert from "node:assert/strict";
import test from "node:test";
import { messageDateLabel, shouldStartMessageGroup, summarizeThreads } from "./messageThreads.js";

test("thread summaries keep the latest message and unread count", () => {
  const rows = [
    { id: "1", sender_id: "a", recipient_id: "me", created_at: "2026-01-01T10:00:00Z", read_at: null },
    { id: "2", sender_id: "me", recipient_id: "a", created_at: "2026-01-01T11:00:00Z", read_at: null },
  ];
  const [thread] = summarizeThreads(rows, "me");
  assert.equal(thread.lastMessage.id, "2");
  assert.equal(thread.unread, 1);
});

test("date labels and groups respect calendar days", () => {
  const now = new Date("2026-10-23T12:00:00");
  assert.equal(messageDateLabel("2026-10-23T08:00:00", now), "Today");
  assert.equal(messageDateLabel("2026-10-22T08:00:00", now), "Yesterday");
  assert.equal(shouldStartMessageGroup(
    { sender_id: "a", created_at: "2026-10-23T00:01:00" },
    { sender_id: "a", created_at: "2026-10-22T23:59:00" }
  ), true);
});
