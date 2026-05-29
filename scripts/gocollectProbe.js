// One-off probe to discover GoCollect's API response shapes for the comic
// valuation flow, so src/lib/gocollect.js can be written against reality.
//
// Internal/personal use only (per GoCollect ToS): this just reads values for
// our own reference + to calibrate the eBay pipeline. Wiring it into
// user-facing valuations needs confirmed commercial/redistribution rights.
//
// Usage:
//   node scripts/gocollectProbe.js                       # searches "Amazing Spider-Man #1"
//   node scripts/gocollectProbe.js --search="Hulk #181"
//   node scripts/gocollectProbe.js --item-id=223124      # skip search, go straight to insights
//   node scripts/gocollectProbe.js --item-id=223124 --grade=9.8
//
// Reads GOCOLLECT_API_TOKEN from .env.local. Saves raw JSON to
// scripts/gocollect-sample-*.json for inspection.
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { writeFileSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const TOKEN = process.env.GOCOLLECT_API_TOKEN;
const BASE = "https://api.gocollect.com/v1";

const arg = (name, def = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : def;
};
const SEARCH = arg("search", "Amazing Spider-Man #1");
const ITEM_ID = arg("item-id");
const GRADE = arg("grade", "9.8");

if (!TOKEN) {
  console.error("✗ GOCOLLECT_API_TOKEN missing from .env.local");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" };

async function get(label, url) {
  console.log(`\n=== ${label} ===\nGET ${url}`);
  let resp;
  try {
    resp = await fetch(url, { headers });
  } catch (e) {
    console.log(`  network error: ${e.message}`);
    return null;
  }
  console.log(`  HTTP ${resp.status} ${resp.statusText}`);
  const text = await resp.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    console.log(`  (non-JSON body, first 300 chars): ${text.slice(0, 300)}`);
    return { status: resp.status, json: null };
  }
  return { status: resp.status, json };
}

function save(name, data) {
  const p = path.resolve(__dirname, `gocollect-sample-${name}.json`);
  writeFileSync(p, JSON.stringify(data, null, 2));
  console.log(`  saved → scripts/gocollect-sample-${name}.json`);
}

// Pull the first plausible numeric item id out of an unknown response shape.
function findItemId(json) {
  if (!json) return null;
  const arr = Array.isArray(json) ? json : json.data ?? json.results ?? json.items ?? [];
  const first = Array.isArray(arr) ? arr[0] : null;
  if (!first) return null;
  return first.id ?? first.item_id ?? first.cgc_id ?? null;
}

async function main() {
  console.log(`Token present: ${TOKEN.slice(0, 4)}…(${TOKEN.length} chars)`);

  let itemId = ITEM_ID;

  if (!itemId) {
    // Search param name is unconfirmed — try the common ones until one returns 200 w/ data.
    let searchJson = null;
    for (const param of ["query", "q", "name", "title", "search"]) {
      const r = await get(
        `collectibles search (?${param}=)`,
        `${BASE}/collectibles?${param}=${encodeURIComponent(SEARCH)}`
      );
      if (r && r.status === 200 && r.json) {
        searchJson = r.json;
        save("search", r.json);
        itemId = findItemId(r.json);
        console.log(`  → extracted item id: ${itemId ?? "(couldn't find one — inspect the saved file)"}`);
        break;
      }
      if (r && (r.status === 401 || r.status === 403)) {
        console.log(`  → auth/access problem (${r.status}). Token may lack API access; stop here.`);
        return;
      }
    }
    if (!searchJson) {
      console.log("\nSearch didn't return usable data with any common param name.");
      console.log("Grab the numeric item id from the GoCollect site and re-run with --item-id=<id>.");
      return;
    }
  }

  if (!itemId) return;

  const r = await get(
    `insights for item ${itemId} (grade ${GRADE})`,
    `${BASE}/insights/item/${itemId}?grade=${encodeURIComponent(GRADE)}`
  );
  if (r && r.json) save("insights", r.json);
  console.log("\nDone. Paste the two saved files (or their contents) and I'll write src/lib/gocollect.js.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
