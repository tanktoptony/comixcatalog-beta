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
