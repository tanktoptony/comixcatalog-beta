import { unstable_cache } from "next/cache";
import { canonicalCoverUrl, resolveCovers } from "./catalog/covers.js";
import { coverThumb } from "./coverThumb.js";
import { OWNED_STATUSES } from "./collectionStatus.js";
import { getServiceClient } from "./supabase/service.js";
import { pickShowcase } from "./foundingShowcasePick.js";

// One book per founder for their tile on the Founding Collectors wall: the
// most valuable owned copy that has a catalog cover, else the newest one.
// Only founders whose collection is public are passed in (see
// foundingRoster.js); the value itself is never shown.

const PER_QUERY = 8;
const CONCURRENCY = 6;

async function candidatesFor(sb, userId) {
  const base = () => sb.from("user_collections")
    .select("gcd_issue_id, market_value, auto_market_value, created_at")
    .eq("user_id", userId)
    .in("status", OWNED_STATUSES)
    .not("gcd_issue_id", "is", null);
  const results = await Promise.all([
    base().not("market_value", "is", null).order("market_value", { ascending: false }).limit(PER_QUERY),
    base().not("auto_market_value", "is", null).order("auto_market_value", { ascending: false }).limit(PER_QUERY),
    base().order("created_at", { ascending: false }).limit(PER_QUERY),
  ]);
  const failed = results.find((result) => result.error);
  if (failed) throw failed.error;
  return results.flatMap((result) => result.data ?? []);
}

async function mapLimit(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function computeShowcase(userIds) {
  const sb = getServiceClient();
  const perUser = await mapLimit(userIds, (id) => candidatesFor(sb, id).catch((error) => {
    console.error("founding showcase candidates failed:", error?.message ?? error);
    return [];
  }));

  const issueIds = [...new Set(perUser.flat().map((row) => Number(row.gcd_issue_id)))];
  if (!issueIds.length) return {};
  const { data: issues, error: issueError } = await sb.from("gcd_issues")
    .select("gcd_id, series_gcd_id, issue_number").in("gcd_id", issueIds);
  if (issueError) throw issueError;
  const seriesIds = [...new Set((issues ?? []).map((row) => row.series_gcd_id).filter(Boolean))];
  const { data: series, error: seriesError } = seriesIds.length
    ? await sb.from("series").select("gcd_id, title, year_start_cached, year_end_cached, resolved_publisher_cached").in("gcd_id", seriesIds)
    : { data: [] };
  if (seriesError) throw seriesError;
  const seriesMap = new Map((series ?? []).map((row) => [Number(row.gcd_id), row]));
  const issueMap = new Map((issues ?? []).map((row) => {
    const s = seriesMap.get(Number(row.series_gcd_id)) ?? {};
    return [Number(row.gcd_id), {
      gcd_issue_id: Number(row.gcd_id),
      series_gcd_id: row.series_gcd_id,
      series_title: s.title,
      issue_number: row.issue_number,
      series_year_start: s.year_start_cached,
      series_year_end: s.year_end_cached,
      publisher: s.resolved_publisher_cached,
    }];
  }));
  const covers = await resolveCovers(sb, [...issueMap.values()]);

  const showcase = {};
  userIds.forEach((userId, index) => {
    const pick = pickShowcase(perUser[index], covers);
    if (!pick) return;
    const issue = issueMap.get(Number(pick.gcd_issue_id));
    const cover = covers.get(Number(pick.gcd_issue_id));
    showcase[userId] = {
      cover: coverThumb(canonicalCoverUrl(cover.storage_path)),
      title: [issue?.series_title, issue?.issue_number ? `#${issue.issue_number}` : null].filter(Boolean).join(" ") || null,
    };
  });
  return showcase;
}

// Cached an hour per set of founders: a tile's book changes rarely, and a
// new founder changes the set, so their tile is filled on the next render.
export const getFoundingShowcase = unstable_cache(
  async (userIds) => computeShowcase(userIds),
  ["founding-showcase-v1"],
  { revalidate: 3600 }
);
