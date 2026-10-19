import test from "node:test";
import assert from "node:assert/strict";
import {
  mapAppSeriesRow,
  mapGcdSeriesRow,
  matchPlaceholder,
  placeholderUpdate,
  selectMissingSeries,
} from "./gcdSeriesPhase.js";

test("selectMissingSeries applies mirror, cursor, and limit", () => {
  const rows = [{ gcd_id: 1 }, { gcd_id: 2 }, { gcd_id: 3 }, { gcd_id: 4 }];
  assert.deepEqual(selectMissingSeries(rows, new Set([3]), { after: 1, limit: 1 }), [{ gcd_id: 2 }]);
});

test("matchPlaceholder distinguishes exact, none, and ambiguous matches", () => {
  const series = { name: "The X-Men", year_began: 2026, resolved_publisher: "Marvel Comics" };
  const match = { id: "one", gcd_id: null, title: "X-Men", year_start_cached: 2026, resolved_publisher_cached: "Marvel" };
  assert.equal(matchPlaceholder(series, [match]).kind, "exact");
  assert.equal(matchPlaceholder(series, [{ ...match, title: "Avengers" }]).kind, "none");
  assert.equal(matchPlaceholder(series, [match, { ...match, id: "two" }]).kind, "ambiguous");
});

test("row mapping follows the existing series importer", () => {
  const source = { gcd_id: 240077, name: "Midnight Spider-Man", sort_name: "Midnight Spider-Man", year_began: 2026, year_ended: null, publisher_gcd_id: 78, publishing_format: "limited series", binding: "saddle-stitched", notes: "format note", publication_type: "magazine" };
  assert.deepEqual(mapGcdSeriesRow(source), { gcd_id: 240077, name: "Midnight Spider-Man", sort_name: "Midnight Spider-Man", year_began: 2026, year_ended: null, publisher_gcd_id: 78, publishing_format: "limited series", binding: "saddle-stitched", format_notes: "format note", publication_type: "magazine" });
  const mapped = mapAppSeriesRow(source, { name: "Marvel Comics", country: "us" });
  assert.equal(mapped.resolved_publisher_cached, "Marvel Comics");
  assert.equal(mapped.us_market, true);
  assert.equal(mapped.year_end_cached, 2026);
  assert.deepEqual(placeholderUpdate({ year_start_cached: 2025, year_end_cached: null, resolved_publisher_cached: null }, mapped), { gcd_id: 240077, year_end_cached: 2026, resolved_publisher_cached: "Marvel Comics" });
});
