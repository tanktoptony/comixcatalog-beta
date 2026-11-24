import { test } from "node:test";
import assert from "node:assert/strict";
import { issueLabel, reviewQueueLabel, reviewQueueUrl } from "./reviewQueueNotify.js";

test("reviewQueueLabel counts each kind and skips empty ones", () => {
  assert.equal(reviewQueueLabel({ requests: 1 }), "1 book request waiting for review");
  assert.equal(reviewQueueLabel({ requests: 40, printings: 2 }), "40 book requests and 2 printing reports waiting for review");
  assert.equal(reviewQueueLabel({ requests: 3, printings: 1, books: 2 }), "3 book requests, 1 printing report and 2 user-added books waiting for review");
  assert.equal(reviewQueueLabel({ books: 1 }), "1 user-added book waiting for review");
  assert.equal(reviewQueueLabel({}), null);
});

test("reviewQueueUrl opens the tab with the new item", () => {
  assert.equal(reviewQueueUrl("requests"), "/admin/review?tab=requests");
  assert.equal(reviewQueueUrl(null), "/admin/review");
});

test("issueLabel names the series, year, issue and version", () => {
  assert.equal(issueLabel({ seriesName: "The Avengers", seriesYear: 1963, issueNumber: "243" }), "The Avengers (1963) #243");
  assert.equal(issueLabel({ seriesName: "X-Men", seriesYear: 2024, issueNumber: "24 (324)", variantName: "Clayton Crain Cover" }), "X-Men (2024) #24 (324), Clayton Crain Cover");
  assert.equal(issueLabel({ seriesName: "Teenage Mutant Ninja Turtles Free Comic Book Day [2023]", seriesYear: 2023, issueNumber: "[nn]" }), "Teenage Mutant Ninja Turtles Free Comic Book Day [2023] (2023) [nn]");
  assert.equal(issueLabel({ seriesName: "Saga", issueNumber: "" }), "Saga");
});
