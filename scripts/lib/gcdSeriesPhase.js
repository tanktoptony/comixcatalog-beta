import { normalizeTitle, normalizePublisher } from "../../src/lib/collectionReconcile.js";
import { resolvePublisher } from "../../src/lib/publisher.js";
import { isUsMarketSeries } from "../../src/lib/usMarket.js";

const clean = (value) =>
  value == null || !String(value).trim() ? null : String(value).trim();
const number = (value) =>
  value != null && Number.isFinite(Number(value)) ? Number(value) : null;

export function selectMissingSeries(rows, mirrorIds, { after = 0, limit = null } = {}) {
  const selected = rows
    .filter((row) => Number(row.gcd_id) > after)
    .filter((row) => !mirrorIds.has(Number(row.gcd_id)))
    .map((row) => ({ ...row, gcd_id: Number(row.gcd_id) }));
  return limit == null ? selected : selected.slice(0, limit);
}

export function matchPlaceholder(series, candidates) {
  const title = normalizeTitle(series.name);
  const publisher = normalizePublisher(series.resolved_publisher);
  const year = number(series.year_began);
  const matches = candidates.filter((candidate) =>
    candidate.gcd_id == null &&
    normalizeTitle(candidate.title) === title &&
    number(candidate.year_start_cached) === year &&
    normalizePublisher(candidate.resolved_publisher_cached) === publisher);
  if (matches.length === 1) return { kind: "exact", row: matches[0] };
  return { kind: matches.length ? "ambiguous" : "none", rows: matches };
}

export function mapGcdSeriesRow(row) {
  return {
    gcd_id: Number(row.gcd_id),
    name: clean(row.name),
    sort_name: clean(row.sort_name) ?? clean(row.name),
    year_began: number(row.year_began),
    year_ended: number(row.year_ended),
    publisher_gcd_id: Number(row.publisher_gcd_id),
    publishing_format: clean(row.publishing_format),
    binding: clean(row.binding),
    format_notes: clean(row.notes),
    publication_type: clean(row.publication_type),
  };
}

export function mapAppSeriesRow(row, publisher) {
  const resolvedPublisher = resolvePublisher({
    cv: null,
    candidates: [publisher.name],
    seriesTitle: row.name,
  });
  return {
    gcd_id: Number(row.gcd_id),
    title: clean(row.name),
    issue_count_cached: 0,
    year_start_cached: number(row.year_began),
    year_end_cached: number(row.year_ended) ?? number(row.year_began),
    resolved_publisher_cached: resolvedPublisher,
    us_market: isUsMarketSeries({
      publisherCountry: publisher.country,
      gcdPublisherName: publisher.name,
      resolvedPublisher,
    }),
    search_refreshed_at: null,
  };
}

export function placeholderUpdate(row, mapped) {
  return {
    gcd_id: mapped.gcd_id,
    ...(row.year_start_cached == null ? { year_start_cached: mapped.year_start_cached } : {}),
    ...(row.year_end_cached == null ? { year_end_cached: mapped.year_end_cached } : {}),
    ...(row.resolved_publisher_cached == null
      ? { resolved_publisher_cached: mapped.resolved_publisher_cached }
      : {}),
  };
}
