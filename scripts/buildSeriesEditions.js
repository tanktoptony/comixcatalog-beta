// Rebuild edition/special-to-work links from GCD issue reprints and titles.
// Dry-run is the default. Pass --apply to replace the generated rows.

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildSeriesEditions } from "./lib/seriesEditions.js";
import { withRetry } from "./lib/withRetry.js";
import { isCollectedEdition } from "../src/lib/seriesFormat.js";

const PAGE_SIZE = 1000;

function chunks(rows, size) {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));
}

async function loadCatalog(supabase) {
  const rows = [];
  let last = -1;
  while (true) {
    const page = await withRetry(`catalog series after ${last}`, () => supabase
      .from("series")
      .select("gcd_id,title,issue_count_cached,year_start_cached")
      .not("gcd_id", "is", null)
      .gt("gcd_id", last)
      .order("gcd_id", { ascending: true })
      .limit(PAGE_SIZE));
    if (!page?.length) break;
    rows.push(...page.map((row) => ({
      gcd_id: Number(row.gcd_id),
      title: row.title,
      issue_count: row.issue_count_cached,
      year_start: row.year_start_cached,
    })));
    last = Number(page.at(-1).gcd_id);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadFormats(supabase, ids) {
  const formats = new Map();
  for (const batch of chunks(ids, 500)) {
    const rows = await withRetry(`formats through ${batch.at(-1)}`, () => supabase
      .from("gcd_series")
      .select("gcd_id,name,publishing_format,binding,publisher_gcd_id,year_began")
      .in("gcd_id", batch));
    for (const row of rows ?? []) formats.set(Number(row.gcd_id), row);
  }
  return formats;
}

async function loadSources(supabase, targetIds) {
  const sources = [];
  for (const batch of chunks(targetIds, 200)) {
    for (let start = 0; ; start += PAGE_SIZE) {
      const rows = await withRetry(`reprint sources through ${batch.at(-1)}, page ${start / PAGE_SIZE + 1}`, () => supabase
        .rpc("series_reprint_sources", { target_ids: batch })
        .range(start, start + PAGE_SIZE - 1));
      sources.push(...(rows ?? []).map((row) => ({
        target: Number(row.target_series_gcd_id),
        origin: Number(row.origin_series_gcd_id),
        issues: Number(row.issues),
      })));
      if (!rows || rows.length < PAGE_SIZE) break;
    }
  }
  return sources;
}

async function existingEditionIds(supabase) {
  const ids = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const rows = await withRetry(`existing edition ids page ${start / PAGE_SIZE + 1}`, () => supabase
      .from("series_editions")
      .select("edition_gcd_id")
      .order("edition_gcd_id", { ascending: true })
      .range(start, start + PAGE_SIZE - 1));
    ids.push(...(rows ?? []).map((row) => Number(row.edition_gcd_id)));
    if (!rows || rows.length < PAGE_SIZE) break;
  }
  return ids;
}

async function main() {
  dotenv.config({ path: path.resolve(import.meta.dirname, "../.env.local") });
  const args = new Set(process.argv.slice(2));
  if (args.has("--apply") && args.has("--dry-run")) throw new Error("Choose either --apply or --dry-run");
  const apply = args.has("--apply");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const series = await loadCatalog(supabase);
  const formats = await loadFormats(supabase, series.map((row) => row.gcd_id));
  const collectedIds = series.map((row) => row.gcd_id).filter((id) => {
    const value = formats.get(id);
    return isCollectedEdition(value) || /graphic novel/i.test(value?.publishing_format ?? "");
  });
  const sources = await loadSources(supabase, collectedIds);
  const links = buildSeriesEditions({ series, formats, sources });
  const titles = new Map(series.map((row) => [row.gcd_id, row.title]));
  const counts = new Map();
  for (const link of links) {
    const key = `${link.role}/${link.source}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  console.log(`Mode: ${apply ? "apply" : "dry-run"}`);
  console.log(`Catalog: ${series.length}; collected candidates: ${collectedIds.length}; reprint sources: ${sources.length}; links: ${links.length}`);
  for (const [key, count] of [...counts].sort()) console.log(`${key}: ${count}`);
  console.log("Samples:");
  for (const link of links.slice(0, 15)) {
    console.log(`  ${titles.get(link.edition_gcd_id)} (${link.edition_gcd_id}) -> ${titles.get(link.work_gcd_id)} (${link.work_gcd_id}) [${link.role}/${link.source}, ${link.shared_issues}]`);
  }
  console.log("WicDiv sanity check (work 81367):");
  for (const link of links.filter((row) => row.work_gcd_id === 81367)) {
    console.log(`  ${titles.get(link.edition_gcd_id)} (${link.edition_gcd_id}) [${link.role}/${link.source}, ${link.shared_issues}]`);
  }
  // --out=<file> writes every link with titles and years for review.
  const out = process.argv.find((arg) => arg.startsWith("--out="))?.slice(6);
  if (out) {
    const byId = new Map(series.map((row) => [row.gcd_id, row]));
    const describe = (id) => `${byId.get(id)?.title} (${byId.get(id)?.year_start ?? "?"}, ${byId.get(id)?.issue_count} iss, gcd ${id})`;
    writeFileSync(out, JSON.stringify(links.map((link) => ({
      ...link,
      edition: describe(link.edition_gcd_id),
      work: describe(link.work_gcd_id),
    })), null, 1));
    console.log(`Wrote ${links.length} links to ${out}`);
  }
  if (!apply) return;

  const updatedAt = new Date().toISOString();
  let written = 0;
  for (const batch of chunks(links, 500)) {
    await withRetry(`upsert editions after ${written}`, () => supabase.from("series_editions").upsert(
      batch.map((row) => ({ ...row, updated_at: updatedAt })),
      { onConflict: "edition_gcd_id" },
    ));
    written += batch.length;
  }
  const computed = new Set(links.map((row) => row.edition_gcd_id));
  const stale = (await existingEditionIds(supabase)).filter((id) => !computed.has(id));
  let deleted = 0;
  for (const batch of chunks(stale, 500)) {
    await withRetry(`delete stale editions after ${deleted}`, () => supabase.from("series_editions").delete().in("edition_gcd_id", batch));
    deleted += batch.length;
  }
  console.log(`Written: ${written}; deleted: ${deleted}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
