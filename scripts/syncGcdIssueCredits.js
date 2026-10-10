// Gradually hydrate issue details, stories, and normalized creator credits
// from GCD. Reads are keyset-paged and GCD's small request budget is treated
// as a hard ceiling: a 429 stops the run immediately.
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { FEATURED_SERIES } from "../src/lib/featuredSeries.js";
import { pickBestCandidate } from "./lib/featuredTargets.js";
import { creditsForIssue, slugify, storyRows } from "./lib/gcdCredits.js";

dotenv.config({ path: ".env.local", quiet: true });
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
  const [key, value] = a.slice(2).split("="); return [key, value ?? true];
}));
const DRY_RUN = Boolean(args["dry-run"]);
const SLEEP_MS = Number(args.sleep ?? 2000);
const LIMIT = Number(args.limit ?? 60);
const SOURCE = args.source ?? (args["gcd-ids"] ? "ids" : "priority");
const UA = { "User-Agent": "Mozilla/5.0 (ComixCatalog gcd-series-format-sync; contact via repo)", Accept: "application/json" };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function fail(label, error) {
  if (error) throw new Error(`${label}: ${error.code ? `${error.code} | ` : ""}${error.message}`);
}

async function unfetched(supabase, ids) {
  const unique = [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const fetched = new Set();
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const { data, error } = await supabase.from("gcd_issue_details").select("gcd_issue_id").in("gcd_issue_id", chunk).limit(1000);
    fail("check gcd_issue_details", error);
    for (const row of data ?? []) fetched.add(Number(row.gcd_issue_id));
  }
  return unique.filter((id) => !fetched.has(id));
}

async function keyCandidates(supabase, wanted) {
  const out = []; let last;
  while (out.length < wanted) {
    let query = supabase.from("key_issues").select("id,gcd_issue_id").not("gcd_issue_id", "is", null).order("id").limit(1000);
    if (last) query = query.gt("id", last);
    const { data, error } = await query; fail("read key issues", error);
    if (!data?.length) break;
    out.push(...await unfetched(supabase, data.map((row) => row.gcd_issue_id)));
    last = data.at(-1).id;
    if (data.length < 1000) break;
  }
  return out.slice(0, wanted);
}

async function featuredSeriesIds(supabase) {
  const titles = [...new Set(FEATURED_SERIES.map((entry) => entry.title))];
  const rows = []; let last = 0;
  for (;;) {
    const { data, error } = await supabase.from("series").select("id,gcd_id,title,resolved_publisher_cached,year_start_cached")
      .in("title", titles).not("gcd_id", "is", null).gt("id", last).order("id").limit(1000);
    fail("read featured series", error); rows.push(...(data ?? []));
    if (!data?.length || data.length < 1000) break; last = data.at(-1).id;
  }
  const pool = new Map();
  for (const row of rows) {
    const key = `${row.title.toLowerCase()}::${(row.resolved_publisher_cached ?? "").toLowerCase()}`;
    if (!pool.has(key)) pool.set(key, []); pool.get(key).push(row);
  }
  return [...new Set(FEATURED_SERIES.map((entry) => pickBestCandidate(entry, pool.get(`${entry.title.toLowerCase()}::${entry.publisher.toLowerCase()}`))?.gcd_id).filter(Boolean).map(Number))];
}

async function issuesForSeries(supabase, seriesIds, wanted) {
  const out = [];
  for (const seriesId of seriesIds) {
    let last = 0;
    while (out.length < wanted) {
      const { data, error } = await supabase.from("gcd_issues").select("gcd_id").eq("series_gcd_id", seriesId)
        .gt("gcd_id", last).order("gcd_id").limit(1000);
      fail(`read issues for series ${seriesId}`, error);
      if (!data?.length) break;
      out.push(...await unfetched(supabase, data.map((row) => row.gcd_id)));
      last = data.at(-1).gcd_id;
      if (data.length < 1000) break;
    }
    if (out.length >= wanted) break;
  }
  return [...new Set(out)].slice(0, wanted);
}

async function collectedCandidates(supabase, wanted) {
  const out = []; let last;
  while (out.length < wanted) {
    let query = supabase.from("user_collections").select("id,gcd_issue_id").not("gcd_issue_id", "is", null).order("id").limit(1000);
    if (last) query = query.gt("id", last);
    const { data, error } = await query; fail("read collected issues", error);
    if (!data?.length) break;
    out.push(...await unfetched(supabase, data.map((row) => row.gcd_issue_id)));
    last = data.at(-1).id;
    if (data.length < 1000) break;
  }
  return [...new Set(out)].slice(0, wanted);
}

async function popularCandidates(supabase, wanted) {
  const out = []; let last = 0;
  while (out.length < wanted) {
    const { data, error } = await supabase.from("series").select("id,gcd_id").eq("us_market", true)
      .not("gcd_id", "is", null).gt("id", last).order("id").limit(1000);
    fail("read US-market series", error);
    if (!data?.length) break;
    out.push(...await issuesForSeries(supabase, data.map((row) => Number(row.gcd_id)), wanted - out.length));
    last = data.at(-1).id;
    if (data.length < 1000) break;
  }
  return [...new Set(out)].slice(0, wanted);
}

async function candidates(supabase) {
  if (SOURCE === "ids") {
    const ids = await unfetched(supabase, String(args["gcd-ids"]).split(","));
    return { ids: ids.slice(0, LIMIT), counts: { ids: Math.min(ids.length, LIMIT) } };
  }
  const loaders = {
    keys: keyCandidates,
    featured: async (db, n) => issuesForSeries(db, await featuredSeriesIds(db), n),
    collected: collectedCandidates, popular: popularCandidates,
  };
  const names = SOURCE === "priority" ? Object.keys(loaders) : [SOURCE];
  if (names.some((name) => !loaders[name])) throw new Error(`unknown --source=${SOURCE}`);
  const ids = []; const counts = Object.fromEntries(names.map((name) => [name, 0]));
  for (const name of names) {
    const found = await loaders[name](supabase, LIMIT - ids.length);
    const fresh = found.filter((id) => !ids.includes(id)); ids.push(...fresh); counts[name] = fresh.length;
    if (ids.length >= LIMIT) break;
  }
  return { ids: ids.slice(0, LIMIT), counts };
}

async function creatorId(supabase, name) {
  const existing = await supabase.from("creators").select("id").eq("name", name).maybeSingle();
  fail(`find creator ${name}`, existing.error); if (existing.data) return existing.data.id;
  const base = slugify(name) || "creator";
  for (let suffix = 1; ; suffix += 1) {
    const slug = suffix === 1 ? base : `${base}-${suffix}`;
    const inserted = await supabase.from("creators").insert({ name, slug }).select("id").single();
    if (!inserted.error) return inserted.data.id;
    if (inserted.error.code !== "23505") fail(`insert creator ${name}`, inserted.error);
    const raced = await supabase.from("creators").select("id").eq("name", name).maybeSingle();
    fail(`recheck creator ${name}`, raced.error); if (raced.data) return raced.data.id;
  }
}

async function writeIssue(supabase, gcdId, apiIssue) {
  const details = apiIssue ? {
    gcd_issue_id: gcdId, on_sale_date: apiIssue.on_sale_date?.trim() || null, price: apiIssue.price?.trim() || null,
    page_count: Number.isFinite(Number(apiIssue.page_count)) ? Number(apiIssue.page_count) : null,
    editing: apiIssue.editing?.trim() || null, not_found: false, synced_at: new Date().toISOString(),
  } : { gcd_issue_id: gcdId, not_found: true, synced_at: new Date().toISOString() };
  if (!apiIssue) {
    const detailResult = await supabase.from("gcd_issue_details").upsert(details, { onConflict: "gcd_issue_id" });
    fail(`write missing details ${gcdId}`, detailResult.error);
    return;
  }
  const deleted = await supabase.from("gcd_stories").delete().eq("gcd_issue_id", gcdId); fail(`delete stories ${gcdId}`, deleted.error);
  const stories = storyRows(gcdId, apiIssue);
  if (stories.length) { const inserted = await supabase.from("gcd_stories").insert(stories); fail(`insert stories ${gcdId}`, inserted.error); }
  const deletedCredits = await supabase.from("issue_creators").delete().eq("gcd_issue_id", gcdId); fail(`delete credits ${gcdId}`, deletedCredits.error);
  const rows = [];
  for (const credit of creditsForIssue(apiIssue)) rows.push({ gcd_issue_id: gcdId, creator_id: await creatorId(supabase, credit.name), role: credit.role });
  if (rows.length) { const inserted = await supabase.from("issue_creators").upsert(rows, { onConflict: "gcd_issue_id,creator_id,role" }); fail(`insert credits ${gcdId}`, inserted.error); }
  // This row is the cursor. Write it last so a failed child-table write is
  // retried next run rather than looking complete forever.
  const detailResult = await supabase.from("gcd_issue_details").upsert(details, { onConflict: "gcd_issue_id" });
  fail(`write details ${gcdId}`, detailResult.error);
}

async function run() {
  if (!Number.isInteger(LIMIT) || LIMIT < 1) throw new Error(`--limit must be a positive integer, got ${args.limit}`);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const selection = await candidates(supabase); let fetched = 0; let written = 0; let notFound = 0; let rateLimited = false;
  for (const gcdId of selection.ids) {
    let json;
    try { json = await fetchJson(`https://www.comics.org/api/issue/${gcdId}/?format=json`); }
    catch (error) {
      if (error instanceof RateLimited) { console.log(`GCD rate-limited; stopping cleanly. ${error.message}`); rateLimited = true; break; }
      console.error(`  gcd ${gcdId}: ${error.message}`); await sleep(SLEEP_MS); continue;
    }
    fetched += 1; if (!json) notFound += 1;
    if (DRY_RUN) console.log(JSON.stringify({ gcd_issue_id: gcdId, not_found: !json, credits: json ? creditsForIssue(json) : [] }));
    else { await writeIssue(supabase, gcdId, json); written += 1; }
    await sleep(SLEEP_MS);
  }
  console.log(`summary fetched=${fetched} written=${written} not_found=${notFound} rate_limited=${rateLimited} sources=${Object.entries(selection.counts).map(([k, v]) => `${k}:${v}`).join(",")}`);
}

export { RateLimited, fetchJson };
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) run().catch((error) => { console.error(`syncGcdIssueCredits failed: ${error?.code ? `${error.code} | ` : ""}${error?.message ?? error}`); process.exit(1); });
