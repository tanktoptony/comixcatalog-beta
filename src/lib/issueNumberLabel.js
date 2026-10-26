// GCD writes an unnumbered book as "[nn]": nearly every trade paperback,
// hardcover, omnibus and one-shot. Pages showed those as "#[nn]".
const UNNUMBERED = new Set(["[nn]", "nn", "(nn)"]);

export function isUnnumberedIssue(value) {
  return UNNUMBERED.has(String(value ?? "").trim().toLowerCase());
}

// " #12" for a numbered issue, "" for an unnumbered book or a missing number.
export function issueNumberSuffix(value) {
  const s = String(value ?? "").trim();
  return s && !isUnnumberedIssue(s) ? ` #${s}` : "";
}
