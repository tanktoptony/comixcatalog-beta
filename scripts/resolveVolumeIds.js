// scripts/resolveVolumeIds.js
//
// Pre-resolves ComicVine volume IDs for entries in a gap-*.json file that
// don't have one. Converts brittle in-ingester title searches into
// deterministic by-id fetches.
//
// For each entry without a volume_id:
//   1. Probe CV's /search?resources=volume for the title.
//   2. Filter candidates by year (if entry.year is set) and publisher.
//   3. Pick the candidate with the largest issue_count — the canonical
//      run almost always has more issues than reprint/special volumes
//      sharing the same name.
//   4. Write volume_id back into the JSON. If zero usable candidates,
//      mark not_in_cv: true so future runs skip rather than re-probing.
//
// Usage:
//   node scripts/resolveVolumeIds.js gap-featured.json
//   node scripts/resolveVolumeIds.js gap-user-collected.json --year-tolerance=3
//   node scripts/resolveVolumeIds.js gap-width.json --limit=50
//
// Why this exists: ComicVine's free-tier search budget is 200/hour. The
// existing ingester does one search per gap target on every run; pre-
// resolving lets us spend those calls ONCE and amortize across every
// subsequent ingest.

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

const API_KEY = process.env.COMICVINE_API_KEY;
if (!API_KEY) {
  console.error("COMICVINE_API_KEY missing from .env.local");
  process.exit(1);
}

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const flags = Object.fromEntries(
  args
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    })
);

const target = positional[0];
if (!target) {
  console.error("Usage: node scripts/resolveVolumeIds.js <gap-file.json> [--limit=N] [--year-tolerance=N]");
  process.exit(1);
}

const yearTolerance = Number(flags["year-tolerance"] ?? 2);
const limit = flags.limit ? Number(flags.limit) : Infinity;

const filePath = path.resolve(target);
const entries = JSON.parse(readFileSync(filePath, "utf8"));

function normPublisher(s) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pickBest(candidates, entry) {
  // Filter by year (with tolerance) when entry.year is set.
  let pool = candidates;
  if (entry.year != null) {
    const filtered = pool.filter(
      (c) =>
        c.start_year != null &&
        Math.abs(Number(c.start_year) - Number(entry.year)) <= yearTolerance
    );
    if (filtered.length > 0) pool = filtered;
  }
  // Publisher filter — soft (don't strip pool to zero, only narrow when matches exist).
  if (entry.publisher) {
    const wantedPub = normPublisher(entry.publisher);
    const filtered = pool.filter((c) =>
      normPublisher(c.publisher?.name).includes(wantedPub.slice(0, 6)) ||
      wantedPub.includes(normPublisher(c.publisher?.name).slice(0, 6))
    );
    if (filtered.length > 0) pool = filtered;
  }
  // Largest issue_count wins — canonical run beats reprints/specials.
  pool.sort((a, b) => Number(b.count_of_issues ?? 0) - Number(a.count_of_issues ?? 0));
  return pool[0] ?? null;
}

async function probeOne(entry) {
  const url = new URL("https://comicvine.gamespot.com/api/search/");
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("format", "json");
  url.searchParams.set("resources", "volume");
  url.searchParams.set("query", entry.name);
  url.searchParams.set("limit", "20");
  url.searchParams.set("field_list", "id,name,start_year,count_of_issues,publisher");
  const res = await fetch(url, { headers: { "User-Agent": "ComixCatalog-Resolver/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.status_code !== 1) throw new Error(`CV: ${body.error}`);
  return body.results ?? [];
}

let resolved = 0, ghosts = 0, errors = 0, skipped = 0, processed = 0;

for (const entry of entries) {
  if (entry.volume_id != null) { skipped++; continue; }
  if (entry.not_in_cv) { skipped++; continue; }
  if (processed >= limit) break;
  processed++;

  process.stdout.write(`[${processed}] ${entry.name}${entry.year ? ` (${entry.year})` : ""} ... `);
  try {
    const candidates = await probeOne(entry);
    const best = pickBest(candidates, entry);
    if (best) {
      entry.volume_id = best.id;
      console.log(`id=${best.id} (${best.start_year}, ${best.count_of_issues} issues, ${best.publisher?.name ?? "?"})`);
      resolved++;
    } else {
      entry.not_in_cv = true;
      console.log(`no match — marked not_in_cv`);
      ghosts++;
    }
  } catch (e) {
    console.log(`ERROR ${e.message}`);
    errors++;
  }
  // CV velocity cap: 1 request/sec. 1.1s sleep keeps us safely under.
  await new Promise((r) => setTimeout(r, 1100));
}

writeFileSync(filePath, JSON.stringify(entries, null, 2) + "\n");

console.log(`\nDone.`);
console.log(`  resolved:  ${resolved}`);
console.log(`  ghosts:    ${ghosts} (marked not_in_cv)`);
console.log(`  errors:    ${errors}`);
console.log(`  skipped:   ${skipped} (already had volume_id or not_in_cv)`);
console.log(`  written to ${filePath}`);
