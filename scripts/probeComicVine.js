// scripts/probeComicVine.js
//
// Search ComicVine for volume candidates by title. Prints id / name /
// publisher / start_year / issue count for every match so you can pick
// the right volume_id and drop it into gap-manual.json.
//
// Usage:
//   node scripts/probeComicVine.js "Geiger"
//   node scripts/probeComicVine.js "Geiger" --year=2021
//   node scripts/probeComicVine.js "Batman / Superman" --limit=20
//
// Tip: when CV returns more than one plausible match and the issue counts
// are close (the usual disambiguation tiebreaker the ingester relies on),
// this is the script to reach for.

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
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

const query = positional.join(" ").trim();
if (!query) {
  console.error('Usage: node scripts/probeComicVine.js "<title>" [--year=YYYY] [--limit=N]');
  process.exit(1);
}

const yearFilter = flags.year ? Number(flags.year) : null;
const limit = Number(flags.limit ?? 15);

const url = new URL("https://comicvine.gamespot.com/api/search/");
url.searchParams.set("api_key", API_KEY);
url.searchParams.set("format", "json");
url.searchParams.set("resources", "volume");
url.searchParams.set("query", query);
url.searchParams.set("limit", String(limit));
url.searchParams.set("field_list", "id,name,start_year,count_of_issues,publisher,deck");

console.log(`Probing ComicVine for "${query}"${yearFilter ? ` (year=${yearFilter})` : ""}...`);
console.log();

const res = await fetch(url, {
  headers: { "User-Agent": "ComixCatalog-Probe/1.0" },
});

if (!res.ok) {
  console.error(`ComicVine HTTP ${res.status}`);
  process.exit(1);
}

const body = await res.json();
if (body.status_code !== 1) {
  console.error(`CV error: ${body.error}`);
  process.exit(1);
}

let results = body.results ?? [];
if (yearFilter) {
  results = results.filter((r) => Number(r.start_year) === yearFilter);
}

if (!results.length) {
  console.log("No matches.");
  process.exit(0);
}

console.log(`Found ${results.length} candidate volume(s):`);
console.log();
console.log("  id        year   #iss   publisher                    name");
console.log("  --------  -----  -----  ---------------------------  ----------------------------------------");
for (const r of results) {
  const id = String(r.id).padEnd(8);
  const year = String(r.start_year ?? "?").padEnd(5);
  const issueCount = String(r.count_of_issues ?? "?").padEnd(5);
  const publisher = String(r.publisher?.name ?? "?").slice(0, 27).padEnd(27);
  const name = String(r.name ?? "");
  console.log(`  ${id}  ${year}  ${issueCount}  ${publisher}  ${name}`);
}
console.log();
console.log('Copy a row into gap-manual.json as:');
console.log('  { "name": "<title>", "publisher": "<publisher>", "year": <year>, "volume_id": <id> }');
