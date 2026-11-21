import test from "node:test";
import assert from "node:assert/strict";
import { badgeRarity, isRare, rarityLabel } from "./rarity.js";

test("badgeRarity takes test accounts' badges back out", () => {
  const rarity = badgeRarity({
    viewCounts: [{ badge_id: "first-issue", earned_count: "24" }, { badge_id: "scanner", earned_count: 1 }],
    testRows: [{ badge_id: "first-issue" }, { badge_id: "scanner" }, { badge_id: "unknown" }],
    memberCount: 49,
  });
  assert.deepEqual(rarity, { total: 49, counts: { "first-issue": 23, scanner: 0 } });
});

test("rarity labels read like Steam's", () => {
  assert.equal(rarityLabel(23, 49), "47% of collectors");
  assert.equal(rarityLabel(1, 200), "<1% of collectors");
  assert.equal(rarityLabel(0, 49), "No collector has this yet");
  assert.equal(rarityLabel(3, 0), null);
});

test("rare means held by someone, under 10%", () => {
  assert.equal(isRare(4, 49), true);
  assert.equal(isRare(5, 49), false);
  assert.equal(isRare(0, 49), false);
});
