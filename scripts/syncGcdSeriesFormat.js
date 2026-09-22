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

import { pathToFileURL } from "node:url";
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

// A page of a long walk can fail transiently without anything being wrong
// with the query: Postgres cancels it (57014) when the instance is busy,
// PostgREST loses its schema cache (PGRST002), or the TLS connection resets.
// Live 2026-09-22: every scheduled run of this job died on a single 57014
// and, because the workflow step was continue-on-error, reported green while
// syncing 0 rows. One bad page out of ~200 must not cost the whole run.
const TRANSIENT = new Set(["57014", "PGRST002", "PGRST001", "08006", "08003"]);
const isTransient = (error) =>
  TRANSIENT.has(error?.code) || /fetch failed|ECONNRESET|socket hang up|timeout/i.test(error?.message ?? "");

async function pageWithRetry(build, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { data, error } = await build();
    if (!error) return data ?? [];
    lastError = error;
    if (!isTransient(error) || attempt === attempts) break;
    const backoff = 1000 * 3 ** (attempt - 1);
    console.error(`  transient read error (attempt ${attempt}/${attempts}): ${error.code ?? "?"} | ${error.message} — retrying in ${backoff}ms`);
    await sleep(backoff);
  }
  throw new Error(`series walk failed after retries: ${lastError?.code ?? "?"} | ${lastError?.message ?? lastError}`);
}

// Keyset walk of `series`; PostgREST caps reads at 1000 silently.
async function allSeriesRows(select, filter) {
  const rows = [];
  let last = null;
  for (;;) {
    const data = await pageWithRetry(() => {
      let q = filter(supabase.from("series").select(select)).order("id").limit(1000);
      if (last) q = q.gt("id", last);
      return q;
    });
    rows.push(...data);
    if (data.length < 1000) break;
    last = data[data.length - 1].id;
  }
  return rows;
}

// Only ~3.8k of the 208k `series` rows carry a ComicVine pin, so shared-pins
// asks for those and reads 4 pages instead of 178. dup-titles genuinely needs
// every titled row and pays for the long walk; nothing but retries helps there.
const SOURCES = {
  "shared-pins": {
    select: "id, gcd_id, comicvine_volume_id",
    filter: (q) => q.not("comicvine_volume_id", "is", null),
    key: (r) => r.comicvine_volume_id,
  },
  "dup-titles": {
    select: "id, gcd_id, title",
    filter: (q) => q,
    key: (r) => r.title?.trim().toLowerCase() || null,
  },
};

async function candidateGcdIds() {
  if (SOURCE === "ids") {
    return String(args["gcd-ids"]).split(",").map((s) => Number(s.trim())).filter(Boolean);
  }
  const source = SOURCES[SOURCE];
  if (!source) throw new Error(`unknown --source=${SOURCE}`);

  const rows = await allSeriesRows(source.select, (q) =>
    source.filter(
      q.not("gcd_id", "is", null).not("resolved_publisher_cached", "is", null).not("year_start_cached", "is", null)
    )
  );

  // Group by the source's key; a key held by more than one series row is the
  // ambiguity we want GCD's format for.
  const groups = new Map();
  for (const r of rows) {
    const k = source.key(r);
    if (k === null || k === undefined) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r.gcd_id);
  }
  return [...new Set([...groups.values()].filter((g) => g.length > 1).flat())];
}

// Drop ids already synced. Chunked .in() with a small chunk so no single
// query can exceed PostgREST's 1000-row cap.
async function unsynced(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const data = await pageWithRetry(() =>
      supabase.from("gcd_series").select("gcd_id, format_synced_at").in("gcd_id", chunk)
    );
    const synced = new Set(data.filter((r) => r.format_synced_at).map((r) => r.gcd_id));
    const known = new Set(data.map((r) => r.gcd_id));
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

// Exported so the retry policy can be exercised against injected failures
// rather than only observed in production. See syncGcdSeriesFormat.test.js.
export { isTransient, pageWithRetry };

// Only auto-run when invoked directly, so importing this file for a test
// doesn't start a GCD sync.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) run().catch((err) => {
  // Supabase errors are plain objects; console.error(err) prints `{ code: ... }`
  // with no indication of which query died. Name the failure.
  console.error(`syncGcdSeriesFormat (${SOURCE}) failed: ${err?.code ? `${err.code} | ` : ""}${err?.message ?? err}`);
  if (err?.details) console.error(`  details: ${err.details}`);
  if (err?.hint) console.error(`  hint: ${err.hint}`);
  process.exit(1);
});
