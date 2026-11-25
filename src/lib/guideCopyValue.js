// What one owned copy is worth from the guide already on an issue page
// (buildPriceGuide: dollars per grade), so the page can follow a grade change
// the moment it is saved. Same rules as the library and totals: it calls
// pcValueForCopy. Relative imports only.

import { pcValueForCopy } from "./pcValue.js";

// Returns { value, graded, graded_at, mine } or null. mine: the collector's own
// market value, which outranks the guide everywhere.
export function guideCopyValue(guide, copy) {
  if (!guide?.grades?.length || !copy) return null;
  const own = Number(copy.market_value);
  if (Number.isFinite(own) && own > 0) return { value: own, graded: false, graded_at: null, mine: true };
  const prices = Object.fromEntries(guide.grades.map((g) => [g.grade, Math.round(Number(g.value) * 100)]));
  const value = pcValueForCopy({ prices, pc_id: guide.pcId }, copy);
  if (!value) return null;
  return { value: value.value, graded: value.grade_used !== "ungraded", graded_at: value.graded_at, mine: false };
}

// "Near Mint", "CGC 9.4", "9.4, raw", or null when nothing is recorded.
export function copyGradeLabel(copy) {
  const slab = String(copy?.slab_company ?? "").trim();
  const grade = Number(copy?.grade_numeric);
  const hasGrade = copy?.grade_numeric != null && copy.grade_numeric !== "" && Number.isFinite(grade);
  if (slab) return hasGrade ? `${slab} ${grade.toFixed(1)}` : slab;
  if (hasGrade) return `${grade.toFixed(1)}, raw`;
  return String(copy?.condition ?? "").trim() || null;
}
