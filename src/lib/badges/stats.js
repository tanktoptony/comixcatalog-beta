import { isOwnedStatus } from "../collectionStatus.js";
import { eraForYear } from "../keyTimeline.js";
import { bestYearFor } from "../years.js";
import { fetchAllPages } from "../supabase/fetchAllPages.js";

const publisherBucket = (value) => {
  const name = String(value ?? "").toLowerCase();
  if (name.includes("marvel")) return "marvel";
  if (name === "dc" || name.includes("dc comics")) return "dc";
  if (name.includes("image")) return "image";
  return name ? "indie" : null;
};

export function reduceBadgeStats({ collections = [], issues = [], series = [], keys = [], rulings = [], followingCount = 0, recruitCount = 0, matchedScanCount = 0, profile = null }) {
  const issueById = new Map(issues.map((row) => [Number(row.gcd_id), row]));
  const seriesById = new Map(series.map((row) => [Number(row.gcd_id), row]));
  const latestRuling = new Map();
  for (const row of rulings) if (!latestRuling.has(Number(row.gcd_issue_id))) latestRuling.set(Number(row.gcd_issue_id), row);
  const validKeys = new Map(keys.filter((row) => latestRuling.get(Number(row.gcd_issue_id))?.verdict !== "not_key").map((row) => [Number(row.gcd_issue_id), row]));
  const owned = collections.filter((row) => isOwnedStatus(row.status));
  const ownedIssueIds = new Set(owned.map((row) => Number(row.gcd_issue_id)).filter(Number.isFinite));
  const eraCounts = {};
  const publisherCounts = { marvel: 0, dc: 0, image: 0 };
  const indiePublishers = new Set();
  const ownedBySeries = new Map();
  let silverKeyCount = 0;
  for (const row of owned) {
    const issue = issueById.get(Number(row.gcd_issue_id));
    const era = eraForYear(bestYearFor(issue ?? {}))?.id;
    if (era) eraCounts[era] = (eraCounts[era] ?? 0) + 1;
    const seriesRow = seriesById.get(Number(issue?.series_gcd_id));
    const bucket = publisherBucket(seriesRow?.resolved_publisher_cached);
    if (bucket === "indie") indiePublishers.add(seriesRow.resolved_publisher_cached.trim().toLowerCase());
    else if (bucket) publisherCounts[bucket] += 1;
    if (issue?.series_gcd_id != null) {
      if (!ownedBySeries.has(Number(issue.series_gcd_id))) ownedBySeries.set(Number(issue.series_gcd_id), new Set());
      ownedBySeries.get(Number(issue.series_gcd_id)).add(Number(issue.gcd_id));
    }
    if (era === "silver" && validKeys.has(Number(row.gcd_issue_id))) silverKeyCount += 1;
  }
  const basesBySeries = new Map();
  for (const issue of issues) {
    if (issue.variant_of_gcd_id != null || issue.series_gcd_id == null) continue;
    if (!basesBySeries.has(Number(issue.series_gcd_id))) basesBySeries.set(Number(issue.series_gcd_id), new Set());
    basesBySeries.get(Number(issue.series_gcd_id)).add(Number(issue.gcd_id));
  }
  const completedSizes = [];
  for (const [seriesId, baseIds] of basesBySeries) {
    if (baseIds.size < 4) continue;
    const held = ownedBySeries.get(seriesId) ?? new Set();
    if ([...baseIds].every((id) => held.has(id))) completedSizes.push(baseIds.size);
  }
  const ownedKeys = [...ownedIssueIds].map((id) => validKeys.get(id)).filter(Boolean);
  return {
    ownedCount: owned.length,
    wantlistCount: collections.filter((row) => row.status === "wishlist").length,
    keyCount: ownedKeys.length,
    majorKeyCount: ownedKeys.filter((row) => Number(row.tier) === 1).length,
    silverKeyCount,
    eraCounts,
    publisherCounts,
    indiePublisherCount: indiePublishers.size,
    completedRunCount: completedSizes.length,
    longRunCount: completedSizes.filter((size) => size >= 100).length,
    slabbedCount: owned.filter((row) => Boolean(row.slab_company)).length,
    nineEightCount: owned.filter((row) => Boolean(row.slab_company) && Number(row.grade_numeric) === 9.8).length,
    followingCount,
    recruitCount,
    matchedScanCount,
    isFoundingCollector: Boolean(profile?.is_founding_collector),
    foundingNumber: profile?.founding_number ?? null,
  };
}

async function chunked(db, table, select, column, ids, orderColumn = "gcd_id") {
  const rows = [];
  for (let index = 0; index < ids.length; index += 500) {
    const chunk = ids.slice(index, index + 500);
    rows.push(...await fetchAllPages(() => db.from(table).select(select).in(column, chunk), orderColumn));
  }
  return rows;
}

export async function buildBadgeStats(db, userId) {
  const collections = await fetchAllPages(() => db.from("user_collections").select("id,status,gcd_issue_id,slab_company,grade_numeric,created_at").eq("user_id", userId));
  const issueIds = [...new Set(collections.map((row) => Number(row.gcd_issue_id)).filter(Number.isFinite))];
  const issues = issueIds.length ? await chunked(db, "gcd_issues", "gcd_id,series_gcd_id,publication_date,key_date,variant_of_gcd_id", "gcd_id", issueIds) : [];
  const seriesIds = [...new Set(issues.map((row) => Number(row.series_gcd_id)).filter(Number.isFinite))];
  const allSeriesIssuesPromise = seriesIds.length ? chunked(db, "gcd_issues", "gcd_id,series_gcd_id,variant_of_gcd_id,publication_date,key_date", "series_gcd_id", seriesIds) : Promise.resolve([]);
  const [series, keys, rulings, allSeriesIssues, profileResult, followsResult, recruitsResult, scansResult] = await Promise.all([
    seriesIds.length ? chunked(db, "series", "id,gcd_id,resolved_publisher_cached", "gcd_id", seriesIds, "id") : [],
    issueIds.length ? chunked(db, "key_issues", "id,gcd_issue_id,tier", "gcd_issue_id", issueIds, "id") : [],
    issueIds.length ? db.from("key_rulings").select("gcd_issue_id,verdict,ruled_at").in("gcd_issue_id", issueIds).is("reverted_at", null).neq("action", "fix_reason").order("ruled_at", { ascending: false }).then(({ data, error }) => { if (error) throw error; return data ?? []; }) : [],
    allSeriesIssuesPromise,
    db.from("profiles").select("is_founding_collector,created_at").eq("id", userId).single(),
    db.from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", userId),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("invited_by", userId),
    db.from("cover_scans").select("id", { count: "exact", head: true }).eq("user_id", userId).not("chosen_gcd_issue_id", "is", null),
  ]);
  const profile = profileResult.data ?? {};
  if (profile.is_founding_collector) {
    const earlier = await db.from("profiles").select("id", { count: "exact", head: true }).eq("is_founding_collector", true).lte("created_at", profile.created_at);
    profile.founding_number = earlier.count ?? null;
  }
  return reduceBadgeStats({ collections, issues: allSeriesIssues, series, keys, rulings, profile, followingCount: followsResult.count, recruitCount: recruitsResult.count, matchedScanCount: scansResult.count });
}
