import assert from "node:assert/strict";
import test from "node:test";
import { excludeScoreboardTestAccounts, formatDelta, isInReleaseWindow, weekStartUtc } from "./weeklyScoreboard.js";

test("formatDelta describes changes and the first week", () => {
  assert.equal(formatDelta(12, 10), "12 (+2)");
  assert.equal(formatDelta(8, 10), "8 (-2)");
  assert.equal(formatDelta(10, 10), "10 (no change)");
  assert.equal(formatDelta(10, null), "10 (first week)");
});

test("weekStartUtc returns Monday UTC", () => {
  assert.equal(weekStartUtc("2026-11-18T23:30:00-06:00").toISOString(), "2026-11-16T00:00:00.000Z");
  assert.equal(weekStartUtc("2026-11-16T12:00:00Z").toISOString(), "2026-11-16T00:00:00.000Z");
});

test("test accounts are excluded case-insensitively", () => {
  assert.deepEqual(excludeScoreboardTestAccounts([{ username: "real" }, { username: "TEST_TONY" }, { username: "test_tony_depaul" }]), [{ username: "real" }]);
});

test("release window includes days 7 through 21", () => {
  const runAt = new Date("2026-11-23T00:00:00Z");
  assert.equal(isInReleaseWindow("2026-11-16T00:00:00Z", runAt), true);
  assert.equal(isInReleaseWindow("2026-11-02T00:00:00Z", runAt), true);
  assert.equal(isInReleaseWindow("2026-11-17T00:00:00Z", runAt), false);
  assert.equal(isInReleaseWindow("2026-11-01T23:59:59Z", runAt), false);
});
