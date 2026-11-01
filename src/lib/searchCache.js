export const SEARCH_CACHE_REVALIDATE_SECONDS = 600;

// Series cards shown above the issue results on /search (server render and
// client refetch must ask for the same number).
export const SERIES_SHELF_SIZE = 8;

// Work entries shown on the search results page.
export const SEARCH_WORKS_SIZE = 24;

export function normalizeSearchCacheTerm(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function sliceSearchResults(rows, { limit, offset = 0 } = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeOffset = Math.max(0, Math.trunc(Number(offset) || 0));
  const safeLimit = Math.max(0, Math.trunc(Number(limit) || 0));
  return safeRows.slice(safeOffset, safeOffset + safeLimit);
}

// A rejected unstable_cache computation is not persisted. Encoding the usable
// fallback in the error lets callers return it without repeating expensive DB
// work, while preserving the existing "degraded responses are never cached"
// contract.
export class DegradedSearchError extends Error {
  constructor(result) {
    super("Search completed with degraded data");
    this.name = "DegradedSearchError";
    this.result = result;
  }
}
