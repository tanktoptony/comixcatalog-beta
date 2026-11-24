import test from "node:test";
import assert from "node:assert/strict";
import { buildIssueCollectors } from "./issueCollectors.js";

const profile = (id, extra = {}) => ({ id, username: `user${id}`, is_public: true, ...extra });
const row = (user_id, status) => ({ user_id, status });

test("applies bucket privacy and profile exclusions", () => {
  const profiles = new Map([
    ["1", profile("1", { show_collection: false })],
    ["2", profile("2", { show_wantlist: false })],
    ["3", profile("3", { show_for_sale: false })],
    ["4", profile("4", { is_public: false })],
    ["5", profile("5", { username: null })],
    ["6", profile("6", { username: "test_tony" })],
    ["7", profile("7")],
  ]);
  const result = buildIssueCollectors([
    row("1", "owned"), row("1", "wishlist"), row("2", "wishlist"), row("2", "owned"),
    row("3", "for_sale"), row("4", "owned"), row("5", "owned"), row("6", "owned"), row("7", "for_sale"),
  ], profiles);
  assert.deepEqual(result.have.members.map((p) => p.id), ["2"]);
  assert.deepEqual(result.want.members.map((p) => p.id), ["1"]);
  assert.deepEqual(result.sell.members.map((p) => p.id), ["7"]);
});
test("deduplicates members, preserves totals, and caps at 12", () => {
  const profiles = new Map(Array.from({ length: 14 }, (_, i) => [String(i), profile(String(i))]));
  const rows = [row("0", "owned"), row("0", "owned"), ...Array.from({ length: 13 }, (_, i) => row(String(i + 1), "owned"))];
  const result = buildIssueCollectors(rows, profiles);
  assert.equal(result.have.total, 14);
  assert.equal(result.have.members.length, 12);
});
