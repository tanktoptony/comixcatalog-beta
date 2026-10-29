#!/usr/bin/env node
// Fills series.card_cover_path (migration 0067) for every series a broad
// search can show, so the first search for those terms reads stored covers
// instead of resolving them. Search fills the column on its own as people
// search; this only warms the expensive broad terms ahead of time.
//
// Dry run by default: reports how many target series have no stored pick.
// --apply resolves and saves them, one batch at a time (DB load: see the
// Disk IO notes in CLAUDE.md; run off-peak, never alongside another bulk job).
//
// --editions targets edition series (series_editions) instead of search
// terms. Editions fold into chips under their work, so search never shows
// them as cards and never fills their pick; the chips read it. Rows with a
// stored cover go first, --limit caps one run.
//
// Usage:
//   node scripts/precomputeSeriesCardCovers.js [--terms=batman,spider man] [--batch=36] [--apply]
//   node scripts/precomputeSeriesCardCovers.js --editions [--limit=3000] [--apply]
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { resolveSeriesCardCovers } from "../src/lib/catalog/seriesCardCovers.js";
import { US_PUBLISHER_ALLOWLIST } from "../src/lib/publisher.js";
import { searchSeriesRpc } from "../src/lib/searchRpc.js";

dotenv.config({ path: path.resolve(".env.local") });

const DEFAULT_TERMS = [
  "batman", "spider man", "x men", "superman", "wolverine", "daredevil", "hulk",
  "avengers", "iron man", "captain america", "thor", "fantastic four", "wonder woman",
  "justice league", "deadpool", "punisher", "green lantern", "flash", "star wars",
  "teenage mutant ninja turtles", "transformers", "venom", "conan", "aquaman",
];

function option(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const APPLY = process.argv.includes("--apply");
const TERMS = option("terms", DEFAULT_TERMS.join(",")).split(",").map((term) => term.trim()).filter(Boolean);
const EDITIONS = process.argv.includes("--editions");
const LIMIT = Number(option("limit", "3000"));
const BATCH = Number(option("batch", "36"));
if (!Number.isInteger(BATCH) || BATCH < 1 || BATCH > 100) throw new Error("--batch must be 1-100");

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function editionTargets() {
  const gcdIds = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("series_editions")
      .select("edition_gcd_id").order("edition_gcd_id").range(from, from + 999);
    if (error) throw error;
    gcdIds.push(...(data ?? []).map((row) => row.edition_gcd_id));
    if (!data || data.length < 1000) break;
  }
  const rows = [];
  const covered = new Set();
  for (let index = 0; index < gcdIds.length; index += 300) {
    const chunk = gcdIds.slice(index, index + 300);
    const [series, covers] = await Promise.all([
      supabase.from("series")
        .select("id, gcd_id, title, year_start_cached, year_end_cached, resolved_publisher_cached, card_cover_checked_at")
        .in("gcd_id", chunk),
      supabase.from("canonical_covers").select("series_gcd_id").in("series_gcd_id", chunk),
    ]);
    if (series.error) throw series.error;
    if (covers.error) throw covers.error;
    rows.push(...(series.data ?? []));
    for (const row of covers.data ?? []) covered.add(row.series_gcd_id);
  }
  console.log(`${gcdIds.length} edition series, ${covered.size} with a stored cover`);
  return rows.toSorted((a, b) => Number(covered.has(b.gcd_id)) - Number(covered.has(a.gcd_id)));
}

const targets = new Map();
const pending = [];
if (EDITIONS) {
  for (const row of await editionTargets()) {
    targets.set(row.id, row);
    if (!row.card_cover_checked_at && pending.length < LIMIT) pending.push(row);
  }
} else {
  for (const term of TERMS) {
    const { data, error } = await searchSeriesRpc(supabase, {
      normalized_term: term,
      allowed_publishers: US_PUBLISHER_ALLOWLIST,
      result_limit: 1000,
    });
    if (error) throw error;
    for (const row of data ?? []) if (row.gcd_id != null) targets.set(row.id, row);
    console.log(`${term}: ${data?.length ?? 0} series`);
  }

  const ids = [...targets.keys()];
  for (let index = 0; index < ids.length; index += 200) {
    const { data, error } = await supabase.from("series")
      .select("id, card_cover_checked_at").in("id", ids.slice(index, index + 200));
    if (error) {
      console.error(`series.card_cover_checked_at unreadable (is migration 0067 applied?): ${error.message}`);
      process.exit(1);
    }
    for (const row of data ?? []) if (!row.card_cover_checked_at) pending.push(targets.get(row.id));
  }
}
console.log(`${targets.size} target series, ${pending.length} to compute this run`);

if (!APPLY) {
  console.log("Dry run. Re-run with --apply to compute and save.");
  process.exit(0);
}

const started = Date.now();
let covered = 0;
for (let index = 0; index < pending.length; index += BATCH) {
  const batch = pending.slice(index, index + BATCH);
  const covers = await resolveSeriesCardCovers(supabase, batch);
  covered += batch.filter((row) => covers.has(row.id)).length;
  console.log(`${Math.min(index + BATCH, pending.length)}/${pending.length} done, ${covered} with a cover, ${Math.round((Date.now() - started) / 1000)} s`);
}
