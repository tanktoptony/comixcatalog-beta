import test from "node:test";
import assert from "node:assert/strict";
import { canSeeComic, printingLabel, reviewActionToUpdate, validateUpc } from "./review.js";

test("validateUpc accepts empty or 12 to 18 digits", () => {
  assert.equal(validateUpc(""), true);
  assert.equal(validateUpc("123456789012"), true);
  assert.equal(validateUpc("123456789012345678"), true);
  assert.equal(validateUpc("123-456789012"), false);
  assert.equal(validateUpc("123"), false);
});

test("printingLabel uses a name or a readable kind fallback", () => {
  assert.equal(printingLabel("variant", " Cover B "), "Cover B");
  assert.equal(printingLabel("newsstand", ""), "Newsstand");
  assert.equal(printingLabel("reprint"), "Reprint or 2nd print");
});

test("canSeeComic allows approved, creator, and admin", () => {
  assert.equal(canSeeComic({ review_status: "approved" }, null, "admin"), true);
  assert.equal(canSeeComic({ review_status: "pending", created_by: "me" }, "me", "admin"), true);
  assert.equal(canSeeComic({ review_status: "denied", created_by: "them" }, "admin", "admin"), true);
  assert.equal(canSeeComic({ review_status: "pending", created_by: "them" }, "me", "admin"), false);
});

test("reviewActionToUpdate maps exact statuses and audit columns", () => {
  const printing = reviewActionToUpdate("printings", "duplicate", " same ", "admin");
  assert.equal(printing.status, "duplicate");
  assert.equal(printing.reviewed_by, "admin");
  assert.equal(printing.review_note, "same");
  assert.match(printing.reviewed_at, /^\d{4}-\d{2}-\d{2}T/);
  const book = reviewActionToUpdate("books", "approve", "", "admin");
  assert.equal(book.review_status, "approved");
  assert.equal(book.review_note, null);
  assert.equal(reviewActionToUpdate("books", "duplicate", "", "admin"), null);
});
