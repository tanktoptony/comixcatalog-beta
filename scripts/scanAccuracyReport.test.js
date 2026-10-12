import test from "node:test";
import assert from "node:assert/strict";
import { classifyScanOutcome, OUTCOMES } from "./lib/scanAccuracyReport.js";

const candidate = { gcd_issue_id: 101 };

test("classifies stored scan outcomes without treating a choice as proof of an add", () => {
  assert.equal(classifyScanOutcome({ outcome: "matched", candidates: [candidate], chosen_gcd_issue_id: 101 }), OUTCOMES.selectedSuggestion);
  assert.equal(classifyScanOutcome({ outcome: "matched", candidates: [candidate], chosen_gcd_issue_id: 202 }), OUTCOMES.corrected);
  assert.equal(classifyScanOutcome({ outcome: "matched", candidates: [candidate], chosen_gcd_issue_id: null }), OUTCOMES.abandoned);
  assert.equal(classifyScanOutcome({ outcome: "not_in_catalog" }), OUTCOMES.notInCatalog);
  assert.equal(classifyScanOutcome({ outcome: "not_a_comic" }), OUTCOMES.noMatch);
  assert.equal(classifyScanOutcome({ outcome: "error" }), OUTCOMES.error);
});
