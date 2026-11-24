import test from "node:test";
import assert from "node:assert/strict";
import { formatGcdDate, formatGcdPrice, buildIssueDetailsRows, buildStoryCreditSummary, humanizeStoryType, parseGcdCreditList, stripGcdCharacterNoise, stripGcdCreditNoise } from "./issueDetails.js";

test("details rows skip empty values and a duplicate indicia publisher", () => {
  const rows = buildIssueDetailsRows({
    publisher: "Marvel Comics",
    series_title: "Fantastic Four",
    series_id: "abc",
    issue_number: "1",
    details: { indicia_publisher: " marvel comics ", isbn: "", barcode: "75960602462900111" },
  });
  assert.deepEqual(rows.map(({ label }) => label), ["Publisher", "Series", "Issue", "UPC / Barcode"]);
  assert.equal(rows.find(({ label }) => label === "Series").href, "/series/abc");
});

test("details rows retain a distinct indicia publisher", () => {
  const rows = buildIssueDetailsRows({ publisher: "DC", details: { indicia_publisher: "National Periodical Publications" } });
  assert.equal(rows[1].label, "Indicia publisher");
});

test("story types are humanized for comic contents", () => {
  assert.equal(humanizeStoryType("comic story"), "Story");
  assert.equal(humanizeStoryType("text_story"), "Text story");
  assert.equal(humanizeStoryType("pinup"), "Pin-up");
  assert.equal(humanizeStoryType("illustration"), "Illustration");
});

test("story credit summary keeps source text and omits empty roles", () => {
  assert.equal(buildStoryCreditSummary({ script: "Stan Lee", pencils: "Jack Kirby", inks: "" }), "Script Stan Lee · Pencils Jack Kirby");
});


test("GCD dates and prices read like a collector would say them", () => {
  assert.equal(formatGcdDate("1963-09-00"), "September 1963");
  assert.equal(formatGcdDate("1963-07-02"), "July 2, 1963");
  assert.equal(formatGcdDate("1963-00-00"), "1963");
  assert.equal(formatGcdDate("Fall 1963"), "Fall 1963");
  assert.equal(formatGcdDate(null), null);
  assert.equal(formatGcdPrice("0.12 USD"), "$0.12 USD");
  assert.equal(formatGcdPrice("1.50 USD; 2.00 CAD; 0.50 GBP"), "$1.50 USD · $2.00 CAD · £0.50 GBP");
  assert.equal(formatGcdPrice(""), null);
});

test("credit annotations are removed from names and retained as notes", () => {
  assert.deepEqual(stripGcdCreditNoise("John Romita (signed as J. Romita) (credited)"), { name: "John Romita", note: "signed as J. Romita; credited" });
  assert.deepEqual(parseGcdCreditList("Jim Salicrup (credited); Glenn Herdling (uncredited)"), [
    { name: "Jim Salicrup", note: "credited" },
    { name: "Glenn Herdling", note: "uncredited" },
  ]);
});

test("character appearance notes are separated from the chip label", () => {
  assert.deepEqual(stripGcdCharacterNoise("Spider-Man (cameo)"), { name: "Spider-Man", note: "cameo" });
  assert.deepEqual(stripGcdCharacterNoise("Wolverine (Logan)"), { name: "Wolverine (Logan)", note: "" });
});

test("filterVersions matches every typed word in any order", async () => {
  const { filterVersions } = await import("./issueDetails.js");
  const versions = [
    { gcdId: 1, name: "Nick Dragotta Cover", barcode: "76194138584600111", price: "4.99 USD", onSaleDate: "2024-10-09" },
    { gcdId: 2, name: "Second Printing Nick Dragotta Foil Cardstock Variant Cover", barcode: "76194138584600152", price: "7.99 USD", onSaleDate: "2024-10-30" },
    { gcdId: 3, name: "Skottie Young Exclusive Variant Cover", barcode: null, price: null, onSaleDate: null },
  ];
  assert.deepEqual(filterVersions(versions, "foil dragotta").map((v) => v.gcdId), [2]);
  assert.deepEqual(filterVersions(versions, "DRAGOTTA").map((v) => v.gcdId), [1, 2]);
  assert.deepEqual(filterVersions(versions, "600152").map((v) => v.gcdId), [2]);
  assert.deepEqual(filterVersions(versions, "october 30").map((v) => v.gcdId), [2]);
  assert.equal(filterVersions(versions, "  ").length, 3);
  assert.equal(filterVersions(versions, "sketch").length, 0);
  assert.deepEqual(filterVersions(null, "x"), []);
});

test("date chip leads with the on-sale date and keeps the cover date on hover", async () => {
  const { issueDateChip, onSaleYear } = await import("./issueDetails.js");
  assert.deepEqual(issueDateChip({ display_date: "January 2027", details: { on_sale_date: "2026-11-18" } }), { label: "Out Nov 18, 2026", title: "Cover date January 2027" });
  assert.deepEqual(issueDateChip({ display_date: "May 1963", details: { on_sale_date: "1963-03-00" } }), { label: "Out Mar 1963", title: "Cover date May 1963" });
  assert.deepEqual(issueDateChip({ display_date: "1986", details: {} }), { label: "1986", title: null });
  assert.equal(issueDateChip({ details: { on_sale_date: "2026-00-00" } }), null);
  assert.equal(issueDateChip(null), null);
  assert.equal(onSaleYear("2026-11-18"), 2026);
  assert.equal(onSaleYear("1963-00-00"), 1963);
  assert.equal(onSaleYear(null), null);
});
