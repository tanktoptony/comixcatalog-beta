import test from "node:test";
import assert from "node:assert/strict";
import { afterOrderTransition } from "./orderEvents.js";

function fakeDb({ claimed = true, insertError = null } = {}) {
  const calls = [];
  return {
    calls,
    from: () => ({ insert: async (value) => { calls.push(["message", value]); return { error: insertError }; } }),
    rpc: async () => ({ data: claimed, error: null }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "collector@example.com" } }, error: null }) } },
  };
}

const order = { id: "o", buyer_id: "b", seller_id: "s", series_title: "Saga", paid_at: "2026-10-14T00:00:00Z" };

test("an event posts a system message and sends only after a successful claim", async () => {
  const db = fakeDb();
  const sent = [];
  await afterOrderTransition(db, order, "paid", { send: async (messages) => sent.push(...messages) });
  assert.equal(db.calls.filter(([kind]) => kind === "message").length, 1);
  assert.equal(sent.length, 2);
  const replay = fakeDb({ claimed: false });
  const replaySent = [];
  await afterOrderTransition(replay, order, "paid", { send: async (messages) => replaySent.push(...messages) });
  assert.equal(replaySent.length, 0);
});

test("message and email failures never escape transition processing", async () => {
  const db = fakeDb({ insertError: new Error("no message") });
  await assert.doesNotReject(() => afterOrderTransition(db, order, "paid", { send: async () => { throw new Error("no email"); } }));
});
