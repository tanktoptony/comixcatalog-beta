import { publisherMatches } from "../csvImport/matchRow.js";

export const IMPORT_FIELDS = [
  "series", "issue", "full_title", "publisher", "year", "variant", "grade", "slab_company",
  "cert", "price_paid", "notes", "quantity", "status", "in_collection", "in_wishlist",
];

const SYNONYMS = {
  series: ["series", "title", "series name", "comic title"],
  issue: ["issue", "issue #", "issue number", "number", "no."],
  full_title: ["full title", "comic", "comic name"],
  publisher: ["publisher"],
  year: ["year", "release date", "cover date", "publication date", "release year"],
  variant: ["variant", "variant description", "cover"],
  grade: ["grade", "condition", "cgc grade"],
  slab_company: ["grading company", "graded by", "slab"],
  cert: ["slab certification number", "cert", "cert #", "certification number"],
  price_paid: ["purchase price", "price paid", "paid", "cost"],
  notes: ["notes"],
  quantity: ["quantity", "qty", "copies", "count"],
  status: ["list", "status", "collection status"],
  in_collection: ["in collection", "collection", "in my collection", "my collection", "owned"],
  in_wishlist: ["in wishlist", "in wish list", "on wishlist", "on wish list", "wishlist", "wanted", "want list"],
};

export function normalizeHeader(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const FIELD_BY_HEADER = new Map(
  Object.entries(SYNONYMS).flatMap(([field, names]) => names.map((name) => [normalizeHeader(name), field]))
);

// One column per field, the closest name winning. With both "Title" and
// "Series" in a file, "Title" is often the story title, and letting the last
// column win sent every row looking for a series called "The Final Night".
export function autoMapHeaders(headers = []) {
  const mapping = Object.fromEntries(headers.map((header) => [header, FIELD_BY_HEADER.get(normalizeHeader(header)) ?? ""]));
  const rank = (header) => SYNONYMS[mapping[header]].map(normalizeHeader).indexOf(normalizeHeader(header));
  const best = new Map();
  for (const header of headers) {
    if (!mapping[header]) continue;
    const held = best.get(mapping[header]);
    if (held == null || rank(header) < rank(held)) best.set(mapping[header], header);
  }
  for (const header of headers) if (mapping[header] && best.get(mapping[header]) !== header) mapping[header] = "";
  return mapping;
}

// League of Comic Geeks has no issue number column. The book is one cell,
// "Batman #125 Cover B Mattina Variant", and the Series column beside it can
// say just "Batman" for "Batman Annual #1", so this cell is the one to trust.
// A title with no "#" (a trade, "Saga Vol. 1 TP") returns null: reading that
// as Saga #1 would file a single issue the collector does not own.
export function splitFullTitle(raw) {
  const match = String(raw ?? "").trim().match(/^(.*?\S)\s*#\s*([^\s,;:]+)[,;:]?(?:\s+(.*))?$/);
  if (!match || !/\d|^[a-z]$|[½¼¾]/i.test(match[2])) return null;
  const variant = String(match[3] ?? "").replace(/^\(?of\s+\d+\)?\s*/i, "").trim();
  return { series: match[1].trim(), issue: match[2], variant: variant || null };
}

// League doesn't publish its column names, so a column is also recognised by
// what it holds: most of its values read as a whole book.
function holdsFullTitles(key, rows) {
  const values = rows.map((row) => row[key]).filter((value) => String(value ?? "").trim()).slice(0, 200);
  return values.length > 0 && values.filter(splitFullTitle).length / values.length >= 0.5;
}

export function autoMapColumns(headers = [], rows = []) {
  const mapping = autoMapHeaders(headers);
  if (!Object.values(mapping).includes("full_title")) {
    const fullTitle = headers.find((header) => holdsFullTitles(header, rows));
    if (fullTitle) mapping[fullTitle] = "full_title";
  }
  // Only a yes/no column is a list flag. A blank "Collection" column would read
  // as "not in the collection" and leave every row out, and one holding a
  // collection's name ("Main") says nothing about owning the book.
  for (const header of headers) {
    if (!["in_collection", "in_wishlist"].includes(mapping[header])) continue;
    const values = rows.map((row) => String(row[header] ?? "").trim()).filter(Boolean);
    if (!values.length || !values.every((value) => /^(\d+(\.0+)?|y|yes|n|no|t|true|f|false|x|-|none)$/i.test(value))) mapping[header] = "";
  }
  return mapping;
}

function cellText(cell) {
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? "" : cell.toISOString().slice(0, 10);
  return String(cell ?? "").trim();
}

// Rows of cells, from a CSV or a worksheet, into headers and row objects. The
// header is the first row naming at least two known columns, because a
// spreadsheet can carry a title line above it. A first row that is already a
// book means no header at all, and the columns get plain names.
export function tableFromGrid(grid = []) {
  const cells = grid.map((row) => row.map(cellText)).filter((row) => row.some(Boolean));
  if (!cells.length) return { headers: [], rows: [] };
  const width = Math.max(...cells.map((row) => row.length));
  const named = cells.slice(0, 10).findIndex((row) => Object.values(autoMapHeaders(row.filter(Boolean))).filter(Boolean).length >= 2);
  const headerless = named < 0 && cells[0].some(splitFullTitle);
  const start = Math.max(named, 0);
  const seen = new Map();
  const headers = Array.from({ length: width }, (_, column) => {
    const name = (!headerless && cells[start][column]) || `Column ${column + 1}`;
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return count > 1 ? `${name} (${count})` : name;
  });
  const body = cells.slice(headerless ? 0 : start + 1);
  return { headers, rows: body.map((row) => Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ""]))) };
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

// A workbook can hold several sheets. The biggest is the collection, and the
// page names it so anything left behind is not silently lost.
export function pickSheet(sheets = []) {
  const size = (sheet) => (sheet.data ?? []).filter((row) => row.some((cell) => cell != null && cell !== "")).length;
  const filled = sheets.filter((sheet) => size(sheet) > 0);
  const best = filled.reduce((held, sheet) => (!held || size(sheet) > size(held) ? sheet : held), null);
  return { sheet: best, others: filled.filter((sheet) => sheet !== best).map((sheet) => sheet.sheet) };
}

function flagOn(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return Boolean(text) && !/^(0|0\.0+|no|n|false|f|-|none)$/.test(text);
}

// League's export puts collection, wish list and read list books in one file.
// Returns "owned", "wishlist", "skip" for a book on neither (read list only:
// reading a comic is not owning it), or null when the file doesn't say.
export function listFromRow(row) {
  if (flagOn(row.in_collection)) return "owned";
  if (flagOn(row.in_wishlist)) return "wishlist";
  if (row.in_collection !== undefined) return "skip";
  if (/^read(list)?$/.test(normalizeHeader(row.status))) return "skip";
  return null;
}

// One raw row into what the resolver and commit read. A title like
// "X-Men (1991)" carries the series start year, which names the volume. The
// year column is the issue's own cover or release year; the resolver uses it
// to choose among the volumes that have the issue number.
export function mapRow(raw, i, mapping) {
  const row = { i };
  for (const [header, field] of Object.entries(mapping)) if (field) row[field] = raw[header];
  // A real issue column means the file already separates the two.
  const parsed = String(row.issue ?? "").trim() ? null : splitFullTitle(row.full_title);
  const named = splitSeriesTitle(parsed?.series ?? (row.series || row.full_title));
  const column = splitSeriesTitle(row.series);
  row.series = named.title;
  row.series_year = named.seriesYear ?? (normalizeHeader(column.title) === normalizeHeader(named.title) ? column.seriesYear : null);
  row.issue = String(row.issue ?? "").trim() || parsed?.issue;
  row.variant = row.variant || parsed?.variant || undefined;
  row.issue_year = parseYear(row.year);
  row.year = row.series_year ?? row.issue_year;
  const list = listFromRow(row);
  if (list === "skip") row.skip = true;
  else if (list) row.status = list;
  return row;
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
