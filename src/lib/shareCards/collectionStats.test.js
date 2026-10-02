// Share card aggregation.
//
// Run: npm run test:share-cards

import test from "node:test";
import assert from "node:assert/strict";

import { collectionStats, percentages, shortPublisher, possessive } from "./collectionStats.js";

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
