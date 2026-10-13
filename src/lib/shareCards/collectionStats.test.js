// Share card aggregation.
//
// Run: npm run test:share-cards

import test from "node:test";
import assert from "node:assert/strict";

import { collectionStats, percentages, shortPublisher, possessive, rankCollectionHighlights } from "./collectionStats.js";

const owned = (seriesKey, publisher) => ({ status: "owned", seriesKey, publisher });
const wanted = (seriesKey, publisher) => ({ status: "wishlist", seriesKey, publisher });

test("counts owned books and distinct series, and keeps wantlist separate", () => {
  const s = collectionStats([
    owned(1, "Marvel Comics"),
    owned(1, "Marvel Comics"),
    owned(2, "DC Comics"),
    wanted(3, "Image Comics"),
  ]);
  assert.equal(s.owned, 3);
  assert.equal(s.series, 2);
  assert.equal(s.wanted, 1);
});

test("wantlist books never count toward the publisher split", () => {
  const s = collectionStats([owned(1, "Marvel Comics"), wanted(2, "DC Comics"), wanted(3, "DC Comics")]);
  assert.deepEqual(s.publishers, [{ name: "Marvel", count: 1, pct: 100 }]);
});

test("top three publishers, the rest and the unknowns folded into Other", () => {
  const rows = [
    ...Array(5).fill(owned(1, "Marvel Comics")),
    ...Array(3).fill(owned(2, "DC Comics")),
    ...Array(2).fill(owned(3, "Image Comics")),
    owned(4, "Dark Horse Comics"),
    owned(5, null),
  ];
  const s = collectionStats(rows);
  assert.deepEqual(
    s.publishers.map((p) => [p.name, p.count]),
    [["Marvel", 5], ["DC", 3], ["Image", 2], ["Other", 2]]
  );
});

test("percentages always add to exactly 100", () => {
  assert.deepEqual(percentages([1, 1, 1]), [34, 33, 33]);
  assert.equal(percentages([5, 3, 2, 2]).reduce((a, b) => a + b, 0), 100);
  assert.equal(percentages([327, 41, 13, 7]).reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(percentages([0, 0]), [0, 0]);
});

test("empty collection is all zeros, not a crash", () => {
  assert.deepEqual(collectionStats([]), { owned: 0, wanted: 0, series: 0, publishers: [] });
});

test("publisher names are shortened for the card", () => {
  assert.equal(shortPublisher("Marvel Comics"), "Marvel");
  assert.equal(shortPublisher("IDW Publishing"), "IDW");
  assert.equal(shortPublisher("BOOM! Studios"), "BOOM!");
  assert.equal(shortPublisher("Dynamite Entertainment"), "Dynamite");
  assert.equal(shortPublisher("Vertigo"), "Vertigo");
  assert.equal(shortPublisher(""), "Other");
  assert.ok(shortPublisher("A Publisher With A Very Long Name").length <= 14);
});

test("possessive title", () => {
  assert.equal(possessive("tony"), "TONY'S");
  assert.equal(possessive("chris"), "CHRIS'");
  assert.equal(possessive(""), "MY");
});

test("books listed for sale still count as owned (whole collection listed)", () => {
  const listed = (seriesKey, publisher) => ({ status: "for_sale", seriesKey, publisher });
  const s = collectionStats([listed("a", "Marvel Comics"), listed("b", "Image Comics"), { status: "wishlist", seriesKey: "c" }]);
  assert.equal(s.owned, 2);
  assert.equal(s.series, 2);
});

let nextHighlightId = 1;
const highlight = (overrides = {}) => ({
  id: overrides.id ?? `copy-${nextHighlightId++}`,
  status: "owned",
  gcd_issue_id: overrides.gcd_issue_id ?? nextHighlightId,
  created_at: "2026-01-01T00:00:00Z",
  slab_company: null,
  keyIssue: null,
  valueResult: null,
  ...overrides,
});

test("tier 1 key ranks ahead of a $40 comp-backed book", () => {
  const ranked = rankCollectionHighlights([
    highlight({ id: "value", gcd_issue_id: 1, valueResult: { value: 40, sample_size: 3, source: "market-comp" } }),
    highlight({ id: "key", gcd_issue_id: 2, keyIssue: { tier: 1, reason: "First appearance" } }),
  ]);
  assert.deepEqual(ranked.map((copy) => copy.id), ["key", "value"]);
});

test("a $1,400 book ranks ahead of a tier 2 key", () => {
  const ranked = rankCollectionHighlights([
    highlight({ id: "key", gcd_issue_id: 1, keyIssue: { tier: 2 } }),
    highlight({ id: "value", gcd_issue_id: 2, valueResult: { value: 1400, sample_size: 3, source: "market-comp" } }),
  ]);
  assert.deepEqual(ranked.map((copy) => copy.id), ["value", "key"]);
});

test("a slab without value data is remarkable", () => {
  const [copy] = rankCollectionHighlights([highlight({ id: "slab", slab_company: "CGC" })]);
  assert.equal(copy.id, "slab");
  assert.equal(copy.remarkable, true);
});

test("cover-price fallback is not remarkable and equal scores use newest copy", () => {
  const ranked = rankCollectionHighlights([
    highlight({ id: "fallback", gcd_issue_id: 1, valueResult: { value: 50, sample_size: 0, source: "cover-price", fallback: true } }),
    highlight({ id: "old", gcd_issue_id: 2, slab_company: "CGC", created_at: "2025-01-01" }),
    highlight({ id: "new", gcd_issue_id: 3, slab_company: "CBCS", created_at: "2026-01-01" }),
  ]);
  assert.deepEqual(ranked.map((copy) => copy.id), ["new", "old"]);
});

test("duplicate issues use the strongest copy signals", () => {
  const ranked = rankCollectionHighlights([
    highlight({ id: "plain", gcd_issue_id: 7, created_at: "2026-03-01" }),
    highlight({ id: "slab", gcd_issue_id: 7, slab_company: "CGC", created_at: "2025-01-01" }),
  ]);
  assert.deepEqual(ranked.map((copy) => copy.id), ["slab"]);
});
