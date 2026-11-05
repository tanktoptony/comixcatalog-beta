import assert from "node:assert/strict";
import test from "node:test";
import {
  autoMapColumns, autoMapHeaders, clampQuantity, listFromRow, mapRow, parseGrade, parsePrice, parseYear, pickSheet, planOwnedCopies,
  narrowHolders, runSequentialBatches, splitBatches, splitBatchesBy, splitFullTitle, splitSeriesTitle, statusFromValue,
  tableFromGrid, wishlistFromFilename,
} from "./import.js";

test("reads the series, issue and variant out of a whole-book title", () => {
  assert.deepEqual(splitFullTitle("Batman #1"), { series: "Batman", issue: "1", variant: null });
  assert.deepEqual(splitFullTitle("Batman Annual #1"), { series: "Batman Annual", issue: "1", variant: null });
  assert.deepEqual(splitFullTitle("Batman #125 Cover B Mattina Variant"), { series: "Batman", issue: "125", variant: "Cover B Mattina Variant" });
  assert.deepEqual(splitFullTitle("Batman #1 Cover #2 Variant"), { series: "Batman", issue: "1", variant: "Cover #2 Variant" });
  assert.deepEqual(splitFullTitle("Hawkeye #1 (of 6)"), { series: "Hawkeye", issue: "1", variant: null });
  assert.equal(splitFullTitle("What If? #1/2").issue, "1/2");
  assert.equal(splitFullTitle("Uncanny X-Men #1.MU").issue, "1.MU");
  assert.equal(splitFullTitle("Saga Vol. 1 TP"), null);
  assert.equal(splitFullTitle("Batman"), null);
  assert.equal(splitFullTitle("#1"), null);
});

// League's own help says the export is Excel and holds collection, wish list
// and read list. mylar-league writes its import layout as publisher, series,
// full title, date, in collection, in wish list, read. The header names here
// are a best reading of that, so the content-based tests below matter more.
const LEAGUE_GRID = [
  ["Publisher", "Series", "Full Title", "Release Date", "In Collection", "In Wish List", "Read"],
  ["DC Comics", "Batman", "Batman #125 Cover B Mattina Variant", new Date("2022-08-16T00:00:00Z"), 1, 0, 1],
  ["DC Comics", "Batman", "Batman Annual #1", new Date("2012-05-30T00:00:00Z"), 1, 0, 0],
  ["Image Comics", "Saga (2012)", "Saga #3", new Date("2012-05-09T00:00:00Z"), 0, 1, 0],
  ["Marvel Comics", "Hawkeye", "Hawkeye #1", new Date("2012-08-01T00:00:00Z"), 0, 0, 1],
];

test("a League file maps and lands every row on the right list", () => {
  const { headers, rows } = tableFromGrid(LEAGUE_GRID);
  const mapping = autoMapColumns(headers, rows);
  assert.equal(mapping["Full Title"], "full_title");
  const mapped = rows.map((raw, i) => mapRow(raw, i, mapping));
  assert.deepEqual(mapped.map(({ series, issue, issue_year }) => [series, issue, issue_year]), [
    ["Batman", "125", 2022], ["Batman Annual", "1", 2012], ["Saga", "3", 2012], ["Hawkeye", "1", 2012],
  ]);
  assert.equal(mapped[0].variant, "Cover B Mattina Variant");
  assert.equal(mapped[2].series_year, 2012);
  assert.deepEqual(mapped.map((row) => row.skip ? "skip" : row.status), ["owned", "owned", "wishlist", "skip"]);
});

test("a whole-book column is found by its values whatever it is called", () => {
  for (const name of ["Title", "Item", "Name"]) {
    const { headers, rows } = tableFromGrid([[name, "Publisher"], ["Batman #1", "DC Comics"], ["Saga #2", "Image"], ["Saga Vol. 1 TP", "Image"]]);
    const mapping = autoMapColumns(headers, rows);
    assert.equal(mapping[name], "full_title");
    assert.deepEqual([mapRow(rows[0], 0, mapping).series, mapRow(rows[0], 0, mapping).issue], ["Batman", "1"]);
    const trade = mapRow(rows[2], 2, mapping);
    assert.deepEqual([trade.series, trade.issue], ["Saga Vol. 1 TP", undefined]);
  }
});

test("finds the header below a title line, and copes with no header", () => {
  const titled = tableFromGrid([["My Comics export"], [], ["Series", "Issue"], ["Batman", 1]]);
  assert.deepEqual(titled.headers, ["Series", "Issue"]);
  assert.deepEqual(titled.rows, [{ Series: "Batman", Issue: "1" }]);
  const bare = tableFromGrid([["DC Comics", "Batman", "Batman #1", "2011-09-21", 1, 0, 0], ["Image", "Saga", "Saga #2", "2012-04-11", 1, 0, 0]]);
  assert.equal(bare.rows.length, 2);
  assert.equal(autoMapColumns(bare.headers, bare.rows)["Column 3"], "full_title");
});

test("repeated and blank headers don't overwrite each other", () => {
  const { headers } = tableFromGrid([["Series", "Issue", "", "Notes", "Notes"], ["Batman", "1", "x", "a", "b"]]);
  assert.deepEqual(headers, ["Series", "Issue", "Column 3", "Notes", "Notes (2)"]);
});

test("one column per field, the closest name winning", () => {
  const mapping = autoMapHeaders(["Title", "Series", "Issue", "Release Date", "Cover Date"]);
  assert.deepEqual(Object.values(mapping), ["", "series", "issue", "year", ""]);
});

test("list flags: owned beats wanted, neither is left out, no flags says nothing", () => {
  assert.equal(listFromRow({ in_collection: "1", in_wishlist: "1" }), "owned");
  assert.equal(listFromRow({ in_collection: "0", in_wishlist: "1" }), "wishlist");
  assert.equal(listFromRow({ in_collection: "Yes" }), "owned");
  assert.equal(listFromRow({ in_collection: "No", in_wishlist: "No" }), "skip");
  assert.equal(listFromRow({ in_wishlist: "0" }), null);
  assert.equal(listFromRow({ status: "Read List" }), "skip");
  assert.equal(listFromRow({}), null);
});

test("picks the biggest sheet and names the others", () => {
  const { sheet, others } = pickSheet([
    { sheet: "Notes", data: [["a"]] },
    { sheet: "Empty", data: [[null, ""]] },
    { sheet: "Comics", data: [["Series", "Issue"], ["Batman", 1]] },
  ]);
  assert.equal(sheet.sheet, "Comics");
  assert.deepEqual(others, ["Notes"]);
  assert.equal(pickSheet([]).sheet, null);
});

test("a CLZ-style file keeps its own columns and its own status", () => {
  const { headers, rows } = tableFromGrid([
    ["Series", "Issue", "Full Title", "Publisher", "Collection", "Collection Status", "Grade"],
    ["X-Men (1991)", "1", "X-Men, Vol. 2 #1: Rubicon", "Marvel", "Main", "Wish List", "9.8"],
    ["Amazing Spider-Man, The", "300", "Amazing Spider-Man #300: Venom", "Marvel", "Main", "In Collection", "6.0"],
  ]);
  const mapping = autoMapColumns(headers, rows);
  assert.equal(mapping.Collection, "");
  const [first, second] = rows.map((raw, i) => mapRow(raw, i, mapping));
  assert.deepEqual([first.series, first.issue, first.series_year, first.skip], ["X-Men", "1", 1991, undefined]);
  assert.equal(statusFromValue(first.status), "wishlist");
  assert.deepEqual([second.series, second.issue], ["The Amazing Spider-Man", "300"]);
  assert.equal(statusFromValue(second.status), "owned");
});

test("a blank Collection column doesn't drop the file", () => {
  const rows = [{ Series: "Batman", Issue: "1", Collection: "" }];
  const mapping = autoMapColumns(["Series", "Issue", "Collection"], rows);
  assert.equal(mapping.Collection, "");
  assert.equal(mapRow(rows[0], 0, mapping).skip, undefined);
});

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
