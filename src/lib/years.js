// Extract a catalog year from numeric values or display/ISO-like date text.
export function parseYear(value) {
  if (value == null || value === "") return null;

  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 1800 && value < 2200 ? value : null;
  }

  const match = String(value).match(/\b(?:18|19|20|21)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

export function bestYearFor(row) {
  return parseYear(row?.publication_date) ?? parseYear(row?.key_date);
}
