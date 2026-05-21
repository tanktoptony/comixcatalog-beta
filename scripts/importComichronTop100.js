// importComichronTop100.js — build a popularity-ranked featured-series list
// from downloaded Comichron monthly Top 100 CSV files.
//
// Comichron publishes monthly comic sales data from Diamond Distribution at
// http://www.comichron.com/monthlycomicssales.html — each month has a CSV
// with the top 100 (or top 300) selling comics by estimated unit sales.
//
// Aggregation strategy:
//   For each title that appears in any monthly CSV, we count its appearances
//   across all months. A title in the top 100 every month for 2 years is a
//   stronger signal than one that hit #1 once. The output is sorted by
//   (appearance_count DESC, best_rank ASC) so consistent sellers lead.
//
// Output: src/lib/featuredSeries.js — { FEATURED_SERIES: [{title, publisher,
//   appearances, best_rank}, ...] }. /api/comics consumes this.
//
// Setup (do this once):
//   1. Visit comichron.com/monthlycomicssales.html
//   2. Download the CSVs for whichever years you want (recent = more relevant)
//   3. Put them in ./comichron-data/ (any nested structure OK)
//   4. Run: node scripts/importComichronTop100.js --dir=./comichron-data
//
// CSV format autodetect: looks for column headers matching /title|comic/,
// /publisher/, /rank|#/. Case-insensitive. Skips files that don't have
// title+publisher. Logs each file's parse result so failures are visible.

import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const DIR = path.resolve(args.dir ?? "./comichron-data");
const TOP_N = Number(args.top ?? 200); // how many series to keep in output
const OUT = path.resolve(
  __dirname,
  "..",
  args.out ?? "src/lib/featuredSeries.js"
);

// ── CSV parsing ──────────────────────────────────────────────────────────

// Naive but Comichron-friendly CSV parser: handles quoted fields with
// embedded commas, trims whitespace. Comichron doesn't use multi-line
// fields so a streaming parser would be overkill.
function parseCsv(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        cells.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}

function detectColumns(headerRow) {
  const lower = headerRow.map((h) => h.toLowerCase().trim());
  // Title column: prefer "title" or "comic-book title"; fall back to anything
  // containing "title" or "comic".
  const titleIdx = lower.findIndex((h) => /^title$|^comic.?book.?title$|^name$/.test(h));
  const titleIdxFuzzy = titleIdx >= 0 ? titleIdx : lower.findIndex((h) => /title|comic/.test(h));
  const publisherIdx = lower.findIndex((h) => /^publisher$/.test(h));
  const publisherIdxFuzzy = publisherIdx >= 0 ? publisherIdx : lower.findIndex((h) => /publisher/.test(h));
  const rankIdx = lower.findIndex((h) => /^rank$|^#$/.test(h));
  return {
    title: titleIdxFuzzy,
    publisher: publisherIdxFuzzy,
    rank: rankIdx,
  };
}

// "AMAZING SPIDER-MAN #1" → "Amazing Spider-Man" (strip issue #, normalize case)
function cleanTitle(raw) {
  if (!raw) return null;
  let t = String(raw).trim();
  // Strip trailing #issue and anything after
  t = t.replace(/\s*#\s*\d+.*$/, "");
  // Strip trailing variant/printing markers
  t = t.replace(/\s+\(.*\)$/, "");
  // Title-case if input is screaming caps
  if (t === t.toUpperCase() && t.length > 4) {
    t = t
      .toLowerCase()
      .split(" ")
      .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  }
  return t.trim() || null;
}

function cleanPublisher(raw) {
  if (!raw) return null;
  return String(raw).trim() || null;
}

// Walk a directory recursively yielding .csv paths.
function* walkCsv(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walkCsv(full);
    } else if (st.isFile() && entry.toLowerCase().endsWith(".csv")) {
      yield full;
    }
  }
}

// ── Aggregation ──────────────────────────────────────────────────────────

function aggregate(files) {
  // key = `${title}::${publisher}` — case-insensitive — value = stats
  const byKey = new Map();
  let filesParsed = 0;
  let filesSkipped = 0;
  let totalRows = 0;

  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch (err) {
      console.log(`  ✗ ${path.basename(file)} — read failed: ${err.message}`);
      filesSkipped += 1;
      continue;
    }
    const rows = parseCsv(text);
    if (rows.length < 2) {
      console.log(`  ✗ ${path.basename(file)} — empty or single-row file`);
      filesSkipped += 1;
      continue;
    }
    const header = rows[0];
    const cols = detectColumns(header);
    if (cols.title < 0 || cols.publisher < 0) {
      console.log(
        `  ✗ ${path.basename(file)} — couldn't find title/publisher columns ` +
          `(headers: ${header.join(",").slice(0, 100)}...)`
      );
      filesSkipped += 1;
      continue;
    }

    let rowsThisFile = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const title = cleanTitle(row[cols.title]);
      const publisher = cleanPublisher(row[cols.publisher]);
      const rank = cols.rank >= 0 ? Number(row[cols.rank]) : null;
      if (!title || !publisher) continue;

      const key = `${title.toLowerCase()}::${publisher.toLowerCase()}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          title,
          publisher,
          appearances: 1,
          best_rank: Number.isFinite(rank) ? rank : null,
        });
      } else {
        existing.appearances += 1;
        if (Number.isFinite(rank)) {
          existing.best_rank =
            existing.best_rank == null ? rank : Math.min(existing.best_rank, rank);
        }
      }
      rowsThisFile += 1;
      totalRows += 1;
    }
    console.log(`  ✓ ${path.basename(file)} — ${rowsThisFile} rows`);
    filesParsed += 1;
  }

  return { byKey, filesParsed, filesSkipped, totalRows };
}

// ── Output ───────────────────────────────────────────────────────────────

function renderJs(entries) {
  // Round-trippable JS module. Sorted by appearances DESC, then best_rank ASC.
  const sorted = [...entries].sort((a, b) => {
    if (b.appearances !== a.appearances) return b.appearances - a.appearances;
    return (a.best_rank ?? 999) - (b.best_rank ?? 999);
  });

  const lines = [];
  lines.push("// Auto-generated by scripts/importComichronTop100.js — DO NOT edit by hand.");
  lines.push("// To regenerate: drop fresh Comichron CSVs in ./comichron-data and re-run.");
  lines.push("//");
  lines.push(`// Generated: ${new Date().toISOString()}`);
  lines.push(`// Total titles: ${sorted.length}`);
  lines.push("");
  lines.push("export const FEATURED_SERIES = [");
  for (const e of sorted) {
    // JSON.stringify handles quoting safely
    lines.push(
      `  { title: ${JSON.stringify(e.title)}, publisher: ${JSON.stringify(e.publisher)}, ` +
        `appearances: ${e.appearances}, best_rank: ${e.best_rank ?? "null"} },`
    );
  }
  lines.push("];");
  lines.push("");
  return lines.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────

function main() {
  console.log(`Importing Comichron CSVs from: ${DIR}`);
  const files = [...walkCsv(DIR)];
  if (files.length === 0) {
    console.error(
      `\nNo .csv files found under ${DIR}.\n` +
        `Download Comichron monthly Top 100 CSVs from\n` +
        `  http://www.comichron.com/monthlycomicssales.html\n` +
        `and drop them in ${DIR} (or pass --dir=<path>).`
    );
    process.exit(1);
  }
  console.log(`Found ${files.length} CSV file(s).\n`);

  const { byKey, filesParsed, filesSkipped, totalRows } = aggregate(files);

  console.log(`\nParsed ${filesParsed}/${files.length} files (${filesSkipped} skipped).`);
  console.log(`Total rows aggregated: ${totalRows}`);
  console.log(`Distinct (title, publisher) pairs: ${byKey.size}`);

  const all = [...byKey.values()];
  const top = all
    .sort((a, b) => {
      if (b.appearances !== a.appearances) return b.appearances - a.appearances;
      return (a.best_rank ?? 999) - (b.best_rank ?? 999);
    })
    .slice(0, TOP_N);

  console.log(`\nTop 10 by appearances:`);
  for (const e of top.slice(0, 10)) {
    console.log(
      `  ${String(e.appearances).padStart(3)}× best #${e.best_rank ?? "?"}  ` +
        `${(e.publisher ?? "?").padEnd(20)}  ${e.title}`
    );
  }

  writeFileSync(OUT, renderJs(top));
  console.log(`\nWrote ${top.length} entries → ${OUT}`);
  console.log(`\nNext step: update /api/comics to consume FEATURED_SERIES.`);
}

main();
