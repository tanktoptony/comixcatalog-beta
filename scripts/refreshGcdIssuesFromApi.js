// Targeted top-up of gcd_issues from GCD's own live API - NOT a fresh bulk
// dump. Our gcd_issues mirror was populated once from an old GCD Postgres
// dump and never refreshed, so ongoing series silently fall behind (e.g.
// Absolute Superman: our mirror had issues 1-10, GCD's live data already had
// all 22). This fills the gap per-series instead of re-importing everything.
//
// Confirmed 2026-08-10: comics.org/api/series/<gcd_id>/ and
// comics.org/api/issue/<gcd_id>/ are public JSON endpoints, unauthenticated,
// NOT behind the Cloudflare wall that blocks files1.comics.org (cover
// images) - that wall is specific to the image host, not the REST API.
// Rate limits are undocumented (GCD is small, volunteer-run) so this
// self-throttles deliberately - don't remove the sleep.
//
// Usage:
//   node scripts/refreshGcdIssuesFromApi.js --gcd-ids=217177,120640
//   node scripts/refreshGcdIssuesFromApi.js --source=featured [--limit=20]
//   node scripts/refreshGcdIssuesFromApi.js --gcd-ids=217177 --dry-run
//   node scripts/refreshGcdIssuesFromApi.js --source=featured --no-cursor

import dotenv from "dotenv";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

import { describeError } from "./lib/describeError.js";
import { pickBestCandidate, readCursor, rotate, writeCursor } from "./lib/featuredTargets.js";
import { fetchAllPages } from "../src/lib/supabase/fetchAllPages.js";
import { withRetry } from "./lib/withRetry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const DRY_RUN = Boolean(args["dry-run"]);
const USE_CURSOR = !args["no-cursor"];
// 700ms tripped a 429 (Retry-After ~52min) well under 100 requests in
// testing on 2026-08-10. 2000ms is a more conservative starting point, not
// a confirmed-safe number - GCD's actual sustained rate limit is
// undocumented. Re-tune once real usage data exists.
//
// Measured 2026-09-23 from the live 09-16 run: 29 requests spread over 76s at
// this 2000ms spacing still tripped a 429 with Retry-After 3525s (~59 min).
// So the limit behaves like a fixed budget per hour rather than a rate -
// spacing requests further apart buys nothing, and the only thing that helps
// is spending each run's budget on different series. See ROTATION below.
const SLEEP_MS = Number(args.sleep ?? 2000);
const LIMIT = args.limit ? Number(args.limit) : Infinity;

const UA = { "User-Agent": "Mozilla/5.0 (ComixCatalog gcd-issue-refresh; contact via repo)", Accept: "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ROTATION
//
// A run gets roughly 29 GCD requests before the 429, and the featured list is
// 78 series, so one run can never reach the end of the list. The order used to
// be fixed, which meant every weekly run re-walked the same front of the list
// and the tail was never refreshed at all. This cursor records the last series
// a run attempted; the next run starts after it and wraps, so the whole list
// gets covered across several runs instead of never.
const CURSOR_FILE = path.resolve(__dirname, "../gcd-refresh-cursor.json");

// GCD's rate limit is real and fairly tight (confirmed 2026-08-10: tripped
// after well under 100 requests in a short window, returning 429 with a
// Retry-After that can be tens of minutes). On 429, respect Retry-After
// exactly and stop the whole run rather than retry-and-burn-more-budget -
// a script that silently keeps hammering a volunteer-run nonprofit's API
// after being told to back off is not something to ship.
class RateLimited extends Error {
  constructor(retryAfterSeconds) {
    super(`GCD rate-limited us. Retry-After: ${retryAfterSeconds}s (~${Math.ceil(retryAfterSeconds / 60)} min). Stopping run.`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function fetchJson(url, tries = 2) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return res.json();
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? 60);
      throw new RateLimited(retryAfter);
    }
    if (res.status >= 500 && attempt < tries) {
      await sleep(SLEEP_MS * 2 * attempt);
      continue;
    }
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }
  throw new Error(`Failed after ${tries} attempts: ${url}`);
}

function issueIdFromUrl(url) {
  const m = url.match(/\/api\/issue\/(\d+)\//);
  return m ? Number(m[1]) : null;
}

// The top-level `title` field on the issue API is frequently blank; the real
// story title lives in story_set. Prefer the first "comic story" entry.
function resolveTitle(issueJson) {
  if (issueJson.title) return issueJson.title;
  const story = (issueJson.story_set ?? []).find((s) => s.type === "comic story" && s.title);
  return story?.title ?? null;
}

// PostgREST caps a read at 1000 rows and gives no indication that it
// truncated, which is the most repeated bug in this repo. Measured live
// 2026-09-23: this filter matches 1,426 rows and the unpaginated version
// returned exactly 1,000, so 426 candidates never reached the picker. The
// damage was not subtle - 9 of the 79 featured entries had every candidate
// truncated away and were skipped in silence (all five Absolute titles among
// them, including Absolute Superman, the series this script was written for),
// and another 20 resolved to a different series than the complete set gives.
//
// Using the shared fetchAllPages rather than another private loop is the
// point: OPERATIONS_HANDOFF 2a records eleven separate local copies of this
// walk, and names that duplication as the reason the bug keeps coming back.
// A twelfth copy here would have been the bug reproducing itself.
async function allFeaturedSeriesRows(titles) {
  try {
    return await fetchAllPages(() =>
      supabase
        .from("series")
        .select("id, gcd_id, title, resolved_publisher_cached, year_start_cached")
        .in("title", titles)
        .not("gcd_id", "is", null)
    );
  } catch (err) {
    // fetchAllPages rethrows the bare PostgREST object, which prints as
    // "[object Object]" and names neither the query nor the code.
    throw new Error(`featured series lookup: ${describeError(err)}`);
  }
}

async function getTargetGcdIds() {
  if (args["gcd-ids"]) {
    return String(args["gcd-ids"]).split(",").map((s) => Number(s.trim())).filter(Boolean);
  }
  if (args.source === "featured") {
    const { FEATURED_SERIES } = await import("../src/lib/featuredSeries.js");
    const titles = [...new Set(FEATURED_SERIES.map((e) => e.title))];
    const rows = await allFeaturedSeriesRows(titles);

    const pool = new Map();
    for (const r of rows) {
      const key = `${r.title.toLowerCase()}::${(r.resolved_publisher_cached ?? "").toLowerCase()}`;
      if (!pool.has(key)) pool.set(key, []);
      pool.get(key).push(r);
    }

    const ids = [];
    const unmatched = [];
    for (const entry of FEATURED_SERIES) {
      const key = `${entry.title.toLowerCase()}::${entry.publisher.toLowerCase()}`;
      const best = pickBestCandidate(entry, pool.get(key));
      // Skipping in silence here is how the truncation stayed invisible for a
      // month: a featured series with no candidate row looks exactly like one
      // that is already up to date. Name them out loud.
      if (!best) {
        unmatched.push(`${entry.title} (${entry.publisher})`);
        continue;
      }
      ids.push(best.gcd_id);
    }

    console.log(`Featured list: ${FEATURED_SERIES.length} entries | ${rows.length} candidate series rows | ${ids.length} resolved.`);
    if (unmatched.length) {
      console.log(`  ${unmatched.length} featured entries have no series row matching title+publisher:`);
      for (const u of unmatched) console.log(`    - ${u}`);
    }
    return [...new Set(ids)];
  }
  throw new Error("Provide --gcd-ids=1,2,3 or --source=featured");
}

async function refreshOne(seriesGcdId) {
  const seriesJson = await fetchJson(`https://www.comics.org/api/series/${seriesGcdId}/?format=json`);
  await sleep(SLEEP_MS);

  const remoteIds = (seriesJson.active_issues ?? []).map(issueIdFromUrl).filter(Boolean);
  const remoteSet = new Set(remoteIds);

  const localRows = await withRetry(`local issue list for series ${seriesGcdId}`, () =>
    supabase.from("gcd_issues").select("gcd_id").eq("series_gcd_id", seriesGcdId)
  );
  const localSet = new Set((localRows ?? []).map((r) => Number(r.gcd_id)));

  const missing = remoteIds.filter((id) => !localSet.has(id));

  console.log(`\n=== ${seriesJson.name} (gcd_id ${seriesGcdId}) ===`);
  console.log(`  GCD live: ${remoteSet.size} issue rows | local: ${localSet.size} | missing: ${missing.length}`);

  if (missing.length === 0 || DRY_RUN) {
    if (DRY_RUN && missing.length > 0) console.log(`  [dry-run] would fetch+insert ${missing.length} rows`);
    return { series: seriesJson.name, missing: missing.length, inserted: 0 };
  }

  // Upsert incrementally (one row at a time, right after each fetch) rather
  // than batching the whole series to the end - if GCD rate-limits us
  // partway through a big series, whatever was already fetched is saved
  // instead of thrown away. Rows are safe/idempotent to upsert again later.
  let inserted = 0;
  let rateLimitedErr = null;
  for (const issueId of missing) {
    let issueJson;
    try {
      issueJson = await fetchJson(`https://www.comics.org/api/issue/${issueId}/?format=json`);
    } catch (err) {
      if (err instanceof RateLimited) { rateLimitedErr = err; break; }
      console.error(`    skipping issue ${issueId}: ${describeError(err)}`);
      continue;
    }
    await sleep(SLEEP_MS);

    const { error: upsertErr } = await supabase
      .from("gcd_issues")
      .upsert({
        gcd_id: issueId,
        series_gcd_id: seriesGcdId,
        issue_number: issueJson.number ?? null,
        title: resolveTitle(issueJson),
        publication_date: issueJson.publication_date || null,
        key_date: issueJson.key_date || null,
      }, { onConflict: "gcd_id" });
    if (upsertErr) { console.error(`    upsert failed for issue ${issueId}: ${describeError(upsertErr)}`); continue; }
    inserted++;
  }

  console.log(`  Inserted ${inserted} / ${missing.length} new issue rows.`);
  if (rateLimitedErr) throw rateLimitedErr;
  return { series: seriesJson.name, missing: missing.length, inserted };
}

async function run() {
  const all = await getTargetGcdIds();
  const rotating = USE_CURSOR && !args["gcd-ids"];
  const cursor = rotating ? readCursor(CURSOR_FILE, fs) : null;
  const ordered = rotating ? rotate(all, cursor) : all;
  const ids = ordered.slice(0, LIMIT);

  if (rotating) {
    if (cursor == null) {
      console.log("No cursor yet - starting at the top of the featured list.");
    } else if (!all.includes(cursor)) {
      console.log(`Cursor gcd_id ${cursor} is no longer in the featured list - starting at the top.`);
    } else {
      console.log(`Resuming after gcd_id ${cursor} - this run starts at ${ids[0]} and wraps.`);
    }
  }
  console.log(`Refreshing ${ids.length} series from GCD's live API${DRY_RUN ? " (dry-run)" : ""}...`);

  const results = [];
  let lastAttempted = null;
  let rateLimited = false;
  for (const id of ids) {
    lastAttempted = id;
    try {
      results.push(await refreshOne(id));
    } catch (err) {
      if (err instanceof RateLimited) {
        rateLimited = true;
        console.error(`\n${err.message}`);
        console.error("Stopping the whole run here - re-run later, already-inserted rows are safe (upsert is idempotent).");
        break;
      }
      console.error(`  ERROR on gcd_id ${id}: ${describeError(err)}`);
    }
  }

  // Record where to resume even when the run ended on a 429 - that is the
  // case the cursor exists for. A dry run changes nothing, so it must not
  // move the cursor either.
  if (rotating && !DRY_RUN && lastAttempted != null) {
    writeCursor(CURSOR_FILE, fs, lastAttempted);
    console.log(`\nCursor written: next run starts after gcd_id ${lastAttempted}.`);
  }

  const totalMissing = results.reduce((s, r) => s + r.missing, 0);
  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  console.log(`\nDone. ${results.length} of ${ids.length} series checked, ${totalMissing} issues were missing, ${totalInserted} inserted.`);

  // Exit 3 = "GCD told us to back off", which is expected and not a failure.
  // The workflow translates only this code to success, so every other
  // non-zero exit stays red. The whole step used to be wrapped in
  // `continue-on-error: true` and so could not fail at all - four consecutive
  // green runs turned out to be four truncated runs.
  if (rateLimited) process.exitCode = 3;
}

run().catch((err) => {
  console.error(describeError(err));
  process.exit(1);
});
