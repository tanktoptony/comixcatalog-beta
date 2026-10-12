import test from "node:test";
import assert from "node:assert/strict";
import {
  attributionWriteOncePatch,
  cohortPercent,
  excludeTestAccounts,
  newlyReachedMilestones,
} from "./traction.js";

test("cohort percentages use the cohort signup count", () => {
  assert.equal(cohortPercent(2, 3), 66.7);
  assert.equal(cohortPercent(0, 0), 0);
});

test("shared test accounts are excluded", () => {
  assert.deepEqual(excludeTestAccounts([
    { username: "real_collector" }, { username: "test_tony" },
    { username: "TEST_TONY_DEPAUL" },
  ]), [{ username: "real_collector" }]);
});

test("attribution only fills null fields", () => {
  assert.deepEqual(attributionWriteOncePatch(
    { source: "instagram", medium: null },
    { source: "newsletter", medium: "email", campaign: null },
  ), {});
  assert.deepEqual(attributionWriteOncePatch({}, { source: "newsletter", medium: "email" }), {
    source: "newsletter", medium: "email",
  });
});

test("milestones are claimed once even after later calls", () => {
  const first = newlyReachedMilestones({}, 25);
  assert.deepEqual(first.claimed, ["first_comic_added", "collection_25"]);
  assert.deepEqual(newlyReachedMilestones(first.next, 30).claimed, []);
});
