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
  zeroIssueCount: 1,
  halfIssueCount: 1,
  centennialCount: 1,
  oneMillionCount: 1,
  uniqueBookCount: 1,
  duplicateIssueCount: 1,
  busiestDayAdds: 50,
  seriesSpanYears: 40,
};

for (const badge of BADGE_CATALOG) {
  test(`${badge.id} test reports earned and locked fixtures`, () => {
    assert.equal(badge.test(earnedFixtures).earned, true);
    assert.equal(badge.test({}).earned, false);
  });
}

test("a locked secret badge shows only the placeholder", async () => {
  const { badgeForDisplay, SECRET_PLACEHOLDER, SECRET_BADGE_COUNT } = await import("./catalog.js");
  const secrets = BADGE_CATALOG.filter((badge) => badge.secret);
  assert.equal(secrets.length, SECRET_BADGE_COUNT);
  for (const badge of secrets) {
    const locked = badgeForDisplay(badge, { earned: false });
    assert.equal(locked.name, SECRET_PLACEHOLDER.name);
    assert.equal(locked.mark, "?");
    assert.ok(!JSON.stringify(locked).includes(badge.name), `${badge.id} leaks its name`);
    assert.equal(locked.test, undefined);
    assert.equal(badgeForDisplay(badge, { earned: true }).name, badge.name);
  }
});
