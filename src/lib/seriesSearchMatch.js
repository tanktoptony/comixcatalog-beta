export const SERIES_SEARCH_STOPWORDS = new Set(["a", "an", "and", "of", "the"]);

export function normalizeSeriesSearchWords(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function compactSeriesSearch(value) {
  return normalizeSeriesSearchWords(value).replaceAll(" ", "");
}

export function significantSeriesSearchWords(value) {
  return normalizeSeriesSearchWords(value)
    .split(" ")
    .filter((word) => word.length >= 2 && !SERIES_SEARCH_STOPWORDS.has(word));
}

export function titleHasAllSearchWords(title, query) {
  const wanted = significantSeriesSearchWords(query);
  if (wanted.length < 2) return false;
  const available = new Set(normalizeSeriesSearchWords(title).split(" "));
  return wanted.every((word) => available.has(word));
}

function trigrams(value) {
  const padded = `  ${compactSeriesSearch(value)} `;
  const values = [];
  for (let i = 0; i <= padded.length - 3; i += 1) values.push(padded.slice(i, i + 3));
  return values;
}

// Mirrors PostgreSQL pg_trgm similarity closely enough for the read-only
// candidate harness. PostgreSQL remains the authoritative implementation.
export function trigramSimilarity(left, right) {
  const a = new Set(trigrams(left));
  const b = new Set(trigrams(right));
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return a.size + b.size === 0 ? 0 : (2 * shared) / (a.size + b.size);
}

export function scoreSeriesSearchTitle(title, query) {
  const compactTitle = compactSeriesSearch(title);
  const compactQuery = compactSeriesSearch(query);
  const wordsTitle = normalizeSeriesSearchWords(title);
  const wordsQuery = normalizeSeriesSearchWords(query);
  if (!compactQuery) return 0;
  if (compactTitle === compactQuery) return 1000;
  if (wordsTitle === wordsQuery || wordsTitle.startsWith(`${wordsQuery} `)) return 800;
  if (compactTitle.startsWith(compactQuery)) {
    return 600 - Math.min(300, compactTitle.length - compactQuery.length);
  }
  if (compactTitle.includes(compactQuery)) {
    return 500 - Math.min(200, compactTitle.length - compactQuery.length);
  }
  if (titleHasAllSearchWords(title, query)) return 400;
  if (compactQuery.length >= 4) {
    const similarity = trigramSimilarity(compactTitle, compactQuery);
    if (similarity >= 0.32) return 100 + similarity * 100;
  }
  return 0;
}
