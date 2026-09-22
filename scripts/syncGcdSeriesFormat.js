// Mirror GCD's publishing_format / binding / notes onto gcd_series (migration
// 0028) from GCD's live API, so collected editions can be told apart from
// the runs they collect. See src/lib/seriesFormat.js for how it's consumed.
//
// Resumable and throttled: GCD rate-limits hard (429 with a Retry-After of
// minutes after well under 100 requests; see refreshGcdIssuesFromApi.js).
// Each run does at most --limit rows, skips rows already synced, and stops
// dead on a 429. A scheduled workflow re-runs it until the backlog is gone.
//
// Usage:
//   node scripts/syncGcdSeriesFormat.js --source=shared-pins [--limit=80]
//   node scripts/syncGcdSeriesFormat.js --source=dup-titles  [--limit=80]
//   node scripts/syncGcdSeriesFormat.js --gcd-ids=21639,10549
//   ... add --dry-run to fetch and print without writing.
//
// Sources, in priority order:
//   shared-pins  gcd_series rows behind `series` rows that share a
//                comicvine_volume_id with another series row (the 614
//                volumes / 1,623 rows found 2026-09-21). These are the ones
//                actively producing wrong pages. ~1 hour of API time total.
//   dup-titles   gcd_series rows behind allowlisted `series` rows whose title
//                appears more than once (19k groups / 52k rows). Days of API
//                time; the weekly job walks it.

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { isCollectedEdition } from "../src/lib/seriesFormat.js";

dotenv.config({ path: ".env.local", quiet: true });

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? true];
  })
);
const DRY_RUN = Boolean(args["dry-run"]);
const SLEEP_MS = Number(args.sleep ?? 2000);
const LIMIT = args.limit ? Number(args.limit) : 80;
const SOURCE = args.source ?? (args["gcd-ids"] ? "ids" : "shared-pins");

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const UA = { "User-Agent": "Mozilla/5.0 (ComixCatalog gcd-series-format-sync; contact via repo)", Accept: "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class RateLimited extends Error {
  constructor(retryAfterSeconds) {
    super(`GCD rate-limited us. Retry-After: ${retryAfterSeconds}s (~${Math.ceil(retryAfterSeconds / 60)} min). Stopping run.`);
  }
}

async function fetchJson(url, tries = 2) {
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return res.json();
    if (res.status === 429) throw new RateLimited(Number(res.headers.get("retry-after") ?? 60));
    if (res.status === 404) return null;
    if (res.status >= 500 && attempt < tries) { await sleep(SLEEP_MS * 2 * attempt); continue; }
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }
  throw new Error(`Failed after ${tries} attempts: ${url}`);
}

// Keyset walk of `series`; PostgREST caps reads at 1000 silently.
async function allSeriesRows(select, filter) {
  const rows = [];
  let last = null;
  for (;;) {
    let q = filter(supabase.from("series").select(select)).order("id").limit(1000);
    if (last) q = q.gt("id", last);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
    last = data[data.length - 1].id;
  }
  return rows;
}

async function candidateGcdIds() {
  if (SOURCE === "ids") {
    return String(args["gcd-ids"]).split(",").map((s) => Number(s.trim())).filter(Boolean);
  }
  const rows = await allSeriesRows("id, title, gcd_id, comicvine_volume_id", (q) =>
    q.not("gcd_id", "is", null).not("resolved_publisher_cached", "is", null).not("year_start_cached", "is", null)
  );
  if (SOURCE === "shared-pins") {
    const byVol = new Map();
    for (const r of rows) {
      if (!r.comicvine_volume_id) continue;
      if (!byVol.has(r.comicvine_volume_id)) byVol.set(r.comicvine_volume_id, []);
      byVol.get(r.comicvine_volume_id).push(r.gcd_id);
    }
    return [...new Set([...byVol.values()].filter((g) => g.length > 1).flat())];
  }
  if (SOURCE === "dup-titles") {
    const byTitle = new Map();
    for (const r of rows) {
      const k = r.title.trim().toLowerCase();
      if (!byTitle.has(k)) byTitle.set(k, []);
      byTitle.get(k).push(r.gcd_id);
    }
    return [...new Set([...byTitle.values()].filter((g) => g.length > 1).flat())];
  }
  throw new Error(`unknown --source=${SOURCE}`);
}

// Drop ids already synced. Chunked .in() with a small chunk so no single
// query can exceed PostgREST's 1000-row cap.
async function unsynced(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data, error } = await supabase.from("gcd_series").select("gcd_id, format_synced_at").in("gcd_id", chunk);
    if (error) throw error;
    const synced = new Set((data ?? []).filter((r) => r.format_synced_at).map((r) => r.gcd_id));
    const known = new Set((data ?? []).map((r) => r.gcd_id));
    for (const id of chunk) if (known.has(id) && !synced.has(id)) out.push(id);
  }
  return out;
}

async function run() {
  const all = await candidateGcdIds();
  const todo = SOURCE === "ids" ? all : await unsynced(all);
  console.log(`source=${SOURCE}: ${all.length} candidate gcd_series, ${todo.length} not yet synced, doing up to ${LIMIT} this run${DRY_RUN ? " (dry run)" : ""}`);

  let done = 0, collected = 0, missing = 0;
  for (const gcdId of todo.slice(0, LIMIT)) {
    let json;
    try {
      json = await fetchJson(`https://www.comics.org/api/series/${gcdId}/?format=json`);
    } catch (err) {
      if (err instanceof RateLimited) {
        console.error(`\n${err.message}`);
        process.exitCode = 3; // lets the workflow skip further GCD calls this run
        break;
      }
      console.error(`  gcd ${gcdId}: ${err.message}`);
      await sleep(SLEEP_MS);
      continue;
    }
    if (!json) { missing += 1; console.log(`  gcd ${gcdId}: 404 on GCD (deleted/merged), marking synced with no format`); }
    const row = {
      publishing_format: json?.publishing_format?.trim() || null,
      binding: json?.binding?.trim() || null,
      format_notes: json?.notes?.trim() || null,
      format_synced_at: new Date().toISOString(),
    };
    const ce = isCollectedEdition(row);
    if (ce) collected += 1;
    console.log(`  gcd ${gcdId} ${json?.name ?? "?"} (${json?.year_began ?? "?"}): ${row.publishing_format ?? "-"} / ${row.binding ?? "-"}${ce ? "  <- COLLECTED EDITION" : ""}`);
    if (!DRY_RUN) {
      const { error } = await supabase.from("gcd_series").update(row).eq("gcd_id", gcdId);
      if (error) { console.error(`  write failed for ${gcdId}: ${error.message}`); }
    }
    done += 1;
    await sleep(SLEEP_MS);
  }
  console.log(`\nSynced ${done} (collected editions: ${collected}, gone from GCD: ${missing}). Remaining in backlog: ${Math.max(0, todo.length - done)}.`);
}

run().catch((err) => { console.error(err); process.exit(1); });
