import test from "node:test";
import assert from "node:assert/strict";
import {
  CREDIT_ROLES,
  aggregateSeriesCredits,
  createSeriesCreditAggregator,
  dedupeRows,
  fillStoryCreditText,
  formatStoryCharacters,
  mapDumpIssueRows,
  missingIssueIds,
  reserveSlug,
  resolveBases,
  rolesForCreditType,
  staleKeys,
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

test("fills empty story credit text using expanded, deduped credit types", () => {
  const story = {
    script: "",
    pencils: null,
    inks: "GCD text",
    colors: null,
    letters: null,
  };
  assert.deepEqual(
    fillStoryCreditText(story, [
      { id: 1, credit_type_id: 10, name: "One" },
      { id: 2, credit_type_id: 9, name: "Painter" },
      { id: 3, credit_type_id: 1, name: "One" },
      { id: 4, credit_type_id: 13, name: "Two" },
    ]),
    {
      script: "One; Two",
      pencils: "One; Painter; Two",
      inks: "GCD text",
      colors: "Two",
      letters: "Two",
    },
  );
});

test("pairs story aliases, keeps hero order, and appends notes", () => {
  const characters = [
    { character_id: 2, name: "Civilian", notes: "" },
    { character_id: 3, name: "Solo", notes: "death" },
    { character_id: 1, name: "Hero", notes: "introduction" },
    { character_id: 4, name: "Only Hero", notes: "" },
    { character_id: 5, name: "Only Civilian", notes: "" },
  ];
  const relations = [
    { from_character_id: 1, to_character_id: 2 },
    { from_character_id: 4, to_character_id: 40 },
    { from_character_id: 50, to_character_id: 5 },
  ];
  assert.deepEqual(formatStoryCharacters(characters, relations), [
    "Solo (death)",
    "Hero [Civilian] (introduction)",
    "Only Hero",
    "Only Civilian",
  ]);
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

test("computes stale compound keys without removing replacement rows", () => {
  const existing = [
    { issue: 1, sequence: 0 },
    { issue: 1, sequence: 1 },
    { issue: 2, sequence: 0 },
  ];
  assert.deepEqual(staleKeys(existing, [existing[0], existing[2]], ["issue", "sequence"]), [existing[1]]);
});

test("resolves edition bases and reports broken parent graphs", () => {
  const resolved = resolveBases([
    { gcd_id: 1, variant_of_id: null },
    { gcd_id: 2, variant_of_id: 1 },
    { gcd_id: 3, variant_of_id: 2 },
    { gcd_id: 4, variant_of_id: 5 },
    { gcd_id: 5, variant_of_id: 4 },
    { gcd_id: 6, variant_of_id: 99 },
  ]);
  assert.deepEqual(resolved.map(({ gcd_id, base_gcd_issue_id, reason }) => ({ gcd_id, base_gcd_issue_id, reason })), [
    { gcd_id: 1, base_gcd_issue_id: 1, reason: null },
    { gcd_id: 2, base_gcd_issue_id: 1, reason: null },
    { gcd_id: 3, base_gcd_issue_id: 1, reason: null },
    { gcd_id: 4, base_gcd_issue_id: 4, reason: "cycle" },
    { gcd_id: 5, base_gcd_issue_id: 5, reason: "cycle" },
    { gcd_id: 6, base_gcd_issue_id: 6, reason: "parent_not_mirrored" },
  ]);
});

test("caps edition parent traversal at five hops", () => {
  const resolved = resolveBases([
    { gcd_id: 1, variant_of_id: 2 },
    { gcd_id: 2, variant_of_id: 3 },
    { gcd_id: 3, variant_of_id: 4 },
    { gcd_id: 4, variant_of_id: 5 },
    { gcd_id: 5, variant_of_id: 6 },
    { gcd_id: 6, variant_of_id: 7 },
    { gcd_id: 7, variant_of_id: null },
  ]);
  assert.equal(resolved[0].reason, "too_deep");
  assert.equal(resolved[1].base_gcd_issue_id, 7);
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

test("computes missing dump issues from mirror membership", () => {
  const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual([...missingIssueIds(rows, new Set([1, 3]))], [2]);
});

test("maps missing dump issues and resolves their edition bases", () => {
  const rows = [
    { id: 10, series_id: 7, number: "1", title: " Base ", publication_date: "2026", key_date: "2026-01-00", publisher_id: 4, variant_of_id: null, variant_name: null },
    { id: 11, series_id: 7, number: "1", title: "Variant", publication_date: "2026", key_date: "2026-01-00", publisher_id: 4, variant_of_id: 10, variant_name: " Foil " },
  ];
  assert.deepEqual(mapDumpIssueRows(rows, new Set([10])), [{
    gcd_id: 11,
    series_gcd_id: 7,
    issue_number: "1",
    title: "Variant",
    publication_date: "2026",
    key_date: "2026-01-00",
    publisher_gcd_id: 4,
    variant_of_gcd_id: 10,
    variant_name: "Foil",
    base_gcd_issue_id: 10,
  }]);
});

test("a bare ? credit is unknown, not a name", () => {
  const filled = fillStoryCreditText({ colors: "?", inks: "?" }, [{ credit_type_id: 3, name: "Paul Reinman" }]);
  assert.equal(filled.colors, null);
  assert.equal(filled.inks, "Paul Reinman");
});
