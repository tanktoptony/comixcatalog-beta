import assert from "node:assert/strict";
import test from "node:test";
import { reportSubmissionDecision, validateReportInput } from "./reports.js";

test("validates and trims report input", () => {
  const result = validateReportInput({
    target_type: "listing",
    target_id: "123e4567-e89b-42d3-a456-426614174000",
    reason: "scam",
    details: "  suspicious payment request  ",
  });
  assert.deepEqual(result.value, {
    target_type: "listing",
    target_id: "123e4567-e89b-42d3-a456-426614174000",
    reason: "scam",
    details: "suspicious payment request",
  });
});

test("rejects invalid enums and overlong details", () => {
  assert.equal(validateReportInput({ target_type: "book" }).error, "Invalid target type.");
  assert.equal(validateReportInput({ target_type: "user", target_id: "123e4567-e89b-42d3-a456-426614174000", reason: "rude" }).error, "Invalid reason.");
  assert.equal(validateReportInput({ target_type: "user", target_id: "123e4567-e89b-42d3-a456-426614174000", reason: "spam", details: "x".repeat(1001) }).error, "Details must be 1000 characters or fewer.");
});

test("allows the 10th report and refuses the 11th", () => {
  assert.equal(reportSubmissionDecision({ openDuplicate: null, reportsInLast24Hours: 9 }).kind, "allow");
  assert.equal(reportSubmissionDecision({ openDuplicate: null, reportsInLast24Hours: 10 }).kind, "limited");
});

test("returns an open duplicate even when the daily limit was reached", () => {
  const existing = { id: "report-id", status: "open" };
  assert.deepEqual(reportSubmissionDecision({ openDuplicate: existing, reportsInLast24Hours: 10 }), { kind: "duplicate", report: existing });
});
