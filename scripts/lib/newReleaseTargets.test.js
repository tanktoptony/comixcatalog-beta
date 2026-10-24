import assert from "node:assert/strict";
import test from "node:test";

import {
  PRIORITY,
  applyRetryThrottle,
  classifyKeyDate,
  doneKey,
  isUsSeries,
  mergeTargets,
  pickVolumeId,
  releaseWindow,
} from "./newReleaseTargets.js";

const TODAY = new Date("2026-10-24T19:00:00Z");

test("window covers the last four weeks and three cover months", () => {
  assert.deepEqual(releaseWindow(TODAY), {
    since: "2026-09-26",
    through: "2026-10-24",
    monthKeys: ["2026-10-00", "2026-11-00", "2026-12-00"],
  });
  assert.deepEqual(releaseWindow(new Date("2026-12-15T00:00:00Z")).monthKeys, ["2026-12-00", "2027-01-00", "2027-02-00"]);
});

test("key dates classify as dated, month-only, or out of window", () => {
  const window = releaseWindow(TODAY);
  assert.equal(classifyKeyDate("2026-10-14", window), "dated"); // Radiant Black #44
  assert.equal(classifyKeyDate("2026-10-24", window), "dated");
  assert.equal(classifyKeyDate("2026-10-25", window), null); // not on sale yet
  assert.equal(classifyKeyDate("2026-09-25", window), null);
  assert.equal(classifyKeyDate("2026-11-00", window), "month"); // ASM #1000
  assert.equal(classifyKeyDate("2026-09-00", window), null);
  assert.equal(classifyKeyDate("2027-01-00", window), null);
  assert.equal(classifyKeyDate(null, window), null);
  assert.equal(classifyKeyDate("October 2026", window), null);
});

test("US check matches the search RPC rule", () => {
  assert.equal(isUsSeries({ us_market: true, resolved_publisher_cached: "Panini" }), true);
  assert.equal(isUsSeries({ us_market: false, resolved_publisher_cached: "Marvel Comics" }), false);
  assert.equal(isUsSeries({ us_market: null, resolved_publisher_cached: "Marvel Comics" }), true);
  assert.equal(isUsSeries({ us_market: null, resolved_publisher_cached: "Sociedad Editora América" }), false);
});

test("volume pick follows the covers, not a wrong series pin", () => {
  const rows = [
    ...Array.from({ length: 48 }, () => ({ comicvine_volume_id: "133722" })),
    ...Array.from({ length: 7 }, () => ({ comicvine_volume_id: "138352" })),
  ];
  assert.equal(pickVolumeId(rows, 138352), 133722);
  assert.equal(pickVolumeId([], 138352), 138352);
  assert.equal(pickVolumeId([{ comicvine_volume_id: null }], null), null);
});

test("done key matches the Python ingester", () => {
  assert.equal(doneKey({ name: "Radiant Black", publisher: "Image Comics", year: 2021 }), "Radiant Black\u0001Image Comics\u00012021");
  assert.equal(doneKey({ name: "X", publisher: null, year: undefined }), "X\u0001None\u0001None");
});

test("retry throttle waits on recent attempts and expires older ledger keys", () => {
  const recent = { name: "A", publisher: "Image Comics", year: 2021, priority: PRIORITY.dated };
  const stale = { name: "B", publisher: "Image Comics", year: 2021, priority: PRIORITY.dated };
  const fresh = { name: "C", publisher: "Image Comics", year: 2021, priority: PRIORITY.dated };
  const month = { name: "D", publisher: "Marvel", year: 2025, priority: PRIORITY.month };
  const done = {
    [doneKey(recent)]: { processed_at: "2026-10-24T16:00:00+00:00", latest_release_date: "2026-10-14" },
    [doneKey(stale)]: "2026-10-24T10:00:00+00:00",
    [doneKey(month)]: { processed_at: "2026-10-24T10:00:00+00:00" },
  };
  const { due, waiting, expireKeys } = applyRetryThrottle([recent, stale, fresh, month], done, TODAY);
  assert.deepEqual(due.map((t) => t.name), ["B", "C"]);
  assert.deepEqual(waiting.map((t) => t.name), ["A", "D"]);
  assert.deepEqual(expireKeys, [doneKey(stale)]);
});

test("targets merge per volume, keep every missing issue, and sort on-sale first", () => {
  const merged = mergeTargets([
    { name: "ASM", publisher: "Marvel", year: 2025, volume_id: 163325, priority: PRIORITY.month, newest_release: "2026-11-00", missing: ["1000"] },
    { name: "ASM", publisher: "Marvel", year: 2025, volume_id: 163325, priority: PRIORITY.comicvine, newest_release: "2026-10-21", series_gcd_id: 5, missing: ["1001"] },
    { name: "Radiant Black", publisher: "Image Comics", year: 2021, volume_id: 133722, priority: PRIORITY.dated, newest_release: "2026-10-14", missing: ["44"] },
    { name: "No Volume", publisher: "DC Comics", year: 2026, volume_id: null, series_gcd_id: 9, priority: PRIORITY.month, newest_release: "2026-10-00", missing: ["2"] },
  ]);
  assert.deepEqual(merged.map((t) => t.name), ["Radiant Black", "ASM", "No Volume"]);
  assert.equal(merged[1].priority, PRIORITY.comicvine);
  assert.equal(merged[1].newest_release, "2026-11-00");
  assert.equal(merged[1].series_gcd_id, 5);
  assert.deepEqual(merged[1].missing, ["1000", "1001"]);
});

test("a series with no known volume folds into the same title's volume target", () => {
  const merged = mergeTargets([
    { name: "Power Rangers Unlimited", publisher: "BOOM! Studios", year: 2026, volume_id: null, series_gcd_id: 77, priority: PRIORITY.dated, newest_release: "2026-10-14", missing: ["4"] },
    { name: "Power Rangers: Unlimited", publisher: "Boom", year: 2026, volume_id: 175000, priority: PRIORITY.comicvine, newest_release: "2026-10-14", missing: ["4"] },
    { name: "Power Rangers Unlimited", publisher: "BOOM! Studios", year: 2016, volume_id: null, series_gcd_id: 78, priority: PRIORITY.dated, newest_release: "2026-10-01", missing: ["9"] },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].volume_id, 175000);
  assert.equal(merged[0].priority, PRIORITY.dated);
  assert.equal(merged[0].series_gcd_id, 77);
  assert.equal(merged[1].series_gcd_id, 78);
});
