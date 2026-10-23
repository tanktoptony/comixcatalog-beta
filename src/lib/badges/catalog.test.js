import test from "node:test";
import assert from "node:assert/strict";
import { BADGE_CATALOG } from "./catalog.js";

const earnedFixtures = {
  ownedCount: 2500,
  keyCount: 10,
  majorKeyCount: 1,
  silverKeyCount: 1,
  eraCounts: { golden: 1, silver: 1, bronze: 1, copper: 1, modern: 1 },
  publisherCounts: { marvel: 50, dc: 50, image: 25 },
  indiePublisherCount: 5,
  completedRunCount: 10,
  longRunCount: 1,
  slabbedCount: 10,
  nineEightCount: 1,
  followingCount: 1,
  recruitCount: 1,
  wantlistCount: 5,
  matchedScanCount: 25,
  isFoundingCollector: true,
};

for (const badge of BADGE_CATALOG) {
  test(`${badge.id} test reports earned and locked fixtures`, () => {
    assert.equal(badge.test(earnedFixtures).earned, true);
    assert.equal(badge.test({}).earned, false);
  });
}
