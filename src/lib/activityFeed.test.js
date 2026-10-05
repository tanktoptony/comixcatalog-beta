import { test } from "node:test";
import assert from "node:assert/strict";
import { filterVisibleActivity, isVisibleActivity, ACTIVITY_VERB } from "./activityFeed.js";

const pub = { id: "u1", username: "pub", is_public: true };

test("a public profile's owned row shows as 'added'", () => {
  const out = filterVisibleActivity([{ user_id: "u1", status: "owned" }], { u1: pub });
  assert.equal(out.length, 1);
  assert.equal(out[0].verb, "added");
});

test("for_sale is labelled 'listed', not 'wishlisted'", () => {
  const out = filterVisibleActivity([{ user_id: "u1", status: "for_sale" }], { u1: pub });
  assert.equal(out[0].verb, "listed");
});

test("a private profile never appears", () => {
  const priv = { ...pub, is_public: false };
  assert.equal(filterVisibleActivity([{ user_id: "u1", status: "owned" }], { u1: priv }).length, 0);
});

test("show_collection=false hides every row from that user", () => {
  const p = { ...pub, show_collection: false };
  const rows = [
    { user_id: "u1", status: "owned" },
    { user_id: "u1", status: "wishlist" },
  ];
  assert.equal(filterVisibleActivity(rows, { u1: p }).length, 0);
});

test("show_wantlist=false hides wishlist rows but keeps owned ones", () => {
  const p = { ...pub, show_wantlist: false };
  const rows = [
    { user_id: "u1", status: "wishlist" },
    { user_id: "u1", status: "owned" },
  ];
  const out = filterVisibleActivity(rows, { u1: p });
  assert.deepEqual(out.map((r) => r.status), ["owned"]);
});

test("show_for_sale=false hides for_sale rows", () => {
  const p = { ...pub, show_for_sale: false };
  assert.equal(filterVisibleActivity([{ user_id: "u1", status: "for_sale" }], { u1: p }).length, 0);
});

test("a profile with no username, or no profile at all, is dropped", () => {
  const rows = [
    { user_id: "u1", status: "owned" },
    { user_id: "u2", status: "owned" },
  ];
  assert.equal(filterVisibleActivity(rows, { u1: { ...pub, username: null } }).length, 0);
});

test("null show_* flags count as shown", () => {
  const p = { ...pub, show_collection: null, show_wantlist: null };
  assert.equal(isVisibleActivity({ status: "wishlist" }, p), true);
});

test("is_public null or missing counts as private", () => {
  assert.equal(isVisibleActivity({ status: "owned" }, { ...pub, is_public: null }), false);
  const { is_public: _omit, ...noFlag } = pub;
  assert.equal(isVisibleActivity({ status: "owned" }, noFlag), false);
});

test("unknown statuses are dropped", () => {
  assert.equal(filterVisibleActivity([{ user_id: "u1", status: "trade" }], { u1: pub }).length, 0);
});

test("stops at the limit, keeping newest-first order", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ user_id: "u1", status: "owned", n: i }));
  const out = filterVisibleActivity(rows, new Map([["u1", pub]]), 20);
  assert.equal(out.length, 20);
  assert.equal(out[0].n, 0);
});

test("every status has a verb", () => {
  assert.deepEqual(Object.keys(ACTIVITY_VERB).sort(), ["for_sale", "owned", "wishlist"]);
});
