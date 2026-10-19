import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyCollectionBook,
  findOwnershipCollision,
  normalizeIssueNumber,
  normalizePublisher,
  normalizeTitle,
} from "./collectionReconcile.js";

const candidate = (overrides = {}) => ({
  gcd_id: 10, series_gcd_id: 20, series_title: "Fantastic Four vs. The X-Men",
  issue_number: "3", series_year_start: 1987, series_year_end: 1987,
  publisher: "Marvel Comics", publication_date: "1987-06-01", variant_of_gcd_id: null,
  ...overrides,
});

test("normalizes titles, issue numbers, and publisher aliases", () => {
  assert.equal(normalizeTitle(" The Fantastic Four Versus The X-Men! "), "fantastic four vs x men");
  assert.equal(normalizeTitle("Fantastic Four & X-Men"), normalizeTitle("Fantastic Four and X-Men"));
  assert.equal(normalizeIssueNumber(" #-1 "), "-1");
  assert.equal(normalizeIssueNumber("Annual #1"), "annual 1");
  assert.equal(normalizeIssueNumber("1000"), "1000");
  assert.equal(normalizePublisher("Marvel Comics"), normalizePublisher("Marvel"));
});

test("classifies the real Fantastic Four example as exact and prefers the base issue", () => {
  const result = classifyCollectionBook(
    { series_title: "Fantastic Four Versus The X-Men", issue_number: "3", release_year: 1987, publisher: "Marvel" },
    [candidate(), candidate({ gcd_id: 11, variant_of_gcd_id: 10 })],
  );
  assert.equal(result.classification, "exact");
  assert.equal(result.candidate.gcd_id, 10);
});

test("classifies the trailing-space Iron Man example as exact", () => {
  const result = classifyCollectionBook(
    { series_title: "Iron Man ", issue_number: "42", release_year: 1968, publisher: "Marvel" },
    [candidate({ series_title: "Iron Man", issue_number: "42", series_year_start: 1968, series_year_end: 1996, publication_date: "1968-10-01" })],
  );
  assert.equal(result.classification, "exact");
});

test("classifies likely, ambiguous, and none including supplied examples", () => {
  assert.equal(classifyCollectionBook(
    { series_title: "DMZ: Random Fire", issue_number: "27", release_year: 2008, publisher: null },
    [candidate({ series_title: "DMZ Random Fire", issue_number: "27", series_year_start: 2007, series_year_end: 2007, publication_date: "2007-12-01" })],
  ).classification, "likely");
  assert.equal(classifyCollectionBook(
    { series_title: "Amazing Spider-Man", issue_number: "1000", release_year: 2026, publisher: "Marvel" },
    [candidate({ gcd_id: 1, series_title: "Amazing Spider-Man", issue_number: "1000", series_gcd_id: 1, series_year_start: 2026 }),
      candidate({ gcd_id: 2, series_title: "The Amazing Spider-Man", issue_number: "1000", series_gcd_id: 2, series_year_start: 2026 })],
  ).classification, "ambiguous");
  assert.equal(classifyCollectionBook(
    { series_title: "Elsewhere Spirit Lounge", issue_number: "1", release_year: 2026, publisher: "Jason S. Abrams" }, []
  ).classification, "none");
});

test("detects an existing owned issue before linking", () => {
  const rows = [{ id: "a", user_id: "u", gcd_issue_id: 42 }, { id: "b", user_id: "u", gcd_issue_id: null }];
  assert.equal(findOwnershipCollision(rows, "u", 42, "b")?.id, "a");
  assert.equal(findOwnershipCollision(rows, "u", 42, "a"), null);
});
