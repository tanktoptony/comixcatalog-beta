import { test } from "node:test";
import assert from "node:assert/strict";
import { chicagoDayIndex } from "./dailySeed.js";

test("changes at Chicago midnight, not UTC midnight", () => {
  // 2026-10-24 23:30 CDT is already 10-25 in UTC.
  const lateEvening = chicagoDayIndex(new Date("2026-10-25T04:30:00Z"));
  const morning = chicagoDayIndex(new Date("2026-10-24T13:00:00Z"));
  const nextDay = chicagoDayIndex(new Date("2026-10-25T05:30:00Z"));
  assert.equal(lateEvening, morning);
  assert.equal(nextDay, morning + 1);
});
