import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRequestInput,
  requestDedupeKey,
  requestToIngestTarget,
  selectSeriesMatch,
  shouldAutoResolveRequest,
  titleLookupKeys,
} from "./catalogRequests.js";

test("normalizes request fields", () => {
  const result = normalizeRequestInput({ title: "  Saga  ", issue_number: " 1 ", year: "2012", source: "search" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    title: "Saga",
    issue_number: "1",
    publisher: null,
    notes: null,
    barcode: null,
    search_term: null,
    source: "search",
    year: 2012,
  });
});

test("rejects missing titles, invalid years, sources, and long fields", () => {
  assert.equal(normalizeRequestInput({ title: "" }).error, "Enter the book title.");
  assert.match(normalizeRequestInput({ title: "Saga", year: "1889" }).error, /1890/);
  assert.match(normalizeRequestInput({ title: "Saga", source: "other" }).error, /source/);
  assert.match(normalizeRequestInput({ title: "Saga", notes: "x".repeat(1001) }).error, /1000/);
});

test("dedupe key ignores title punctuation and case", () => {
  assert.equal(requestDedupeKey({ title: "The Amazing Spider-Man!", issue_number: " 1 " }), "amazing spider man::1");
});

test("series matching prefers compatible publisher and containing year", () => {
  const candidates = [
    { id: "old", title: "Saga", resolved_publisher_cached: "Image", year_start_cached: 1990, year_end_cached: 1999 },
    { id: "right", title: "Saga", resolved_publisher_cached: "Image Comics", year_start_cached: 2012, year_end_cached: 2018 },
  ];
  assert.equal(selectSeriesMatch({ title: "Saga", publisher: "Image", year: 2014 }, candidates).id, "right");
});

test("builds canonical ingest target with request fallbacks", () => {
  assert.deepEqual(
    requestToIngestTarget(
      { title: "Saga", publisher: "Image", year: 2014 },
      { title: "Saga", resolved_publisher_cached: "Image Comics", year_start_cached: 2012 }
    ),
    { name: "Saga", publisher: "Image Comics", year: 2012 }
  );
  assert.deepEqual(requestToIngestTarget({ title: "Unknown", year: 2020 }, null), {
    name: "Unknown",
    publisher: null,
    year: 2020,
  });
});

test("auto resolution requires an issue and stored canonical cover", () => {
  assert.equal(shouldAutoResolveRequest({ gcd_id: 1 }, { storage_path: "covers/1.jpg" }), true);
  assert.equal(shouldAutoResolveRequest({ gcd_id: 1 }, null), false);
});

test("a requested year outside every run matches nothing", () => {
  const runs = [
    { title: "Superman", year_start_cached: 1939, year_end_cached: 1986, resolved_publisher_cached: "DC Comics" },
    { title: "Superman", year_start_cached: 1987, year_end_cached: 2006, resolved_publisher_cached: "DC Comics" },
  ];
  assert.equal(selectSeriesMatch({ title: "Superman", year: 2026 }, runs), null);
  assert.equal(selectSeriesMatch({ title: "Superman", year: 1993 }, runs).year_start_cached, 1987);
  assert.equal(selectSeriesMatch({ title: "Superman", year: null }, runs).year_start_cached, 1939);
});

test("title lookup keys try the title with and without a leading The", () => {
  assert.deepEqual(titleLookupKeys("X-Men"), ["xmen", "thexmen"]);
  assert.deepEqual(titleLookupKeys("The Amazing Spider-Man"), ["theamazingspiderman", "amazingspiderman"]);
  assert.deepEqual(titleLookupKeys("  "), []);
});
