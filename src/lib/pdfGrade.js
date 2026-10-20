import { normalizeRawCondition } from "./valuation.js";

const NUMERIC_GRADE_LABELS = new Map([
  [10.0, "GM"],
  [9.9, "MT"],
  [9.8, "NM/MT"],
  [9.6, "NM+"],
  [9.4, "NM"],
  [9.2, "NM-"],
  [9.0, "VF/NM"],
  [8.5, "VF+"],
  [8.0, "VF"],
  [7.5, "VF-"],
  [7.0, "FN/VF"],
  [6.5, "FN+"],
  [6.0, "FN"],
  [5.5, "FN-"],
  [5.0, "VG/FN"],
  [4.5, "VG+"],
  [4.0, "VG"],
  [3.5, "VG-"],
  [3.0, "GD/VG"],
  [2.5, "GD+"],
  [2.0, "GD"],
  [1.8, "GD-"],
  [1.5, "FR/GD"],
  [1.0, "FR"],
  [0.5, "PR"],
]);

function formatNumericGrade(value) {
  const grade = Number(value);
  return Number.isFinite(grade) && grade >= 0.5 && grade <= 10
    ? grade.toFixed(1)
    : null;
}

function formatCondition(value) {
  const condition = String(value ?? "").trim();
  const suffix = condition.match(/[+-]$/)?.[0] ?? "";
  const normalized = normalizeRawCondition(
    suffix ? condition.slice(0, -1).trim() : condition
  );
  if (!normalized) return null;
  return `${normalized === "FA" ? "FR" : normalized}${suffix}`;
}

export function pdfGradeLabel({ grade_numeric, slab_company, condition } = {}) {
  const numeric = formatNumericGrade(grade_numeric);
  const slab = String(slab_company ?? "").trim();
  if (numeric && slab) return `${slab} ${numeric}`;
  if (numeric) {
    const abbreviation = NUMERIC_GRADE_LABELS.get(Number(numeric));
    return abbreviation ? `${numeric} ${abbreviation}` : numeric;
  }

  return formatCondition(condition) ?? "Raw";
}
