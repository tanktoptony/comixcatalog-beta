import test from "node:test";
import assert from "node:assert/strict";
import { pdfGradeLabel } from "./pdfGrade.js";

test("formats a numeric slab grade with its company", () => {
  assert.equal(pdfGradeLabel({ grade_numeric: 9.8, slab_company: "CGC" }), "CGC 9.8");
});

test("formats a numeric raw grade with its standard abbreviation", () => {
  assert.equal(pdfGradeLabel({ grade_numeric: 9.4 }), "9.4 NM");
});

test("formats a condition-only grade with its standard abbreviation", () => {
  assert.equal(pdfGradeLabel({ condition: "Very Fine" }), "VF");
  assert.equal(pdfGradeLabel({ condition: "Fair" }), "FR");
  assert.equal(pdfGradeLabel({ condition: "Near Mint-" }), "NM-");
});

test("formats an ungraded copy as raw", () => {
  assert.equal(pdfGradeLabel({}), "Raw");
});
