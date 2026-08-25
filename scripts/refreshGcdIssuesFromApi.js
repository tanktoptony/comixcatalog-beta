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

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

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
// 700ms tripped a 429 (Retry-After ~52min) well under 100 requests in
// testing on 2026-08-10. 2000ms is a more conservative starting point, not
// a confirmed-safe number - GCD's actual sustained rate limit is
// undocumented. Re-tune once real usage data exists.
const SLEEP_MS = Number(args.sleep ?? 2000);
const LIMIT = args.limit ? Number(args.limit) : Infinity;

const UA = { "User-Agent": "Mozilla/5.0 (ComixCatalog gcd-issue-refresh; contact via repo)", Accept: "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function getTargetGcdIds() {
  if (args["gcd-ids"]) {
    return String(args["gcd-ids"]).split(",").map((s) => Number(s.trim())).filter(Boolean);
  }
  if (args.source === "featured") {
    const { FEATURED_SERIES } = await import("../src/lib/featuredSeries.js");
    const titles = [...new Set(FEATURED_SERIES.map((e) => e.title))];
    const { data: rows } = await supabase
      .from("series")
      .select("gcd_id, title, resolved_publisher_cached, year_start_cached")
      .in("title", titles)
      .not("gcd_id", "is", null);
    const pool = new Map();
    for (const r of rows ?? []) {
      const key = `${r.title.toLowerCase()}::${(r.resolved_publisher_cached ?? "").toLowerCase()}`;
      if (!pool.has(key)) pool.set(key, []);
      pool.get(key).push(r);
    }
    const ids = [];
    for (const entry of FEATURED_SERIES) {
      const key = `${entry.title.toLowerCase()}::${entry.publisher.toLowerCase()}`;
      const candidates = pool.get(key) ?? [];
      if (candidates.length === 0) continue;
      let best = candidates[0];
      let bestDelta = Infinity;
      for (const c of candidates) {
        const delta = entry.prefer_year != null && c.year_start_cached != null
          ? Math.abs(c.year_start_cached - entry.prefer_year) : Infinity;
        if (delta < bestDelta) { best = c; bestDelta = delta; }
      }
      ids.push(best.gcd_id);
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

  const { data: localRows, error } = await supabase
    .from("gcd_issues")
    .select("gcd_id")
    .eq("series_gcd_id", seriesGcdId);
  if (error) throw error;
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
      console.error(`    skipping issue ${issueId}: ${err.message}`);
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
    if (upsertErr) { console.error(`    upsert failed for issue ${issueId}: ${upsertErr.message}`); continue; }
    inserted++;
  }

  console.log(`  Inserted ${inserted} / ${missing.length} new issue rows.`);
  if (rateLimitedErr) throw rateLimitedErr;
  return { series: seriesJson.name, missing: missing.length, inserted };
}

async function run() {
  const ids = (await getTargetGcdIds()).slice(0, LIMIT);
  console.log(`Refreshing ${ids.length} series from GCD's live API${DRY_RUN ? " (dry-run)" : ""}...`);
  const results = [];
  for (const id of ids) {
    try {
      results.push(await refreshOne(id));
    } catch (err) {
      if (err instanceof RateLimited) {
        console.error(`\n${err.message}`);
        console.error(`Stopping the whole run here - re-run later, already-inserted rows are safe (upsert is idempotent).`);
        break;
      }
      console.error(`  ERROR on gcd_id ${id}: ${err.message}`);
    }
  }
  const totalMissing = results.reduce((s, r) => s + r.missing, 0);
  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  console.log(`\nDone. ${results.length} series checked, ${totalMissing} issues were missing, ${totalInserted} inserted.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
