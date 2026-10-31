import assert from "node:assert/strict";
import test from "node:test";
import { compareEditionBooks, editionBookLabel, specialBookLabel } from "./workPagePure.js";

test("specialBookLabel removes the work prefix and leading punctuation", () => {
  assert.equal(specialBookLabel("The Wicked + The Divine: 1923", "The Wicked + The Divine"), "1923");
  assert.equal(specialBookLabel("The Wicked + The Divine — Christmas Annual", "The Wicked + The Divine"), "Christmas Annual");
  assert.equal(specialBookLabel("The Funnies", "The Wicked + The Divine"), "The Funnies");
});

test("editionBookLabel numbers multi-book collected series", () => {
  assert.equal(editionBookLabel({ role: "collected", seriesTitle: "Saga TPB", issueNumber: "3", seriesBookCount: 9 }), "Vol. 3");
  assert.equal(editionBookLabel({ role: "collected", seriesTitle: "Saga Deluxe", issueNumber: "1", seriesBookCount: 1 }), "Saga Deluxe");
});

test("compareEditionBooks orders series year before comic issue number", () => {
  const books = [
    { series_year: 2020, issue_number: "10" },
    { series_year: 2019, issue_number: "4" },
    { series_year: 2020, issue_number: "2" },
  ].sort(compareEditionBooks);
  assert.deepEqual(books.map((book) => book.issue_number), ["4", "2", "10"]);
});
