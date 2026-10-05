import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { fetchAllPages } from "../src/lib/supabase/fetchAllPages.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CURSOR_FILE = path.resolve(__dirname, "../gcd-publisher-sync-cursor.json");
const SLEEP_MS = 2000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
  const [key, value] = a.slice(2).split("=");
  return [key, value ?? true];
}));
const legacyColumns = Boolean(args["legacy-columns"]);
const ids = args.ids ? String(args.ids).split(",").map(Number).filter(Number.isInteger) : [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class RateLimited extends Error {}
async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "ComixCatalog gcd-publisher-sync; contact via repo" } });
  if (response.status === 429) throw new RateLimited(`GCD rate limited this run. Retry-After: ${response.headers.get("retry-after") ?? "unknown"}s`);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

function publisherId(row) {
  const match = String(row.api_url ?? row.url ?? "").match(/\/publisher\/(\d+)\//);
  if (!match) throw new Error(`Publisher response has no numeric api_url: ${JSON.stringify(row)}`);
  return Number(match[1]);
}

function dbRow(row, syncedAt) {
  const value = { gcd_id: publisherId(row), name: row.name, year_began: row.year_began || null, year_ended: row.year_ended || null };
  if (!legacyColumns) Object.assign(value, { country: row.country || null, synced_at: syncedAt });
  return value;
}

async function upsert(rows) {
  if (legacyColumns) {
    for (const row of rows) {
      const { data, error } = await supabase
        .from("gcd_publishers")
        .update({ name: row.name, year_began: row.year_began, year_ended: row.year_ended })
        .eq("gcd_id", row.gcd_id)
        .select("gcd_id");
      if (error) throw error;
      if (!data?.length) {
        const { error: insertError } = await supabase.from("gcd_publishers").insert(row);
        if (insertError) throw insertError;
      }
    }
    return;
  }
  const { error } = await supabase.from("gcd_publishers").upsert(rows, { onConflict: "gcd_id" });
  if (error) throw error;
}

function readCursor() {
  if (!fs.existsSync(CURSOR_FILE)) return { next_page: 1, started_at: null, completed_at: null };
  return JSON.parse(fs.readFileSync(CURSOR_FILE, "utf8"));
}
function writeCursor(cursor) {
  fs.writeFileSync(CURSOR_FILE, `${JSON.stringify(cursor, null, 2)}\n`);
}

async function reportStale(startedAt) {
  const local = await fetchAllPages(() => supabase.from("gcd_publishers").select("gcd_id, name, synced_at"), "gcd_id");
  const stale = local.filter((row) => !row.synced_at || new Date(row.synced_at) < new Date(startedAt));
  console.log(`Local publisher IDs not seen in this GCD pass: ${stale.length}`);
  if (stale.length) {
    console.log(stale.map((row) => `${row.gcd_id}\t${row.name}`).join("\n"));
    console.log(`Review, then run manually if appropriate (this script never deletes):\ndelete from public.gcd_publishers where gcd_id in (${stale.map((r) => r.gcd_id).join(", ")});`);
  }
}

async function main() {
  if (ids.length) {
    for (let i = 0; i < ids.length; i += 1) {
      if (i) await sleep(SLEEP_MS);
      const json = await fetchJson(`https://www.comics.org/api/publisher/${ids[i]}/?format=json`);
      console.log(JSON.stringify({ gcd_id: publisherId(json), name: json.name, country: json.country, year_began: json.year_began, year_ended: json.year_ended }));
      await upsert([dbRow(json, new Date().toISOString())]);
    }
    return;
  }

  const cursor = readCursor();
  if (cursor.completed_at && Date.now() - new Date(cursor.completed_at).getTime() < WEEK_MS) {
    console.log(`Publisher pass completed ${cursor.completed_at}; next weekly pass is not due.`);
    return;
  }
  if (cursor.completed_at) Object.assign(cursor, { next_page: 1, started_at: null, completed_at: null });
  cursor.started_at ||= new Date().toISOString();

  let page = Number(cursor.next_page || 1);
  while (true) {
    const json = await fetchJson(`https://www.comics.org/api/publisher/?format=json&page=${page}`);
    const results = json.results ?? [];
    await upsert(results.map((row) => dbRow(row, new Date().toISOString())));
    cursor.next_page = page + 1;
    writeCursor(cursor);
    console.log(`Synced publisher page ${page}: ${results.length} rows`);
    if (!json.next) break;
    page += 1;
    await sleep(SLEEP_MS);
  }
  cursor.completed_at = new Date().toISOString();
  cursor.next_page = 1;
  writeCursor(cursor);
  await reportStale(cursor.started_at);
}

main().catch((error) => {
  if (error instanceof RateLimited) {
    console.error(error.message);
    process.exitCode = 3;
    return;
  }
  console.error(error);
  process.exitCode = 1;
});
