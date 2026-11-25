// Finds the ComicVine volume for series where a member's book shows no cover
// (Tony, 2026-11-24). The older lanes work from lists of series that mostly
// have no blanks, skip a series for months once it is marked done, and give up
// when ComicVine spells the title or publisher another way.
//
//   node scripts/matchBlankBooks.js                 dry run: searches, writes nothing
//   node scripts/matchBlankBooks.js --apply         updates blank-volume-ledger.json, writes gap-blank.json
//   node scripts/matchBlankBooks.js --max-searches=40
//   node scripts/matchBlankBooks.js --asks          list the ones waiting on a yes or no
//
// The rules are in scripts/lib/blankVolumeMatch.js. Sure matches go to
// gap-blank.json, which cover-ingest.yml ingests by volume id right after.
// Uncertain ones wait in the ledger; an answer is a line in
// blank-volume-answers.json: {"<gcd series id>": <ComicVine volume id, or 0 for none of them>}.
// Nothing here writes to the database.

import dotenv from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { isCollectedEdition } from "../src/lib/seriesFormat.js";
import { blankOnSite } from "./lib/blankOnSite.js";
import { matchBlankSeries, titleKey } from "./lib/blankVolumeMatch.js";
import { normNumber } from "./lib/unfiledCovers.js";
import { withRetry } from "./lib/withRetry.js";

dotenv.config({ path: ".env.local", quiet: true });

const LEDGER = "blank-volume-ledger.json";
const ANSWERS = "blank-volume-answers.json";
const TARGETS = "gap-blank.json";
const PAGE = 1000;
const RECHECK_MS = 30 * 86_400_000;
const MAX_TRIES = 3;
const MAX_TARGETS = 40;
const APPLY = process.argv.includes("--apply");
const MAX_SEARCHES = Number(process.argv.find((a) => a.startsWith("--max-searches="))?.split("=")[1] ?? 40);
if (!Number.isInteger(MAX_SEARCHES) || MAX_SEARCHES < 0) throw new Error("--max-searches must be a whole number");

const load = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback);
const save = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function printAsks(ledger, answers) {
  const asks = Object.entries(ledger).filter(([id, e]) => e.status === "ask" && answers[id] == null);
  for (const [id, e] of asks) {
    console.log(`${id}  ${e.name} (${e.publisher}, ${e.year}, ${e.count} issues)  blank: ${e.blank.join(", ")}  [${e.reason}]`);
    for (const o of e.options) console.log(`    ${o.id}  ${o.name} (${o.publisher}, ${o.start_year}, ${o.count} issues)  ${o.why.join(", ")}`);
  }
  console.log(`${asks.length} waiting on a yes or no`);
}

async function comicvine(path, params) {
  const url = new URL(`https://comicvine.gamespot.com/api/${path}/`);
  for (const [k, v] of Object.entries({ api_key: process.env.COMICVINE_API_KEY, format: "json", ...params })) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { "User-Agent": "ComixCatalog blank book matcher" } });
  if (res.status === 420 || res.status === 429) return { stop: `ComicVine HTTP ${res.status}` };
  if (!res.ok) throw new Error(`ComicVine HTTP ${res.status}`);
  const body = await res.json();
  if (body.status_code === 107) return { stop: "ComicVine rate limit" };
  if (body.status_code !== 1) throw new Error(`ComicVine status ${body.status_code}: ${body.error}`);
  return { results: body.results ?? [] };
}

const FIELDS = "id,name,start_year,publisher,count_of_issues";

async function findCandidates(name) {
  const query = name.replace(/\[[^\]]*\]/g, " ").replace(/[/:]/g, " ").replace(/\s+/g, " ").trim();
  const found = await comicvine("search", { resources: "volume", query, field_list: FIELDS, limit: "20" });
  if (found.stop) return found;
  let rows = found.results;
  // search/ has dropped publisher and count before (2026-10-25). Without them
  // every series would look like a mismatch.
  const bare = rows.filter((r) => !r.publisher?.name || !r.count_of_issues);
  if (bare.length) {
    const full = await comicvine("volumes", { filter: `id:${bare.map((r) => r.id).join("|")}`, field_list: FIELDS, limit: "100" });
    if (full.stop) return full;
    const byId = new Map(full.results.map((r) => [r.id, r]));
    rows = rows.map((r) => byId.get(r.id) ?? r);
  }
  return {
    candidates: rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      publisher: r.publisher?.name ?? null,
      start_year: r.start_year,
      count_of_issues: r.count_of_issues,
    })),
  };
}

async function main() {
  const ledger = load(LEDGER, {});
  const answers = load(ANSWERS, {});
  if (process.argv.includes("--asks")) return printAsks(ledger, answers);

  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "COMICVINE_API_KEY"]) {
    if (!process.env[key]) throw new Error(`${key} is required`);
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const pages = async (label, build) => {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const rows = await withRetry(`${label} from ${from}`, () => build().range(from, from + PAGE - 1));
      out.push(...(rows ?? []));
      if (!rows || rows.length < PAGE) return out;
    }
  };
  const inChunks = async (label, ids, size, build) => {
    const out = [];
    for (let i = 0; i < ids.length; i += size) out.push(...(await pages(label, () => build(ids.slice(i, i + size)))));
    return out;
  };

  // Books members own or want, minus those showing the member's own photo.
  const owned = await pages("collected issues", () =>
    supabase.from("user_collections").select("id, gcd_issue_id, created_at").not("gcd_issue_id", "is", null).is("user_cover_url", null).order("id"));
  const added = new Map();
  for (const r of owned) {
    const id = Number(r.gcd_issue_id);
    if ((added.get(id) ?? "") < r.created_at) added.set(id, r.created_at);
  }
  const issues = await inChunks("owned issues", [...added.keys()], 300, (ids) =>
    supabase.from("gcd_issues").select("gcd_id, series_gcd_id, issue_number").in("gcd_id", ids).order("gcd_id"));
  const direct = await inChunks("issues with a cover", [...added.keys()], 300, (ids) =>
    supabase.from("canonical_covers").select("id, gcd_issue_id").in("gcd_issue_id", ids).not("storage_path", "is", null).order("id"));
  const covered = new Set(direct.map((r) => Number(r.gcd_issue_id)));
  const toAsk = issues.filter((i) => i.series_gcd_id != null && !covered.has(Number(i.gcd_id)));
  const blank = await blankOnSite(toAsk.map((i) => Number(i.gcd_id)));
  const bySeries = new Map();
  for (const i of toAsk) {
    if (!blank.has(Number(i.gcd_id))) continue;
    const id = Number(i.series_gcd_id);
    if (!bySeries.has(id)) bySeries.set(id, { id, numbers: [], newest: "" });
    const s = bySeries.get(id);
    s.numbers.push(i.issue_number);
    const when = added.get(Number(i.gcd_id)) ?? "";
    if (when > s.newest) s.newest = when;
  }
  console.log(`Members' books: ${added.size}; asked the site about ${toAsk.length}; blank: ${blank.size} in ${bySeries.size} series`);

  const now = Date.now();
  const queue = [...bySeries.values()].sort((a, b) => b.newest.localeCompare(a.newest));
  const due = queue.filter((s) => {
    const e = ledger[s.id];
    if (answers[s.id] != null || e?.status === "sure") return false;
    return !e || now - Date.parse(e.checked_at) > RECHECK_MS;
  });
  const ids = due.map((s) => s.id);
  const factRows = await inChunks("series", ids, 200, (batch) =>
    supabase.from("series").select("gcd_id, us_market, comicvine_volume_id").in("gcd_id", batch).order("gcd_id"));
  const facts = new Map(factRows.map((r) => [Number(r.gcd_id), r]));
  const formatRows = await inChunks("gcd series", ids, 200, (batch) =>
    supabase.from("gcd_series").select("gcd_id, name, year_began, publisher_gcd_id, publishing_format, binding").in("gcd_id", batch).order("gcd_id"));
  const formats = new Map(formatRows.map((r) => [Number(r.gcd_id), r]));
  // GCD's publisher, not series.resolved_publisher_cached: that one follows
  // ComicVine and is wrong on some series (Cover and He-Man (2013) are DC books
  // it calls Dark Horse), which turned exact matches into mismatches.
  const publisherNames = new Map();
  const loadPublishers = async (rows) => {
    const missing = [...new Set(rows.map((r) => r.publisher_gcd_id).filter((id) => id != null && !publisherNames.has(Number(id))))];
    const found = await inChunks("publishers", missing, 200, (batch) => supabase.from("gcd_publishers").select("gcd_id, name").in("gcd_id", batch).order("gcd_id"));
    for (const r of found) publisherNames.set(Number(r.gcd_id), r.name);
  };
  await loadPublishers(formatRows);

  const tally = {};
  const count = (k) => { tally[k] = (tally[k] ?? 0) + 1; };
  const escapeLike = (name) => name.replace(/[\\%_]/g, (c) => "\\" + c);
  let searches = 0;
  for (const s of due) {
    if (searches >= MAX_SEARCHES) break;
    const fact = facts.get(s.id);
    const gcd = formats.get(s.id);
    if (!fact || !gcd) { count("no series record"); continue; }
    if (fact.us_market === false) { count("not a US series"); continue; }

    if (searches) await sleep(1200);
    const found = await findCandidates(gcd.name);
    searches += 1;
    if (found.stop) { console.log(`Stopped: ${found.stop}`); break; }

    const own = await pages("series issues", () =>
      supabase.from("gcd_issues").select("gcd_id, issue_number").eq("series_gcd_id", s.id).is("variant_of_gcd_id", null).order("gcd_id"));
    const bare = gcd.name.replace(/^the /i, "");
    const rivals = new Map();
    for (const name of new Set([gcd.name, bare, `The ${bare}`])) {
      const rows = await pages("same-named series", () =>
        supabase.from("series").select("gcd_id, title, year_start_cached, us_market, issue_count_cached").ilike("title", escapeLike(name)).order("gcd_id"));
      for (const r of rows) if (r.gcd_id != null && Number(r.gcd_id) !== s.id && titleKey(r.title) === titleKey(gcd.name)) rivals.set(Number(r.gcd_id), r);
    }
    const rivalSeries = await inChunks("rival series", [...rivals.keys()], 200, (batch) =>
      supabase.from("gcd_series").select("gcd_id, publisher_gcd_id").in("gcd_id", batch).order("gcd_id"));
    await loadPublishers(rivalSeries);
    const rivalPublisher = new Map(rivalSeries.map((r) => [Number(r.gcd_id), publisherNames.get(Number(r.publisher_gcd_id)) ?? null]));
    const volumeIds = found.candidates.map((c) => c.id);
    const filed = volumeIds.length
      ? await pages("covers of candidate volumes", () =>
          supabase.from("canonical_covers").select("id, comicvine_volume_id, series_gcd_id").in("comicvine_volume_id", volumeIds).not("series_gcd_id", "is", null).neq("series_gcd_id", s.id).order("id"))
      : [];
    const series = {
      name: gcd.name,
      publisher: publisherNames.get(Number(gcd.publisher_gcd_id)) ?? null,
      year: gcd.year_began,
      count: new Set(own.map((i) => normNumber(i.issue_number))).size,
      collected: isCollectedEdition(gcd),
    };
    let result = matchBlankSeries({
      series,
      candidates: found.candidates,
      rivals: [...rivals.values()].map((r) => ({ publisher: rivalPublisher.get(Number(r.gcd_id)) ?? null, year: r.year_start_cached, count: r.issue_count_cached })),
      takenBy: new Set(filed.map((r) => Number(r.comicvine_volume_id))),
    });
    const pin = fact.comicvine_volume_id == null ? null : Number(fact.comicvine_volume_id);
    if (result.status === "sure" && pin != null && pin !== result.volume.id) {
      result = { status: "ask", reason: `already pinned to ComicVine ${pin}`, options: [{ ...result.volume, why: ["pinned elsewhere"] }] };
    }
    count(result.status);
    const shown = result.volume ?? result.options?.[0];
    console.log(`  ${result.status.padEnd(4)} ${series.name} (${series.publisher}, ${series.year}, ${series.count})${shown ? ` -> ${shown.id} ${shown.name} (${shown.publisher}, ${shown.start_year}, ${shown.count})` : ""}${result.reason ? ` [${result.reason}]` : ""}`);
    ledger[s.id] = { ...result, ...series, blank: s.numbers.slice(0, 12), checked_at: new Date(now).toISOString() };
  }
  console.log(`Searched ${searches}; results ${JSON.stringify(tally)}; series due before this run ${due.length}`);

  const targets = [];
  for (const s of queue) {
    if (targets.length >= MAX_TARGETS) break;
    const e = ledger[s.id];
    const answer = answers[s.id];
    const volume = answer != null ? Number(answer) : e?.status === "sure" ? e.volume.id : 0;
    if (!volume || !e || (e.tries ?? 0) >= MAX_TRIES) continue;
    e.tries = (e.tries ?? 0) + 1;
    targets.push({ name: e.name, publisher: e.publisher, year: e.year, volume_id: volume, series_gcd_id: s.id });
  }
  const asking = Object.entries(ledger).filter(([id, e]) => e.status === "ask" && answers[id] == null).length;
  console.log(`${APPLY ? "Wrote" : "[dry run] would write"} ${targets.length} target(s); ${asking} waiting on a yes or no`);
  if (APPLY) {
    save(LEDGER, ledger);
    save(TARGETS, targets);
  } else if (process.env.DRY_OUT) {
    save(process.env.DRY_OUT, { ledger, targets });
  }
}

main().catch((error) => {
  console.error("matchBlankBooks failed:", error);
  process.exit(1);
});
