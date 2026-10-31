import assert from "node:assert/strict";
import test from "node:test";
import {
  autoMapHeaders, clampQuantity, parseGrade, parsePrice, parseYear, planOwnedCopies,
  narrowHolders, runSequentialBatches, splitBatches, splitBatchesBy, splitSeriesTitle, statusFromValue,
  wishlistFromFilename,
} from "./import.js";

test("auto-maps CLZ headers", () => {
  const headers = ["Series", "Issue", "Variant Description", "Publisher", "Release Date", "Grade", "Grading Company", "Slab Certification Number", "Purchase Price", "Notes", "Storage Box", "Quantity"];
  assert.deepEqual(Object.values(autoMapHeaders(headers)), ["series", "issue", "variant", "publisher", "year", "grade", "slab_company", "cert", "price_paid", "notes", "", "quantity"]);
});

test("auto-maps League-style and punctuation-insensitive headers", () => {
  const league = ["Title", "Issue #", "Publisher", "Cover Date", "Condition", "Price Paid", "Qty"];
  assert.deepEqual(Object.values(autoMapHeaders(league)), ["series", "issue", "publisher", "year", "grade", "price_paid", "quantity"]);
  assert.deepEqual(autoMapHeaders(["  SERIES-NAME ", "iSsUe_#", "CERT.#"]), {
    "  SERIES-NAME ": "series", "iSsUe_#": "issue", "CERT.#": "cert",
  });
});

test("parses grade, price, year, and quantity edges", () => {
  assert.deepEqual(parseGrade("NM/M 9.8"), { numeric: 9.8, condition: null });
  assert.deepEqual(parseGrade("Very Fine"), { numeric: null, condition: "Very Fine" });
  assert.equal(parsePrice("$1,234.50"), 1234.5);
  assert.equal(parsePrice("free"), null);
  assert.equal(parseYear("Oct 1991"), 1991);
  assert.equal(parseYear("unknown"), null);
  assert.equal(clampQuantity(99), 20);
});

test("quantity plans only missing copies and continues copy numbers", () => {
  const copies = (rows, existing) => planOwnedCopies(rows, new Map(existing)).inserts.map((item) => item.copy_number);
  assert.deepEqual(copies([{ i: 0, gcd_issue_id: 7, quantity: 3 }], [[7, { count: 1, maxCopy: 1 }]]), [2, 3]);
  assert.deepEqual(copies([{ i: 0, gcd_issue_id: 7, quantity: 1 }], [[7, { count: 2, maxCopy: 2 }]]), []);
});

test("two rows for one issue are two copies, and re-importing them adds nothing", () => {
  const rows = [
    { i: 0, gcd_issue_id: 44451, grade: "9.8", slab_company: "CGC" },
    { i: 1, gcd_issue_id: 44451, grade: "6.0" },
  ];
  const first = planOwnedCopies(rows, new Map());
  assert.deepEqual(first.inserts.map((item) => [item.row.i, item.copy_number]), [[0, 1], [1, 2]]);
  const again = planOwnedCopies(rows, new Map([[44451, { count: 2, maxCopy: 2 }]]));
  assert.equal(again.inserts.length, 0);
  assert.deepEqual(again.outcomes.map((item) => item.outcome), ["skipped_existing", "skipped_existing"]);
});

test("batches keep every row of an issue together", () => {
  const rows = Array.from({ length: 1200 }, (_, i) => ({ i, gcd_issue_id: Math.floor(i / 3) }));
  const batches = splitBatchesBy(rows, (row) => row.gcd_issue_id);
  assert.ok(batches.every((batch) => batch.length <= 200));
  const batchOf = new Map();
  batches.forEach((batch, index) => batch.forEach((row) => {
    const seen = batchOf.get(row.gcd_issue_id);
    assert.ok(seen == null || seen === index, `issue ${row.gcd_issue_id} split across batches`);
    batchOf.set(row.gcd_issue_id, index);
  }));
  assert.equal(batches.flat().length, 1200);
});

test("splits years, volumes and trailing articles out of export titles", () => {
  assert.deepEqual(splitSeriesTitle("X-Men (1991)"), { title: "X-Men", seriesYear: 1991 });
  assert.deepEqual(splitSeriesTitle("Amazing Spider-Man (1963 - 1998)"), { title: "Amazing Spider-Man", seriesYear: 1963 });
  assert.deepEqual(splitSeriesTitle("Saga (2012-present)"), { title: "Saga", seriesYear: 2012 });
  assert.deepEqual(splitSeriesTitle("Amazing Spider-Man, The"), { title: "The Amazing Spider-Man", seriesYear: null });
  assert.deepEqual(splitSeriesTitle("Daredevil, Vol. 2"), { title: "Daredevil", seriesYear: null });
  assert.deepEqual(splitSeriesTitle("1985"), { title: "1985", seriesYear: null });
});

test("1,200 rows split into six sequential batches and merge in input order", async () => {
  const rows = Array.from({ length: 1200 }, (_, i) => ({ i }));
  assert.equal(splitBatches(rows).length, 6);
  let active = 0;
  let maxActive = 0;
  const merged = await runSequentialBatches(rows, async (batch) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    const result = batch.map(({ i }) => ({ i, result: "matched" })).reverse();
    active -= 1;
    return result;
  });
  assert.equal(maxActive, 1);
  assert.deepEqual(merged.map(({ i }) => i), rows.map(({ i }) => i));
});

test("detects wishlist filenames and values", () => {
  assert.equal(wishlistFromFilename("my-wishlist.csv"), true);
  assert.equal(wishlistFromFilename("collection.csv"), false);
  for (const value of ["Wishlist", "wanted", "Want List"]) assert.equal(statusFromValue(value), "wishlist");
  assert.equal(statusFromValue("In Collection", "wishlist"), "owned");
  assert.equal(statusFromValue("", "wishlist"), "wishlist");
});

test("narrowHolders uses the issue's cover year, then the publisher", () => {
  const holder = (id, year, publisher) => ({ series: { gcd_id: id, resolved_publisher_cached: publisher }, issue: { key_date: `${year}-05-00` } });
  const superman = [holder(116, 1945, "DC Comics"), holder(9001, 1987, "DC Comics"), holder(9002, 1945, "Editorial Novaro")];
  assert.deepEqual(narrowHolders(superman, { issueYear: 1945, publisher: "DC Comics" }).map((h) => h.series.gcd_id), [116]);
  assert.deepEqual(narrowHolders(superman, { issueYear: 1987 }).map((h) => h.series.gcd_id), [9001]);
  assert.equal(narrowHolders(superman, {}).length, 3);
  assert.equal(narrowHolders([holder(1, 2000, "DC")], { issueYear: 1990 }).length, 1);
});
