// Shared matching policy for linking external cover metadata to the GCD catalog.
// Keep the ingestion mirror in comicvine_api_to_supabase.py aligned with the
// fixture in scripts/fixtures/cover-match-cases.json when changing this file.

export function normalizeTitle(value) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/�/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return normalized.split(/\s+/).filter((token) => !["the", "a", "an"].includes(token)).join(" ");
}

export function baseIssueNumber(value) {
  if (value == null) return null;
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}

export function normalizePublisher(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

const PUBLISHER_FAMILIES = [
  ["marvel", /^(marvel|timelycomics|atlascomics)/],
  ["dc", /^(dc|dccomics|detectivecomics|nationalperiodicalpublications)/],
  ["dark-horse", /^darkhorse/],
  ["image", /^image(comics)?/],
  ["idw", /^idw/],
  ["boom", /^boom(studios)?/],
  ["dynamite", /^dynamite/],
  ["valiant", /^valiant/],
  ["oni", /^oni(press)?/],
  ["archie", /^archie/],
];

export function publisherFamily(value) {
  const normalized = normalizePublisher(value);
  if (!normalized) return null;
  return PUBLISHER_FAMILIES.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}

export function publishersCompatible(left, right) {
  const leftNormalized = normalizePublisher(left);
  const rightNormalized = normalizePublisher(right);
  if (!leftNormalized || !rightNormalized) return false;
  const leftFamily = publisherFamily(left);
  const rightFamily = publisherFamily(right);
  if (leftFamily || rightFamily) return leftFamily != null && leftFamily === rightFamily;
  return leftNormalized === rightNormalized;
}

export function filterSeriesByPublisher(candidates, publisher) {
  if (!publisher) return candidates;
  return candidates.filter((candidate) =>
    publishersCompatible(publisher, candidate.resolved_publisher_cached)
  );
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
  if (best.delta <= tolerance && (!runnerUp || runnerUp.delta - best.delta >= 2)) return best.candidate;
  return null;
}

export function createCoverMatcher(supabase) {
  const seriesIndex = { byExact: new Map(), byNormalized: new Map(), byGcdId: new Map(), loaded: false };
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
        seriesIndex.byGcdId.set(Number(row.gcd_id), row);
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

  async function resolveSeriesGcdId({ title, year, publisher }) {
    await loadSeriesIndex();
    const candidates = seriesIndex.byNormalized.get(normalizeTitle(title)) ?? [];
    const publisherCandidates = filterSeriesByPublisher(candidates, publisher);
    const chosen = pickSeriesByYear(publisherCandidates, year);
    return chosen ? Number(chosen.gcd_id) : null;
  }

  async function getSeriesCandidates({ title, publisher }) {
    await loadSeriesIndex();
    const candidates = seriesIndex.byNormalized.get(normalizeTitle(title)) ?? [];
    return filterSeriesByPublisher(candidates, publisher);
  }

  async function isSeriesPublisherCompatible(seriesGcdId, publisher) {
    await loadSeriesIndex();
    const series = seriesIndex.byGcdId.get(Number(seriesGcdId));
    if (!series || !publisher || !series.resolved_publisher_cached) return null;
    return publishersCompatible(publisher, series.resolved_publisher_cached);
  }

  async function loadIssues(seriesGcdId) {
    const numericSeriesId = Number(seriesGcdId);
    if (issuesBySeries.has(numericSeriesId)) return issuesBySeries.get(numericSeriesId);
    const rows = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("gcd_issues")
        .select("gcd_id, issue_number, title, publication_date, key_date, publisher_gcd_id")
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
    if (candidates.length > 1) {
      const signatures = new Set(candidates.map((issue) => JSON.stringify([
        issue.issue_number,
        issue.title,
        issue.publication_date,
        issue.key_date,
        issue.publisher_gcd_id,
      ])));
      // The local GCD mirror contains occasional duplicate rows with identical
      // catalog metadata but different gcd_id values. Treat those as one issue
      // and pick the stable lowest ID; genuinely distinct variants stay ambiguous.
      if (signatures.size === 1) {
        candidates = candidates.toSorted((a, b) => Number(a.gcd_id) - Number(b.gcd_id)).slice(0, 1);
      }
    }
    if (candidates.length === 1) {
      return { gcdIssueId: Number(candidates[0].gcd_id), matchConfidence: "resolved" };
    }
    return { gcdIssueId: null, matchConfidence: "series-only" };
  }

  function issueYear(issue) {
    // GCD publication_date is often display text ("February 1979"), while
    // key_date is ISO-like. Check both instead of letting a truthy display
    // date hide the machine-readable year.
    for (const value of [issue.key_date, issue.publication_date]) {
      const match = String(value ?? "").match(/\b(\d{4})\b/);
      if (match) return Number(match[1]);
    }
    return null;
  }

  async function resolveCoverLink({ title, publisher, issueNumber, coverYear }) {
    const seriesCandidates = await getSeriesCandidates({ title, publisher });
    const raw = String(issueNumber ?? "").trim();
    const base = baseIssueNumber(raw);
    const ranked = [];

    for (const series of seriesCandidates) {
      const issues = await loadIssues(series.gcd_id);
      let matches = issues.filter((issue) => String(issue.issue_number ?? "").trim() === raw);
      let evidence = 2;
      if (matches.length === 0 && base) {
        matches = issues.filter((issue) => baseIssueNumber(issue.issue_number) === base);
        evidence = 1;
      }
      if (matches.length === 0) continue;
      const deltas = matches
        .map(issueYear)
        .filter((year) => year != null && coverYear != null)
        .map((year) => Math.abs(year - Number(coverYear)));
      ranked.push({
        series,
        evidence,
        delta: deltas.length ? Math.min(...deltas) : null,
      });
    }

    ranked.sort((left, right) =>
      right.evidence - left.evidence
      || (left.delta ?? 999) - (right.delta ?? 999)
      || Number(left.series.gcd_id) - Number(right.series.gcd_id)
    );
    const [best, runnerUp] = ranked;
    if (!best) return { seriesGcdId: null, gcdIssueId: null, matchConfidence: "unresolved" };
    if (coverYear != null && (best.delta == null || best.delta > 3)) {
      return { seriesGcdId: null, gcdIssueId: null, matchConfidence: "unresolved" };
    }
    const tied = runnerUp
      && runnerUp.evidence === best.evidence
      && (runnerUp.delta ?? 999) - (best.delta ?? 999) < 2;
    if (tied) return { seriesGcdId: null, gcdIssueId: null, matchConfidence: "unresolved" };

    const seriesGcdId = Number(best.series.gcd_id);
    const issueResult = await resolveGcdIssueId({ seriesGcdId, issueNumber });
    return { seriesGcdId, ...issueResult };
  }

  return { resolveSeriesGcdId, resolveGcdIssueId, resolveCoverLink, isSeriesPublisherCompatible };
}
