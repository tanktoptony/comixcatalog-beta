// Probe ComicVine for story arcs by name.
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

const API_KEY = process.env.COMICVINE_API_KEY;
const query = process.argv.slice(2).join(" ");
if (!query) { console.error('Usage: node scripts/probeCvArc.js "<arc name>"'); process.exit(1); }

const url = new URL("https://comicvine.gamespot.com/api/search/");
url.searchParams.set("api_key", API_KEY);
url.searchParams.set("format", "json");
url.searchParams.set("resources", "story_arc");
url.searchParams.set("query", query);
url.searchParams.set("limit", "20");
url.searchParams.set("field_list", "id,name,count_of_issues,publisher,deck");

const res = await fetch(url, { headers: { "User-Agent": "ComixCatalog-Probe/1.0" } });
const body = await res.json();
console.log(`Found ${body.results?.length ?? 0} arc(s) for "${query}":\n`);
console.log("  id        #iss   publisher          name");
console.log("  --------  -----  -----------------  ----------------------------------------");
for (const r of body.results ?? []) {
  const id = String(r.id).padEnd(8);
  const iss = String(r.count_of_issues ?? "?").padEnd(5);
  const pub = String(r.publisher?.name ?? "?").slice(0, 17).padEnd(17);
  console.log(`  ${id}  ${iss}  ${pub}  ${r.name}`);
}
console.log("\nTo ingest: node scripts/fetchStoryArc.js --arc=<id>");
