import assert from "node:assert/strict";
import test from "node:test";
import {
  decideComicGcdMatch,
  importerRowForComic,
  memberComicTitle,
} from "./matchComicsToGcd.js";

const comic = (overrides = {}) => ({
  id: "comic-1",
  series_title: "The Example",
  issue_number: "1",
  publisher: "Example Press",
  release_year: 2025,
  variant_name: null,
  gcd_id: null,
  ...overrides,
});
const base = (overrides = {}) => ({
  gcd_id: 101,
  base_gcd_issue_id: 101,
  variant_of_gcd_id: null,
  variant_name: null,
  series_gcd_id: 10,
  issue_number: "1",
  ...overrides,
});
const matched = { result: "matched", gcd_issue_id: 101, series_gcd_id: 10, label: "The Example (2025) #1" };

test("accepts the base edition for one sure importer match", () => {
  const decision = decideComicGcdMatch({ comic: comic(), resolution: matched, editions: [base()] });
  assert.equal(decision.accepted, true);
  assert.equal(decision.gcdIssueId, 101);
  assert.equal(decision.edition, "Base edition");
});

test("passes member comic fields to the importer without treating release year as a series year", () => {
  assert.deepEqual(importerRowForComic(comic({ series_title: "X-Men Vol. 2", variant_name: "Cover B" }), 7), {
    i: 7,
    series: "X-Men",
    issue: "1",
    publisher: "Example Press",
    year: 2025,
    series_year: null,
    issue_year: 2025,
    variant: "Cover B",
  });
  assert.equal(memberComicTitle(comic({ series_title: " The   Example ", issue_number: "#1", variant_name: "Cover B" })), "The Example #1 (Cover B)");
});

test("skips an ambiguous importer result", () => {
  const decision = decideComicGcdMatch({
    comic: comic(),
    resolution: { result: "pick", reason: "2 volumes have issue #1" },
    editions: [base()],
  });
  assert.equal(decision.accepted, false);
  assert.match(decision.reason, /^ambiguous:/);
});

test("skips a suggested result even when it names a GCD issue", () => {
  const decision = decideComicGcdMatch({
    comic: comic(),
    resolution: { result: "suggested", gcd_issue_id: 101 },
    editions: [base()],
  });
  assert.equal(decision.accepted, false);
  assert.equal(decision.reason, "suggested match requires collector confirmation");
});

test("keeps the importer's not-found reason", () => {
  const decision = decideComicGcdMatch({
    comic: comic(),
    resolution: { result: "not_found", reason: "Found the series, but not issue #1." },
    editions: [base()],
  });
  assert.equal(decision.accepted, false);
  assert.equal(decision.reason, "Found the series, but not issue #1.");
});

test("requires one matching edition when the member comic names a variant", () => {
  const edition = base({ gcd_id: 102, base_gcd_issue_id: 101, variant_of_gcd_id: 101, variant_name: "Cover B: Foil" });
  const accepted = decideComicGcdMatch({
    comic: comic({ variant_name: " cover b foil " }),
    resolution: matched,
    editions: [base(), edition],
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.gcdIssueId, 102);
  assert.equal(accepted.edition, "Cover B: Foil");

  const missing = decideComicGcdMatch({ comic: comic({ variant_name: "Newsstand" }), resolution: matched, editions: [base(), edition] });
  assert.equal(missing.accepted, false);
  assert.match(missing.reason, /no GCD edition matches/);

  const ambiguous = decideComicGcdMatch({
    comic: comic({ variant_name: "Cover B Foil" }),
    resolution: matched,
    editions: [base(), edition, { ...edition, gcd_id: 103 }],
  });
  assert.equal(ambiguous.accepted, false);
  assert.match(ambiguous.reason, /2 GCD editions match/);
});

test("leaves an already linked comic untouched", () => {
  const decision = decideComicGcdMatch({
    comic: comic({ gcd_id: 999 }),
    resolution: matched,
    editions: [base()],
  });
  assert.deepEqual(decision, {
    accepted: false,
    comicId: "comic-1",
    book: "The Example #1",
    reason: "already linked to GCD 999",
  });
});

test("refuses a sure importer match when the member's year or publisher disagrees with GCD", () => {
  const series = (info) => new Map([[10, info]]);
  const swampThing = decideComicGcdMatch({
    comic: comic({ release_year: 1982, publisher: "DC Comics" }),
    resolution: matched,
    editions: [base({ key_date: "2014-10-00" })],
    gcdSeriesById: series({ year_began: 2011, publisher_name: "DC" }),
  });
  assert.equal(swampThing.accepted, false);
  assert.match(swampThing.reason, /before the GCD volume began \(2011\)/);

  const tooLate = decideComicGcdMatch({
    comic: comic({ release_year: 2019 }),
    resolution: matched,
    editions: [base({ key_date: "2015-02-00" })],
    gcdSeriesById: series({ year_began: 2015, publisher_name: "Example Press" }),
  });
  assert.equal(tooLate.accepted, false);

  const otherPublisher = decideComicGcdMatch({
    comic: comic({ publisher: "Oni Press" }),
    resolution: matched,
    editions: [base()],
    gcdSeriesById: series({ year_began: 2025, publisher_name: "Marvel" }),
  });
  assert.equal(otherPublisher.accepted, false);
  assert.match(otherPublisher.reason, /publisher "Oni Press" differs/);

  const agrees = decideComicGcdMatch({
    comic: comic({ release_year: 2014, publisher: "Example Press Inc" }),
    resolution: matched,
    editions: [base({ key_date: "2015-02-00" })],
    gcdSeriesById: series({ year_began: 2015, publisher_name: "Example Press" }),
  });
  assert.equal(agrees.accepted, true);
});
