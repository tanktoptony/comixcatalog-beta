import { publisherMatches } from "../csvImport/matchRow.js";

export const IMPORT_FIELDS = [
  "series", "issue", "publisher", "year", "variant", "grade", "slab_company",
  "cert", "price_paid", "notes", "quantity", "status",
];

const SYNONYMS = {
  series: ["series", "title", "series name", "comic title"],
  issue: ["issue", "issue #", "issue number", "number", "no."],
  publisher: ["publisher"],
  year: ["year", "release date", "cover date", "publication date", "release year"],
  variant: ["variant", "variant description", "cover"],
  grade: ["grade", "condition", "cgc grade"],
  slab_company: ["grading company", "graded by", "slab"],
  cert: ["slab certification number", "cert", "cert #", "certification number"],
  price_paid: ["purchase price", "price paid", "paid", "cost"],
  notes: ["notes"],
  quantity: ["quantity", "qty", "copies", "count"],
  status: ["list", "status", "collection status", "in collection", "wishlist"],
};

export function normalizeHeader(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const FIELD_BY_HEADER = new Map(
  Object.entries(SYNONYMS).flatMap(([field, names]) => names.map((name) => [normalizeHeader(name), field]))
);

export function autoMapHeaders(headers = []) {
  return Object.fromEntries(headers.map((header) => [header, FIELD_BY_HEADER.get(normalizeHeader(header)) ?? ""]));
}

export function parseYear(value) {
  const match = String(value ?? "").match(/(?:^|\D)((?:18|19|20|21)\d{2})(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

export function parseGrade(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/(?:^|\s)(10(?:\.0)?|[0-9](?:\.\d)?)(?:\s|$)/);
  if (match) {
    const numeric = Number(match[1]);
    if (numeric >= 0.5 && numeric <= 10) return { numeric, condition: null };
  }
  return { numeric: null, condition: text || null };
}

export function parsePrice(value) {
  const text = String(value ?? "").trim().replace(/[$,]/g, "");
  if (!text || !/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const price = Number(text);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function clampQuantity(value) {
  const quantity = Math.floor(Number(value));
  return Number.isFinite(quantity) ? Math.min(20, Math.max(1, quantity)) : 1;
}

// Owned copies for one commit batch. Copies are counted across the batch,
// not per row: CLZ lists each copy on its own row (ASM #300 as a CGC 9.8
// and again as a raw 6.0), so two rows for one issue are two copies. The
// first N slots of an issue map onto the N copies already in the library,
// which keeps a re-import of the same file from adding anything.
// existing: Map(issueId -> { count, maxCopy }) read before this batch.
export function planOwnedCopies(rows, existing = new Map()) {
  const slots = new Map();
  const inserts = [];
  const outcomes = [];
  for (const row of rows) {
    const issueId = Number(row.gcd_issue_id);
    const { count = 0, maxCopy = 0 } = existing.get(issueId) ?? {};
    let added = 0;
    for (let n = 0; n < clampQuantity(row.quantity); n += 1) {
      const slot = slots.get(issueId) ?? 0;
      slots.set(issueId, slot + 1);
      if (slot < count) continue;
      inserts.push({ row, copy_number: maxCopy + (slot - count) + 1 });
      added += 1;
    }
    outcomes.push(added ? { i: row.i, outcome: "imported", inserted: added } : { i: row.i, outcome: "skipped_existing" });
  }
  return { inserts, outcomes };
}

// Splits like splitBatches, but rows that share a key stay in one batch so
// planOwnedCopies sees every copy of an issue together. A group bigger than
// a batch is cut at the batch size (nobody owns 200 copies of one issue).
export function splitBatchesBy(rows, keyOf, size = 200) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const batches = [];
  let current = [];
  for (const group of groups.values()) {
    const rowsForKey = group.slice(0, size);
    if (current.length + rowsForKey.length > size) { batches.push(current); current = []; }
    current.push(...rowsForKey);
  }
  if (current.length) batches.push(current);
  return batches;
}

// "X-Men (1991)", "Amazing Spider-Man (1963 - 1998)", "Amazing Spider-Man,
// The", "Saga, Vol. 2": the title the catalog knows, plus the series start
// year when the export carries one. A start year separates Rai (1992) from
// Rai (2014) far better than an issue's cover year.
export function splitSeriesTitle(raw) {
  let title = String(raw ?? "").trim();
  let seriesYear = null;
  const years = title.match(/\s*\(((?:18|19|20)\d{2})(?:\s*[-–]\s*(?:(?:18|19|20)\d{2}|present|now)?)?\)\s*$/i);
  if (years) {
    seriesYear = Number(years[1]);
    title = title.slice(0, years.index).trim();
  }
  title = title.replace(/,?\s+vol(?:ume|\.)?\s*\d+$/i, "").trim();
  const article = title.match(/^(.*),\s*(the|a|an)$/i);
  if (article) title = `${article[2][0].toUpperCase()}${article[2].slice(1).toLowerCase()} ${article[1]}`;
  return { title, seriesYear };
}

export function wishlistFromFilename(filename) {
  return /(?:wish|want)/i.test(String(filename ?? ""));
}

export function statusFromValue(value, fallback = "owned") {
  const normalized = normalizeHeader(value);
  if (!normalized) return fallback;
  return /wish|wanted|wantlist/.test(normalized) ? "wishlist" : "owned";
}

export function splitBatches(rows, size = 200) {
  const batches = [];
  for (let index = 0; index < rows.length; index += size) batches.push(rows.slice(index, index + size));
  return batches;
}

export async function runSequentialBatches(rows, worker, size = 200) {
  const merged = [];
  for (const batch of splitBatches(rows, size)) merged.push(...(await worker(batch)));
  return merged.sort((a, b) => a.i - b.i);
}

// Among the volumes that have an issue number: the issue's own cover year
// first (a year either side, for off-by-one dating), then the publisher.
// Every holder still tied is returned, so a single result is a confident
// match and more than one means the collector picks.
export function narrowHolders(holders, { issueYear, publisher } = {}) {
  let pool = holders;
  const year = Number(issueYear);
  if (pool.length > 1 && Number.isFinite(year) && year > 1800) {
    const byYear = pool.filter((holder) => {
      const coverYear = Number(String(holder.issue?.key_date ?? "").slice(0, 4));
      return coverYear > 1800 && Math.abs(coverYear - year) <= 1;
    });
    if (byYear.length) pool = byYear;
  }
  if (pool.length > 1 && publisher) {
    const byPublisher = pool.filter((holder) => publisherMatches(holder.series?.resolved_publisher_cached, publisher));
    if (byPublisher.length) pool = byPublisher;
  }
  return pool;
}
