import { matchIssue } from "../../src/lib/csvImport/matchRow.js";

export function issueIdFromUrl(url) {
  const match = String(url ?? "").match(/\/api\/issue\/(\d+)\/?/);
  return match ? Number(match[1]) : null;
}

export function resolveIssueTitle(issue) {
  if (issue.title) return issue.title;
  return (issue.story_set ?? []).find((story) => story.type === "comic story" && story.title)?.title ?? null;
}

export function resolveBaseGcdIssueId(issueId, variantOfGcdId, knownIssues = new Map()) {
  if (!variantOfGcdId) return issueId;
  let current = Number(variantOfGcdId);
  const seen = new Set();
  while (current && !seen.has(current)) {
    seen.add(current);
    const parent = knownIssues.get(current);
    if (!parent) return current;
    if (parent.base_gcd_issue_id) return Number(parent.base_gcd_issue_id);
    if (!parent.variant_of_gcd_id) return current;
    current = Number(parent.variant_of_gcd_id);
  }
  return Number(variantOfGcdId);
}

export function issueRowsFromJson(issueId, seriesGcdId, issue, knownIssues = new Map(), syncedAt = new Date().toISOString()) {
  const variantOfGcdId = issueIdFromUrl(issue.variant_of);
  const variantName = issue.variant_name || null;
  return {
    issue: {
      gcd_id: Number(issueId),
      series_gcd_id: Number(seriesGcdId),
      issue_number: issue.number ?? null,
      title: resolveIssueTitle(issue),
      publication_date: issue.publication_date || null,
      key_date: issue.key_date || null,
      variant_of_gcd_id: variantOfGcdId,
      variant_name: variantName,
      base_gcd_issue_id: resolveBaseGcdIssueId(Number(issueId), variantOfGcdId, knownIssues),
    },
    details: {
      gcd_issue_id: Number(issueId),
      on_sale_date: issue.on_sale_date || null,
      price: issue.price || null,
      page_count: issue.page_count ?? null,
      barcode: issue.barcode || null,
      isbn: issue.isbn || null,
      indicia_publisher: issue.indicia_publisher || null,
      indicia_frequency: issue.indicia_frequency || null,
      notes: issue.notes || null,
      editing: issue.editing || null,
      variant_name: variantName,
      not_found: false,
      synced_at: syncedAt,
    },
  };
}

export function unmatchedCoverSeries(covers, issuesBySeries) {
  const unmatched = [];
  for (const cover of covers ?? []) {
    const seriesId = Number(cover.series_gcd_id);
    if (!seriesId || !cover.issue_number) continue;
    const baseIssues = (issuesBySeries.get(seriesId) ?? []).filter((issue) => !issue.variant_of_gcd_id);
    if (!matchIssue(baseIssues, cover.issue_number)) unmatched.push(cover);
  }
  return {
    covers: unmatched,
    seriesIds: [...new Set(unmatched.map((cover) => Number(cover.series_gcd_id)))],
  };
}

// Variant fields for a whole series from one /api/series/ response. GCD's
// issue_descriptors run parallel to active_issues: a base reads "40 (340)",
// a variant "40 (340) [Pere Pérez Cover]". A variant's parent is the base
// with the same number (the lowest id when GCD lists more than one).
// Returns Map(issueId -> { variant_of_gcd_id, variant_name, base_gcd_issue_id }).
export function variantFieldsFromSeriesJson(seriesJson) {
  const ids = (seriesJson?.active_issues ?? []).map(issueIdFromUrl);
  const descriptors = seriesJson?.issue_descriptors ?? [];
  const parsed = ids.map((id, index) => {
    const text = String(descriptors[index] ?? "").trim();
    const match = text.match(/^(.*?)\s*\[(.+)\]\s*$/);
    return { id, number: (match ? match[1] : text).trim(), variantName: match ? match[2].trim() : null };
  }).filter((row) => row.id);
  const baseByNumber = new Map();
  for (const row of parsed) {
    if (row.variantName) continue;
    const current = baseByNumber.get(row.number);
    if (current == null || row.id < current) baseByNumber.set(row.number, row.id);
  }
  const fields = new Map();
  for (const row of parsed) {
    if (!row.variantName) {
      fields.set(row.id, { variant_of_gcd_id: null, variant_name: null, base_gcd_issue_id: row.id });
      continue;
    }
    const base = baseByNumber.get(row.number);
    if (base) fields.set(row.id, { variant_of_gcd_id: base, variant_name: row.variantName, base_gcd_issue_id: base });
  }
  return fields;
}
