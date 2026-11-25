import assert from "node:assert/strict";
import test from "node:test";
import { matchBlankSeries, publisherAgrees, titleKey } from "./blankVolumeMatch.js";

const series = (o = {}) => ({ name: "Solo", publisher: "Marvel", year: 2016, count: 5, collected: false, ...o });
const vol = (o = {}) => ({ id: 94818, name: "Solo", publisher: "Marvel", start_year: "2016", count_of_issues: 5, ...o });
const run = (s, c, more = {}) => matchBlankSeries({ series: s, candidates: c, ...more });

test("title, publisher, year and count agree: sure", () => {
  const r = run(series(), [vol()]);
  assert.equal(r.status, "sure");
  assert.equal(r.volume.id, 94818);
});

test("any one of the four off means ask, never sure", () => {
  for (const c of [vol({ publisher: "Panini España" }), vol({ start_year: "2010" }), vol({ count_of_issues: 6 })]) {
    assert.equal(run(series(), [c]).status, "ask", JSON.stringify(c));
  }
  assert.notEqual(run(series(), [vol({ name: "Solo Avengers" })]).status, "sure");
});

test("no year or no publisher on either side is never sure", () => {
  assert.notEqual(run(series({ year: null }), [vol()]).status, "sure");
  assert.notEqual(run(series(), [vol({ start_year: null })]).status, "sure");
  assert.notEqual(run(series(), [vol({ start_year: "" })]).status, "sure");
  assert.notEqual(run(series({ publisher: null }), [vol()]).status, "sure");
  assert.notEqual(run(series(), [vol({ publisher: null })]).status, "sure");
  assert.notEqual(run(series({ count: 0 }), [vol({ count_of_issues: 0 })]).status, "sure");
});

test("a foreign reprint never takes the American volume", () => {
  const r = run(series({ name: "Spectacular Spider-Man", publisher: "Yaffa", year: 1985, count: 1 }), [vol({ name: "Spectacular Spider-Man", publisher: "Marvel", start_year: "1985", count_of_issues: 1 })]);
  assert.equal(r.status, "ask");
});

test("two volumes that fit, or a twin series of ours, are asked", () => {
  assert.equal(run(series(), [vol(), vol({ id: 2 })]).status, "ask");
  assert.equal(run(series(), [vol(), vol({ id: 2, count_of_issues: 1 })]).volume?.id, 94818);
  assert.equal(run(series({ count: 1 }), [vol({ count_of_issues: 1 }), vol({ id: 2, count_of_issues: 3 })]).status, "ask");
  assert.equal(run(series(), [vol()], { rivals: [{ publisher: "Marvel", year: 2016, count: 5 }] }).status, "ask");
  assert.equal(run(series(), [vol()], { rivals: [{ publisher: "Marvel", year: 2004, count: 5 }] }).status, "sure");
});

test("a volume whose covers sit under another series is never offered", () => {
  assert.equal(run(series(), [vol()], { takenBy: new Set([94818]) }).status, "none");
});

test("one-book editions need more than a count of one", () => {
  const one = { count: 1 };
  assert.equal(run(series(one), [vol({ count_of_issues: 1 })]).status, "sure");
  assert.equal(run(series({ ...one, collected: true }), [vol({ count_of_issues: 1 })]).status, "ask");
  assert.equal(run(series(one), [vol({ count_of_issues: 1, start_year: "2017" })]).status, "ask");
});

test("spelling and publisher names", () => {
  assert.equal(titleKey("Tiger-Man"), titleKey("Tigerman"));
  assert.equal(titleKey("Dr. Strange"), titleKey("Doctor Strange"));
  assert.equal(titleKey("The X-Men & Alpha Flight"), titleKey("X-Men and Alpha Flight"));
  assert.equal(titleKey("Shazam: The New Beginning"), titleKey("Shazam! The New Beginning"));
  assert.equal(titleKey("Wolverine / Doop"), titleKey("Wolverine & Doop"));
  assert.equal(titleKey("Superman vs. The Terminator"), titleKey("Superman vs. Terminator"));
  assert.notEqual(titleKey("Theatre"), titleKey("Atre"));
  assert.notEqual(titleKey("Andromeda"), titleKey("Romeda"));
  assert.notEqual(titleKey("Drive"), titleKey("Doctorive"));
  assert.ok(publisherAgrees("Slave Labor", "SLG Publishing"));
  assert.ok(publisherAgrees("Kitchen Sink Press", "Kitchen Sink"));
  assert.ok(publisherAgrees("DC; Dark Horse", "DC Comics"));
  assert.ok(!publisherAgrees("Press", "Enterprises"));
  assert.ok(!publisherAgrees("Marvel UK", "Marvel"));
});

test("close title with publisher and year is asked; nothing close is none", () => {
  assert.equal(run(series({ name: "Indestructible Stingray", count: 3 }), [vol({ name: "Indestructible: Stingray Special", count_of_issues: 3 })]).status, "ask");
  assert.equal(run(series(), [vol({ name: "Batman" })]).status, "none");
  assert.equal(run(series(), [vol({ publisher: "Panini Verlag", count_of_issues: 9 })]).status, "none", "two things off is not worth asking");
  assert.equal(run(series(), []).status, "none");
});
