// Shared matching policy for linking external cover metadata to the GCD catalog.
// Keep the ingestion mirror in comicvine_api_to_supabase.py aligned with the
// fixture in scripts/fixtures/cover-match-cases.json when changing this file.

export function normalizeTitle(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/�/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function baseIssueNumber(value) {
  if (value == null) return null;
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}

export function pickSeriesByYear(candidates, targetYear, tolerance = 3) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  if (targetYear == null) return null;

  const scored = candidates
    .filter((candidate) => candidate.year_start_cached != null)
    .map((candidate) => ({
      candidate,
      delta: Math.abs(Number(candidate.year_start_cached) - Number(targetYear)),
    }))
    .sort((a, b) => a.delta - b.delta);
  if (scored.length === 0) return null;

  const [best, runnerUp] = scored;
  if (best.delta <= tolerance) return best.candidate;
  if (runnerUp && runnerUp.delta - best.delta >= 2 && best.delta <= 5) {
    return best.candidate;
  }
  return null;
}

export function createCoverMatcher(supabase) {
  const seriesIndex = { byExact: new Map(), byNormalized: new Map(), loaded: false };
  const issuesBySeries = new Map();

  async function loadSeriesIndex() {
    if (seriesIndex.loaded) return;
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("series")
        .select("gcd_id, title, year_start_cached, resolved_publisher_cached")
        .not("gcd_id", "is", null)
        .order("gcd_id")
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data?.length) break;
      for (const row of data) {
        if (!row.title) continue;
        const exact = seriesIndex.byExact.get(row.title) ?? [];
        exact.push(row);
        seriesIndex.byExact.set(row.title, exact);
        const key = normalizeTitle(row.title);
        if (key) {
          const normalized = seriesIndex.byNormalized.get(key) ?? [];
          normalized.push(row);
          seriesIndex.byNormalized.set(key, normalized);
        }
      }
      if (data.length < pageSize) break;
    }
    seriesIndex.loaded = true;
  }

  async function resolveSeriesGcdId({ title, year, publisher: _publisher }) {
    void _publisher;
    await loadSeriesIndex();
    const exact = seriesIndex.byExact.get(title) ?? [];
    const candidates = exact.length
      ? exact
      : seriesIndex.byNormalized.get(normalizeTitle(title)) ?? [];
    const chosen = pickSeriesByYear(candidates, year);
    return chosen ? Number(chosen.gcd_id) : null;
  }

  async function loadIssues(seriesGcdId) {
    const numericSeriesId = Number(seriesGcdId);
    if (issuesBySeries.has(numericSeriesId)) return issuesBySeries.get(numericSeriesId);
    const rows = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("gcd_issues")
        .select("gcd_id, issue_number")
        .eq("series_gcd_id", numericSeriesId)
        .order("gcd_id")
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < pageSize) break;
    }
    issuesBySeries.set(numericSeriesId, rows);
    return rows;
  }

  async function resolveGcdIssueId({ seriesGcdId, issueNumber }) {
    if (seriesGcdId == null) {
      return { gcdIssueId: null, matchConfidence: "unresolved" };
    }
    const issues = await loadIssues(seriesGcdId);
    const raw = String(issueNumber ?? "").trim();
    let candidates = issues.filter((issue) => String(issue.issue_number ?? "").trim() === raw);
    if (candidates.length === 0) {
      const base = baseIssueNumber(raw);
      if (base) candidates = issues.filter((issue) => baseIssueNumber(issue.issue_number) === base);
    }
    if (candidates.length === 1) {
      return { gcdIssueId: Number(candidates[0].gcd_id), matchConfidence: "resolved" };
    }
    return { gcdIssueId: null, matchConfidence: "series-only" };
  }

  return { resolveSeriesGcdId, resolveGcdIssueId };
}
