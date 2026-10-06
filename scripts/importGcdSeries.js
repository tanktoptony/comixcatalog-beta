import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { resolvePublisher } from "../src/lib/publisher.js";
import { isUsMarketSeries } from "../src/lib/usMarket.js";
import { cachedIssueCount, gcdIdFromUrl } from "./lib/gcdSeriesImport.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith("--")).map((arg) => {
  const [key, value] = arg.slice(2).split("=");
  return [key, value ?? true];
}));
const gcdIds = String(args["gcd-ids"] ?? "").split(",").map(Number).filter(Number.isInteger);
const SLEEP_MS = Number(args.sleep ?? 2000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class RateLimited extends Error {}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "ComixCatalog gcd-series-import; contact via repo" } });
  if (response.status === 429) throw new RateLimited(`GCD rate limited this run. Retry-After: ${response.headers.get("retry-after") ?? "unknown"}s`);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

function resolveTitle(issue) {
  if (issue.title) return issue.title;
  return (issue.story_set ?? []).find((story) => story.type === "comic story" && story.title)?.title ?? null;
}

async function publisherFor(gcdId) {
  const { data, error } = await supabase.from("gcd_publishers").select("gcd_id, name, country").eq("gcd_id", gcdId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`gcd_publishers has no row for publisher ${gcdId}; let the publisher sync complete first`);
  return data;
}

async function importOne(gcdId) {
  const seriesJson = await fetchJson(`https://www.comics.org/api/series/${gcdId}/?format=json`);
  await sleep(SLEEP_MS);
  const publisherGcdId = gcdIdFromUrl(seriesJson.publisher, "publisher");
  const publisher = await publisherFor(publisherGcdId);
  const resolvedPublisher = resolvePublisher({ cv: null, candidates: [publisher.name], seriesTitle: seriesJson.name });
  const usMarket = isUsMarketSeries({ publisherCountry: publisher.country, gcdPublisherName: publisher.name, resolvedPublisher });

  const gcdSeriesValues = {
    gcd_id: gcdId,
    name: seriesJson.name,
    sort_name: seriesJson.sort_name || seriesJson.name,
    year_began: seriesJson.year_began || null,
    year_ended: seriesJson.year_ended || null,
    publisher_gcd_id: publisherGcdId,
    publishing_format: seriesJson.publishing_format || null,
    binding: seriesJson.binding || null,
  };
  const { data: updatedGcdSeries, error: gcdSeriesUpdateError } = await supabase
    .from("gcd_series").update(gcdSeriesValues).eq("gcd_id", gcdId).select("gcd_id");
  if (gcdSeriesUpdateError) throw gcdSeriesUpdateError;
  if (!updatedGcdSeries?.length) {
    const { error: gcdSeriesInsertError } = await supabase.from("gcd_series").insert(gcdSeriesValues);
    if (gcdSeriesInsertError) throw gcdSeriesInsertError;
  }

  const issueIds = (seriesJson.active_issues ?? []).map((url) => gcdIdFromUrl(url, "issue")).filter(Boolean);
  const issueRows = [];
  for (let index = 0; index < issueIds.length; index += 1) {
    const issueJson = await fetchJson(`https://www.comics.org/api/issue/${issueIds[index]}/?format=json`);
    issueRows.push({
      gcd_id: issueIds[index],
      series_gcd_id: gcdId,
      publisher_gcd_id: publisherGcdId,
      issue_number: issueJson.number ?? null,
      title: resolveTitle(issueJson),
      publication_date: issueJson.publication_date || null,
      key_date: issueJson.key_date || null,
    });
    const { error } = await supabase.from("gcd_issues").upsert(issueRows[index], { onConflict: "gcd_id" });
    if (error) throw error;
    if (index < issueIds.length - 1) await sleep(SLEEP_MS);
  }

  const seriesValues = {
    gcd_id: gcdId,
    title: seriesJson.name,
    issue_count_cached: cachedIssueCount(issueRows),
    year_start_cached: seriesJson.year_began || null,
    year_end_cached: seriesJson.year_ended || seriesJson.year_began || null,
    resolved_publisher_cached: resolvedPublisher,
    us_market: usMarket,
    search_refreshed_at: new Date().toISOString(),
  };
  const { data: existing, error: existingError } = await supabase.from("series").select("id").eq("gcd_id", gcdId).maybeSingle();
  if (existingError) throw existingError;
  const result = existing
    ? await supabase.from("series").update(seriesValues).eq("id", existing.id).select("id").single()
    : await supabase.from("series").insert(seriesValues).select("id").single();
  if (result.error) throw result.error;
  console.log(`Imported ${seriesJson.name} (gcd_id ${gcdId}): ${issueRows.length} issue rows, series id ${result.data.id}`);
}

async function main() {
  if (!gcdIds.length) throw new Error("Usage: node scripts/importGcdSeries.js --gcd-ids=15154,...");
  for (let index = 0; index < gcdIds.length; index += 1) {
    if (index) await sleep(SLEEP_MS);
    await importOne(gcdIds[index]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = error instanceof RateLimited ? 3 : 1;
});
