import assert from "node:assert/strict";
import test from "node:test";
import { changeWindowStart, marketPicks, marketStats, sellerSummary, valueChange, wantlistCards } from "./shelfHunt.js";

test("valueChange ignores snapshots from before the PriceCharting switch", () => {
  assert.equal(valueChange({ total: 1667.56, snapshot_date: "2026-11-27" }, { total_value: 1527.66, snapshot_date: "2026-11-19" }), null);
  assert.deepEqual(valueChange({ total: 1700, snapshot_date: "2026-11-27" }, { total_value: 1667.56, snapshot_date: "2026-11-20" }), { amount: 32.44, since: "2026-11-20" });
  assert.equal(valueChange({ total: 1700, snapshot_date: "2026-11-20" }, { total_value: 1667.56, snapshot_date: "2026-11-20" }), null);
  assert.equal(valueChange({ total: 1700, snapshot_date: "2026-11-20" }, null), null);
});

test("changeWindowStart never reaches before the switch", () => {
  assert.equal(changeWindowStart(new Date("2026-11-22T12:00:00Z")), "2026-11-20");
  assert.equal(changeWindowStart(new Date("2026-12-10T12:00:00Z")), "2026-12-03");
});

const L = (id, extra = {}) => ({ id, sellerId: "s1", cover: "c.jpg", price: null, guide: null, key: null, buyNow: false, listingHref: `/listing/${id}`, ...extra });

test("marketPicks leaves out the viewer's own and coverless listings, Buy now first", () => {
  const picks = marketPicks([
    L("own", { sellerId: "me", buyNow: true }),
    L("nocover", { cover: null, buyNow: true }),
    L("key", { key: { reason: "1st" }, guide: { value: 90 } }),
    L("buy", { buyNow: true, price: 5, guide: { value: 4 } }),
    L("plain", { guide: { value: 200 } }),
  ], "me");
  assert.deepEqual(picks.map((l) => l.id), ["buy", "key", "plain"]);
});

test("sellerSummary counts only the viewer's listings", () => {
  const listings = [L("a", { sellerId: "me", price: 5, buyNow: true }), L("b", { sellerId: "me", price: 6 }), L("c", { sellerId: "me" }), L("d", { price: 9, buyNow: true })];
  assert.deepEqual(sellerSummary(listings, "me"), { listed: 3, priced: 2, ready: 1 });
  assert.deepEqual(sellerSummary(listings, null), { listed: 0, priced: 0, ready: 0 });
});

test("marketStats counts other sellers only", () => {
  const stats = marketStats([L("a", { sellerId: "me", key: {} }), L("b", { key: {} }), L("c", { sellerId: "s2", price: 5, guide: { value: 10 } })], "me");
  assert.deepEqual(stats, { listed: 2, sellers: 2, keys: 1, underGuide: 1 });
});

test("wantlistCards puts copies for sale first and shows the cheapest priced copy", () => {
  const wanted = [
    { gcd_issue_id: 1, base_gcd_issue_id: 1, guide: { value: 50 } },
    { gcd_issue_id: 2, base_gcd_issue_id: 20, guide: { value: 5 } },
    { gcd_issue_id: 3, base_gcd_issue_id: 3, guide: null },
  ];
  const listings = new Map([[20, [L("x"), L("y", { price: 9 }), L("z", { price: 7 })]]]);
  const out = wantlistCards(wanted, listings);
  assert.equal(out.count, 3);
  assert.equal(out.listed, 1);
  assert.equal(out.priced, 2);
  assert.equal(out.guide_total, 55);
  assert.deepEqual(out.items.map((c) => c.gcd_issue_id), [2, 1, 3]);
  assert.deepEqual(out.items[0].listing, { id: "z", price: 7, href: "/listing/z" });
  assert.equal(out.items[0].for_sale, 3);
});
