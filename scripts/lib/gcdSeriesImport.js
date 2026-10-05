const PLACEHOLDER_NAMES = new Set(["[no title]", "[unknown]", "unknown", "untitled"]);

export function gcdIdFromUrl(url, resource) {
  const match = String(url ?? "").match(new RegExp(`/api/${resource}/(\\d+)/`));
  return match ? Number(match[1]) : null;
}

export function parseIssueDescriptor(descriptor) {
  const value = String(descriptor ?? "").trim();
  if (!value) return { issueNumber: null, variant: null };
  const match = value.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
  return match
    ? { issueNumber: match[1].trim() || null, variant: match[2].trim() || null }
    : { issueNumber: value, variant: null };
}

export function baseIssueNumber(value) {
  const match = String(value ?? "").trim().match(/^(\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}

export function qualifiesForCatalogImport(row) {
  const country = String(row?.country ?? "").trim().toLowerCase();
  const language = String(row?.language ?? "").trim().toLowerCase();
  const name = String(row?.name ?? "").trim();
  return (
    (country === "us" || country === "ca") &&
    language === "en" &&
    name.length > 0 &&
    !PLACEHOLDER_NAMES.has(name.toLowerCase()) &&
    Array.isArray(row?.active_issues) &&
    row.active_issues.length > 0
  );
}

export function provisionalIssueRows(seriesRow) {
  const urls = seriesRow?.active_issues ?? [];
  const descriptors = seriesRow?.issue_descriptors ?? [];
  return urls.map((url, index) => ({
    gcd_id: gcdIdFromUrl(url, "issue"),
    series_gcd_id: gcdIdFromUrl(seriesRow.api_url, "series"),
    publisher_gcd_id: gcdIdFromUrl(seriesRow.publisher, "publisher"),
    issue_number: String(descriptors[index] ?? "").trim() || null,
    title: null,
    publication_date: null,
    key_date: null,
  })).filter((row) => row.gcd_id && row.series_gcd_id);
}

export function cachedIssueCount(issueRows) {
  const numbers = new Set(issueRows.map((row) => baseIssueNumber(row.issue_number)).filter(Boolean));
  return numbers.size;
}
