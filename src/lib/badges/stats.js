import { isOwnedStatus } from "../collectionStatus.js";
import { eraForYear } from "../keyTimeline.js";
import { bestYearFor } from "../years.js";
import { fetchAllPages } from "../supabase/fetchAllPages.js";
import { TEST_ACCOUNT_USERNAMES } from "../traction.js";

const publisherBucket = (value) => {
  const name = String(value ?? "").toLowerCase();
  if (name.includes("marvel")) return "marvel";
  if (name === "dc" || name.includes("dc comics")) return "dc";
  if (name.includes("image")) return "image";
  return name ? "indie" : null;
};

// The issue number before any variant label: "100 [Canadian]" is 100, "0 (1)"
// is 0. "01" stays "01" (a zero-padded #1, not a #0), and "100/101" stays
// whole, so a combined issue doesn't count as a #100.
export function baseIssueNumber(value) {
  return String(value ?? "").trim().split(/[\s[(]/)[0];
}

const SPECIAL_NUMBERS = {
  zeroIssueCount: (n) => n === "0",
  halfIssueCount: (n) => n === "1/2" || n === "½",
  centennialCount: (n) => n === "100",
  oneMillionCount: (n) => n === "1,000,000" || n === "1000000",
};

const catalogIssueId = (row) => (row.gcd_issue_id == null ? Number.NaN : Number(row.gcd_issue_id));

export function reduceBadgeStats({ collections = [], issues = [], series = [], keys = [], rulings = [], followingCount = 0, recruitCount = 0, matchedScanCount = 0, profile = null, sharedIssueIds = null }) {
  const issueById = new Map(issues.map((row) => [Number(row.gcd_id), row]));
  const seriesById = new Map(series.map((row) => [Number(row.gcd_id), row]));
  const latestRuling = new Map();
  for (const row of rulings) if (!latestRuling.has(Number(row.gcd_issue_id))) latestRuling.set(Number(row.gcd_issue_id), row);
  const validKeys = new Map(keys.filter((row) => latestRuling.get(Number(row.gcd_issue_id))?.verdict !== "not_key").map((row) => [Number(row.gcd_issue_id), row]));
  const owned = collections.filter((row) => isOwnedStatus(row.status));
  // A hand-added book has no catalog issue: Number(null) would make it issue 0.
  const ownedIssueIds = new Set(owned.map(catalogIssueId).filter(Number.isFinite));
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

  // Secret badge counts.
  const special = Object.fromEntries(Object.keys(SPECIAL_NUMBERS).map((field) => [field, 0]));
  const copiesByIssue = new Map();
  const addsByDay = new Map();
  const yearsBySeries = new Map();
  for (const row of owned) {
    const issueId = catalogIssueId(row);
    const issue = issueById.get(issueId);
    const number = baseIssueNumber(issue?.issue_number);
    for (const [field, matches] of Object.entries(SPECIAL_NUMBERS)) if (issue && matches(number)) special[field] += 1;
    if (Number.isFinite(issueId)) copiesByIssue.set(issueId, (copiesByIssue.get(issueId) ?? 0) + 1);
    const day = String(row.created_at ?? "").slice(0, 10);
    if (day) addsByDay.set(day, (addsByDay.get(day) ?? 0) + 1);
    const year = bestYearFor(issue ?? {});
    if (year && issue?.series_gcd_id != null) {
      const span = yearsBySeries.get(Number(issue.series_gcd_id)) ?? { min: year, max: year };
      yearsBySeries.set(Number(issue.series_gcd_id), { min: Math.min(span.min, year), max: Math.max(span.max, year) });
    }
  }
  const spans = [...yearsBySeries.values()].map((span) => span.max - span.min);

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
    ...special,
    duplicateIssueCount: [...copiesByIssue.values()].filter((copies) => copies > 1).length,
    busiestDayAdds: Math.max(0, ...addsByDay.values()),
    seriesSpanYears: Math.max(0, ...spans),
    // Owned books no other collector owns. Unknown (0) when the caller didn't
    // look up who else owns them.
    uniqueBookCount: sharedIssueIds ? [...ownedIssueIds].filter((id) => !sharedIssueIds.has(id)).length : 0,
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

// Newest ruling first, in chunks: thousands of ids in one .in() make the URL
// too long and the whole sync failed with "Bad Request" (a 6,790-book
// collection had no badges at all, 2026-11-21).
async function loadRulings(db, issueIds) {
  const rows = [];
  for (let index = 0; index < issueIds.length; index += 500) {
    const chunk = issueIds.slice(index, index + 500);
    rows.push(...await fetchAllPages(() => db.from("key_rulings").select("id,gcd_issue_id,verdict,ruled_at").in("gcd_issue_id", chunk).is("reverted_at", null).neq("action", "fix_reason"), "id"));
  }
  return rows.sort((left, right) => String(right.ruled_at).localeCompare(String(left.ruled_at)));
}

// Which of these issues another collector also owns. Test accounts don't
// count as another collector.
async function loadSharedIssueIds(db, userId, issueIds) {
  const { data: testProfiles, error } = await db.from("profiles").select("id").in("username", [...TEST_ACCOUNT_USERNAMES]);
  if (error) throw error;
  const ignored = new Set([userId, ...(testProfiles ?? []).map((row) => row.id)]);
  const shared = new Set();
  for (let index = 0; index < issueIds.length; index += 500) {
    const chunk = issueIds.slice(index, index + 500);
    const rows = await fetchAllPages(() => db.from("user_collections").select("id,user_id,gcd_issue_id").in("gcd_issue_id", chunk).in("status", ["owned", "for_sale"]).neq("user_id", userId), "id");
    for (const row of rows) if (!ignored.has(row.user_id)) shared.add(Number(row.gcd_issue_id));
  }
  return shared;
}

export async function buildBadgeStats(db, userId) {
  const collections = await fetchAllPages(() => db.from("user_collections").select("id,status,gcd_issue_id,slab_company,grade_numeric,created_at").eq("user_id", userId));
  const issueIds = [...new Set(collections.map((row) => Number(row.gcd_issue_id)).filter(Number.isFinite))];
  const issues = issueIds.length ? await chunked(db, "gcd_issues", "gcd_id,series_gcd_id,publication_date,key_date,variant_of_gcd_id", "gcd_id", issueIds) : [];
  const seriesIds = [...new Set(issues.map((row) => Number(row.series_gcd_id)).filter(Number.isFinite))];
  const allSeriesIssuesPromise = seriesIds.length ? chunked(db, "gcd_issues", "gcd_id,series_gcd_id,variant_of_gcd_id,issue_number,publication_date,key_date", "series_gcd_id", seriesIds) : Promise.resolve([]);
  const [series, keys, rulings, allSeriesIssues, profileResult, followsResult, recruitsResult, scansResult, sharedIssueIds] = await Promise.all([
    seriesIds.length ? chunked(db, "series", "id,gcd_id,resolved_publisher_cached", "gcd_id", seriesIds, "id") : [],
    issueIds.length ? chunked(db, "key_issues", "id,gcd_issue_id,tier", "gcd_issue_id", issueIds, "id") : [],
    issueIds.length ? loadRulings(db, issueIds) : [],
    allSeriesIssuesPromise,
    db.from("profiles").select("is_founding_collector,created_at").eq("id", userId).single(),
    db.from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", userId),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("invited_by", userId),
    db.from("cover_scans").select("id", { count: "exact", head: true }).eq("user_id", userId).not("chosen_gcd_issue_id", "is", null),
    issueIds.length ? loadSharedIssueIds(db, userId, issueIds) : new Set(),
  ]);
  const profile = profileResult.data ?? {};
  if (profile.is_founding_collector) {
    const earlier = await db.from("profiles").select("id", { count: "exact", head: true }).eq("is_founding_collector", true).lte("created_at", profile.created_at);
    profile.founding_number = earlier.count ?? null;
  }
  return reduceBadgeStats({ collections, issues: allSeriesIssues, series, keys, rulings, profile, followingCount: followsResult.count, recruitCount: recruitsResult.count, matchedScanCount: scansResult.count, sharedIssueIds });
}
