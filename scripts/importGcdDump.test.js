import test from "node:test";
import assert from "node:assert/strict";
import {
  CREDIT_ROLES,
  aggregateSeriesCredits,
  createSeriesCreditAggregator,
  dedupeRows,
  reserveSlug,
  rolesForCreditType,
  unambiguousLegacyAttachments,
} from "./lib/gcdDumpImport.js";
import { validateRollupLimit } from "./importGcdDump.js";

test("expands every GCD credit type", () => {
  const expected = {
    1: ["writer"],
    2: ["penciller"],
    3: ["inker"],
    4: ["colorist"],
    5: ["letterer"],
    6: [],
    7: ["penciller", "inker"],
    8: ["penciller", "inker", "colorist"],
    9: ["penciller"],
    10: ["writer", "penciller", "inker"],
    11: ["writer", "penciller", "inker", "colorist"],
    12: ["writer", "penciller", "inker", "letterer"],
    13: ["writer", "penciller", "inker", "colorist", "letterer"],
    14: ["penciller", "inker", "letterer"],
  };
  for (const [id, roles] of Object.entries(expected))
    assert.deepEqual(CREDIT_ROLES.get(Number(id)), roles);
});

test("only cover art becomes a cover credit", () => {
  for (const id of [2, 3, 7, 8, 9, 10, 11, 12, 13, 14])
    assert.deepEqual(rolesForCreditType(id, "cover"), ["cover"]);
  // script (blurbs), colors, letters and editing on a cover are not cover art
  for (const id of [1, 4, 5, 6, 99])
    assert.deepEqual(rolesForCreditType(id, "cover"), []);
});

test("slug collision suffixing preserves every reserved slug", () => {
  const used = new Set(["jose-garcia", "jose-garcia-2"]);
  assert.equal(reserveSlug("José Garcia", used), "jose-garcia-3");
  assert.deepEqual(
    [...used],
    ["jose-garcia", "jose-garcia-2", "jose-garcia-3"],
  );
});

test("legacy names attach only to an unambiguous dump identity", () => {
  const legacy = [
    { id: 1, name: "Unique", slug: "kept" },
    { id: 2, name: "Shared", slug: "also-kept" },
  ];
  const dump = [
    { gcd_creator_id: 10, name: "Unique" },
    { gcd_creator_id: 20, name: "Shared" },
    { gcd_creator_id: 21, name: "Shared" },
  ];
  assert.deepEqual(unambiguousLegacyAttachments(legacy, dump), [
    { ...legacy[0], gcd_creator_id: 10 },
  ]);
});

test("dedupes batches on the requested compound key", () => {
  const rows = [
    { issue: 1, creator: 2, role: "writer" },
    { issue: 1, creator: 2, role: "writer" },
    { issue: 1, creator: 2, role: "inker" },
  ];
  assert.deepEqual(dedupeRows(rows, ["issue", "creator", "role"]), [
    rows[0],
    rows[2],
  ]);
});

test("aggregates distinct issues and year bounds for a series creator role", () => {
  const rows = [
    {
      series_gcd_id: 9,
      gcd_issue_id: 1,
      creator_id: 3,
      role: "writer",
      year: 1999,
    },
    {
      series_gcd_id: 9,
      gcd_issue_id: 1,
      creator_id: 3,
      role: "writer",
      year: 1999,
    },
    {
      series_gcd_id: 9,
      gcd_issue_id: 2,
      creator_id: 3,
      role: "writer",
      year: 2001,
    },
    {
      series_gcd_id: 9,
      gcd_issue_id: 2,
      creator_id: 3,
      role: "inker",
      year: null,
    },
  ];
  assert.deepEqual(aggregateSeriesCredits(rows), [
    {
      series_gcd_id: 9,
      creator_id: 3,
      role: "writer",
      issue_count: 2,
      year_first: 1999,
      year_last: 2001,
    },
    {
      series_gcd_id: 9,
      creator_id: 3,
      role: "inker",
      issue_count: 1,
      year_first: null,
      year_last: null,
    },
  ]);
});

test("rollup aggregation spans issue batches for the same series", () => {
  const aggregator = createSeriesCreditAggregator();
  aggregator.add([
    {
      series_gcd_id: 9,
      gcd_issue_id: 1,
      creator_id: 3,
      role: "writer",
      year: 1999,
    },
  ]);
  aggregator.add([
    {
      series_gcd_id: 9,
      gcd_issue_id: 2,
      creator_id: 3,
      role: "writer",
      year: 2001,
    },
  ]);
  assert.deepEqual(aggregator.rows(), [
    {
      series_gcd_id: 9,
      creator_id: 3,
      role: "writer",
      year_first: 1999,
      year_last: 2001,
      issue_count: 2,
    },
  ]);
});

test("rollup refuses a limit without explicit series ids", () => {
  assert.throws(
    () => validateRollupLimit({ phase: "rollup", limit: 10, seriesIds: [] }),
    /--series-gcd-ids/,
  );
  assert.doesNotThrow(() =>
    validateRollupLimit({ phase: "rollup", limit: 10, seriesIds: [1576] }),
  );
});
