import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSearchCacheTerm, sliceSearchResults } from "./searchCache.js";
import { diversify } from "./searchVariety.js";

test("normalizes equivalent terms to one cache identity", () => {
  assert.equal(normalizeSearchCacheTerm("  BATMAN   Beyond "), "batman beyond");
});

test("slices only after the complete ranked result exists", () => {
  const ranked = ["exact", "second", "third", "fourth"];
  assert.deepEqual(sliceSearchResults(ranked, { limit: 2 }), ["exact", "second"]);
  assert.deepEqual(sliceSearchResults(ranked, { limit: 2, offset: 2 }), ["third", "fourth"]);
  assert.deepEqual(ranked, ["exact", "second", "third", "fourth"]);
});

test("clamps invalid pagination without changing order", () => {
  assert.deepEqual(sliceSearchResults([1, 2, 3], { limit: 2.9, offset: -4 }), [1, 2]);
  assert.deepEqual(sliceSearchResults(null, { limit: 2 }), []);
});

test("cache-wide diversification preserves the old smaller-page output", () => {
  const ranked = [
    { id: "batman-1", title: "Batman" },
    { id: "batman-2", title: "Batman" },
    { id: "batman-3", title: "Batman" },
    { id: "detective", title: "Detective Comics" },
    { id: "legends", title: "Legends of the Dark Knight" },
    { id: "shadow", title: "Batman: Shadow of the Bat" },
  ];
  const before = diversify(ranked, { limit: 4, perTitle: 2 });
  const cachedFullRanking = [...ranked];
  assert.deepEqual(diversify(cachedFullRanking, { limit: 4, perTitle: 2 }), before);
});
