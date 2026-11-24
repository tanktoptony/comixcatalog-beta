import test from "node:test";
import assert from "node:assert/strict";
import { validateMessageContext } from "./messageContext.js";

function fakeSupabase({ collections = {}, issues = [] } = {}) {
  return { from(table) { let value; return {
    select() { return this; }, eq(column, requested) {
      value = table === "user_collections" ? collections[requested] ?? null : issues.includes(requested) ? { gcd_id: requested } : null;
      return this;
    }, maybeSingle() { return Promise.resolve({ data: value, error: null }); },
  }; } };
}

const sender = "11111111-1111-4111-8111-111111111111";
const recipient = "22222222-2222-4222-8222-222222222222";
const copy = "33333333-3333-4333-8333-333333333333";

test("missing context passes", async () => {
  assert.deepEqual(await validateMessageContext(fakeSupabase(), undefined, sender, recipient), { gcd_issue_id: null, collection_id: null });
});
test("valid issue passes", async () => {
  assert.deepEqual(await validateMessageContext(fakeSupabase({ issues: [7] }), { gcd_issue_id: 7 }, sender, recipient), { gcd_issue_id: 7, collection_id: null });
});
test("invalid ids are rejected", async () => {
  for (const about of [{ gcd_issue_id: 0 }, { gcd_issue_id: 1.5 }, { collection_id: "nope" }, {}]) {
    assert.equal(await validateMessageContext(fakeSupabase(), about, sender, recipient), null);
  }
});
test("collection belonging to neither party is rejected", async () => {
  const supabase = fakeSupabase({ collections: { [copy]: { user_id: "44444444-4444-4444-8444-444444444444", gcd_issue_id: 7 } }, issues: [7] });
  assert.equal(await validateMessageContext(supabase, { collection_id: copy }, sender, recipient), null);
});
test("collection fills the issue id", async () => {
  const supabase = fakeSupabase({ collections: { [copy]: { user_id: recipient, gcd_issue_id: 7 } }, issues: [7] });
  assert.deepEqual(await validateMessageContext(supabase, { collection_id: copy }, sender, recipient), { gcd_issue_id: 7, collection_id: copy });
});
