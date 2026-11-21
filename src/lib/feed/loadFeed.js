// Reads for the collector feed (GET /api/feed). The grouping and privacy
// rules live in feedEvents.js; this file loads rows, hydrates covers and
// caches.
//
// Each member's events are computed once and cached for five minutes, keyed
// on their privacy settings, so changing a setting takes effect on the next
// load. A viewer's Following feed and the Everyone feed are merges of those
// cached lists, and one active member costs about ten reads no matter how
// many people follow them. Everything runs on the service role, so the
// profile check in feedEvents.js is the only privacy gate.
//
// Everyone finds its members with one discovery read per active member
// (activeMemberIds). Past a few hundred active members that wants an RPC
// returning the active ids directly.

import { unstable_cache } from "next/cache";
import { canonicalCoverUrl, resolveCovers } from "@/lib/catalog/covers";
import { OWNED_STATUSES } from "@/lib/collectionStatus";
import { coverUrlFromPath } from "@/lib/listingRow";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";
import { getServiceClient } from "@/lib/supabase/service";
import { excludeTestAccounts } from "@/lib/traction";
import {
  BOOKS_PER_EVENT, blockedIds, feedItems, feedSince, finishedRuns, groupFeed, groupFinished, mergeEvents, runCandidates,
} from "./feedEvents.js";

const ROWS_PER_MEMBER = 1000;
const EVENTS_PER_MEMBER = 10;
const CHUNK = 300;
const CONCURRENCY = 6;
// In the Everyone feed one member's import shouldn't fill the page.
const EVERYONE_PER_MEMBER = 2;
const MAX_DISCOVERY_ROUNDS = 100;
const PROFILE_COLUMNS = "id, username, display_name, avatar_url, avatar_key, is_public, show_collection, show_wantlist, show_for_sale";
const LISTING_COLUMNS = "id, seller_id, gcd_issue_id, created_at, price_cents, series_title, issue_number, cover_path";

const chunks = (values, size = CHUNK) => Array.from({ length: Math.ceil(values.length / size) }, (_, i) => values.slice(i * size, (i + 1) * size));

async function mapLimit(values, fn, limit = CONCURRENCY) {
  const out = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      out[index] = await fn(values[index], index);
    }
  }));
  return out;
}

function must(result, what) {
  if (result.error) throw new Error(`${what} failed: ${result.error.message}`);
  return result.data ?? [];
}

// Who a viewer has blocked or been blocked by, as a Set of ids.
export async function loadBlocked(supabase, viewerId) {
  const rows = must(await supabase.from("user_blocks").select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`), "feed block lookup");
  return blockedIds(rows, viewerId);
}

async function loadRunEvents(supabase, profile, items, since) {
  const recentIds = [...new Set(items.filter((item) => item.verb === "added")
    .sort((a, b) => String(b.at).localeCompare(String(a.at))).map((item) => item.gcd_issue_id))].slice(0, 500);
  if (!recentIds.length) return [];
  const issueRows = must(await supabase.from("gcd_issues").select("gcd_id, series_gcd_id").in("gcd_id", recentIds), "feed recent issues");
  const candidates = runCandidates(items, new Map(issueRows.map((row) => [Number(row.gcd_id), row])));
  if (!candidates.length) return [];
  const seriesIds = [...new Set(candidates.map((pair) => pair.series_gcd_id))];
  const seriesIssueRows = (await mapLimit(chunks(seriesIds, 40), (group) => fetchAllPages(() => supabase.from("gcd_issues")
    .select("gcd_id, series_gcd_id, issue_number").in("series_gcd_id", group), "gcd_id"))).flat();
  const issueIds = seriesIssueRows.map((row) => Number(row.gcd_id));
  const ownedRows = (await mapLimit(chunks(issueIds), (group) => fetchAllPages(() => supabase.from("user_collections")
    .select("id, user_id, gcd_issue_id, created_at").eq("user_id", profile.id).in("status", OWNED_STATUSES)
    .in("gcd_issue_id", group)))).flat();
  return groupFinished(finishedRuns({ candidates, seriesIssueRows, ownedRows, since }));
}

// Turn one member's events into what the page shows: titles, covers, links.
async function hydrate(supabase, events) {
  const ids = [...new Set(events.flatMap((event) => event.books.filter((book) => !book.listing).map((book) => book.gcd_issue_id)))];
  const runSeriesIds = events.flatMap((event) => (event.runs ?? []).map((run) => run.series_gcd_id));
  const issueRows = ids.length ? must(await supabase.from("gcd_issues").select("gcd_id, series_gcd_id, issue_number").in("gcd_id", ids), "feed issues") : [];
  const seriesGcdIds = [...new Set([...issueRows.map((row) => row.series_gcd_id), ...runSeriesIds].filter((id) => id != null))];
  const seriesRows = seriesGcdIds.length ? must(await supabase.from("series")
    .select("id, gcd_id, title, resolved_publisher_cached, year_start_cached, year_end_cached").in("gcd_id", seriesGcdIds), "feed series") : [];
  const seriesByGcd = new Map(seriesRows.map((row) => [Number(row.gcd_id), row]));
  const covers = await resolveCovers(supabase, issueRows.map((row) => {
    const series = seriesByGcd.get(Number(row.series_gcd_id));
    return { gcd_issue_id: Number(row.gcd_id), series_gcd_id: row.series_gcd_id, issue_number: row.issue_number,
      series_title: series?.title, publisher: series?.resolved_publisher_cached,
      series_year_start: series?.year_start_cached, series_year_end: series?.year_end_cached };
  }));
  const issueById = new Map(issueRows.map((row) => [Number(row.gcd_id), row]));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  return events.map((event) => {
    const books = event.books.map((book) => {
      if (book.listing) {
        const l = book.listing;
        return { gcd_issue_id: book.gcd_issue_id, title: l.series_title || "Untitled", issue_number: l.issue_number ?? "",
          cover_url: coverUrlFromPath(l.cover_path, supabaseUrl), href: `/listing/${l.id}`,
          price: l.price_cents != null ? l.price_cents / 100 : null };
      }
      const issue = issueById.get(book.gcd_issue_id);
      const series = issue ? seriesByGcd.get(Number(issue.series_gcd_id)) : null;
      if (!issue || !series) return null;
      return { gcd_issue_id: book.gcd_issue_id, title: series.title, issue_number: issue.issue_number ?? "",
        cover_url: canonicalCoverUrl(covers.get(book.gcd_issue_id)?.storage_path), href: `/issue/gcd-${book.gcd_issue_id}` };
    }).filter(Boolean);
    if (event.verb !== "finished") return { ...event, books };
    const runs = event.runs.map((run) => {
      const series = seriesByGcd.get(Number(run.series_gcd_id));
      return series ? { title: series.title, total: run.total, href: `/series/${series.id}` } : null;
    }).filter(Boolean);
    return { ...event, count: runs.length, runs, books };
  }).filter((event) => event.books.length > 0 && (event.verb !== "finished" || event.runs.length > 0));
}

async function computeMemberEvents(profile, since) {
  const supabase = getServiceClient();
  const profilesById = new Map([[String(profile.id), profile]]);
  const [rows, listings] = await Promise.all([
    supabase.from("user_collections").select("user_id, status, gcd_issue_id, created_at")
      .eq("user_id", profile.id).in("status", ["owned", "for_sale", "wishlist"]).not("gcd_issue_id", "is", null)
      .gte("created_at", since).order("created_at", { ascending: false }).limit(ROWS_PER_MEMBER),
    supabase.from("marketplace_listings").select(LISTING_COLUMNS)
      .eq("seller_id", profile.id).gte("created_at", since).order("created_at", { ascending: false }).limit(ROWS_PER_MEMBER),
  ]);
  const collectionRows = must(rows, "feed collection rows");
  const items = feedItems({ rows: collectionRows, listings: must(listings, "feed listings"), profilesById });
  if (!items.length) return [];
  const runs = await loadRunEvents(supabase, profile, items, since);
  const events = mergeEvents(groupFeed(items, { limit: EVENTS_PER_MEMBER, perEvent: BOOKS_PER_EVENT }), runs, EVENTS_PER_MEMBER);
  // A full read means older adds were cut off: the oldest day shown may be
  // missing some, so its count is a floor.
  if (collectionRows.length === ROWS_PER_MEMBER) {
    const cutDay = String(collectionRows.at(-1).created_at).slice(0, 10);
    for (const event of events) {
      if (event.verb !== "listed" && event.verb !== "finished" && String(event.at).slice(0, 10) === cutDay) event.count_is_floor = true;
    }
  }
  return hydrate(supabase, events);
}

// The window start is rounded to the hour so the cache key holds steady.
function sinceHour() {
  return `${feedSince().slice(0, 13)}:00:00.000Z`;
}

const cachedMemberEvents = unstable_cache(
  async (profile, since) => computeMemberEvents(profile, since),
  ["feed-member-v2"],
  { revalidate: 300 }
);

const privacyKey = (p) => ({ id: String(p.id), username: p.username, is_public: p.is_public === true,
  show_collection: p.show_collection !== false, show_wantlist: p.show_wantlist !== false, show_for_sale: p.show_for_sale !== false });

async function eventsFor(profiles, { perMember = Infinity } = {}) {
  const since = sinceHour();
  const lists = await mapLimit(profiles, async (profile) => {
    try {
      return (await cachedMemberEvents(privacyKey(profile), since)).slice(0, perMember);
    } catch (error) {
      console.error("feed member load failed:", profile.id, error.message);
      return null;
    }
  });
  const byId = new Map(profiles.map((p) => [String(p.id), p]));
  const events = lists.filter(Boolean).flat().map((event) => {
    const p = byId.get(event.user_id);
    return { ...event, user: { username: p.username, display_name: p.display_name ?? null, avatar_url: p.avatar_url ?? null, avatar_key: p.avatar_key ?? null } };
  });
  return { events: mergeEvents(events, []), degraded: lists.some((list) => list === null) };
}

async function visibleProfiles(supabase, ids) {
  const rows = [];
  for (const group of chunks(ids)) rows.push(...must(await supabase.from("profiles").select(PROFILE_COLUMNS).in("id", group), "feed profiles"));
  return rows.filter((p) => p.username && p.is_public === true);
}

export async function loadFollowingFeed(viewerId) {
  const supabase = getServiceClient();
  const [followRows, blocked] = await Promise.all([
    supabase.from("follows").select("followee_id").eq("follower_id", viewerId),
    loadBlocked(supabase, viewerId),
  ]);
  const ids = must(followRows, "feed follows").map((row) => String(row.followee_id)).filter((id) => !blocked.has(id));
  if (!ids.length) return { following: 0, events: [], degraded: false };
  // Test accounts (TEST_ACCOUNT_USERNAMES) never show, even to a follower.
  const profiles = excludeTestAccounts(await visibleProfiles(supabase, ids));
  return { following: ids.length, ...(await eventsFor(profiles)) };
}

// Every member with a book or listing in the window. Each read skips the
// members already found, so a bulk import can't hide anyone: discovery costs
// at most one read per active member.
const activeMemberIds = unstable_cache(async (since) => {
  const supabase = getServiceClient();
  const found = new Set(must(await supabase.from("marketplace_listings").select("seller_id")
    .gte("created_at", since).limit(1000), "feed active sellers").map((r) => String(r.seller_id)));
  for (let round = 0; round < MAX_DISCOVERY_ROUNDS; round += 1) {
    let query = supabase.from("user_collections").select("user_id").not("gcd_issue_id", "is", null).gte("created_at", since);
    if (found.size) query = query.not("user_id", "in", `(${[...found].join(",")})`);
    const rows = must(await query.limit(500), "feed active members");
    if (!rows.length) break;
    for (const row of rows) found.add(String(row.user_id));
  }
  return [...found];
}, ["feed-active-members-v2"], { revalidate: 300 });

export async function loadEveryoneFeed(viewerId) {
  const supabase = getServiceClient();
  const [ids, blocked] = await Promise.all([activeMemberIds(sinceHour()), loadBlocked(supabase, viewerId)]);
  // The viewer's own activity is already on their shelf; Everyone is other collectors.
  const others = ids.filter((id) => !blocked.has(id) && id !== String(viewerId));
  const profiles = excludeTestAccounts(await visibleProfiles(supabase, others));
  return eventsFor(profiles, { perMember: EVERYONE_PER_MEMBER });
}
