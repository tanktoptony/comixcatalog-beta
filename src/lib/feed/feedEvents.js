// The collector feed on Your shelf: what members just added, want, listed
// or finished. Pure functions only; src/lib/feed/loadFeed.js does the reads.
// Relative imports so `node --test` can load it.
//
// A bulk import adds hundreds of books in a minute (6,891 adds in the week
// to 2026-11-20, most of them imports), so the feed never shows single
// rows. Books group into one event per collector, per kind, per UTC day:
// "@tanktop__ added 112 books" with the newest covers.

import { isVisibleActivity } from "../activityFeed.js";
import { issueNumbersBySeries, MIN_RUN_SIZE } from "../runCompletion.js";

export const FEED_WINDOW_DAYS = 30;
export const FEED_EVENT_LIMIT = 20;
export const BOOKS_PER_EVENT = 6;
// Finishing a run is checked for at most this many recent (member, series)
// pairs per load, newest first, so one big import can't fan out into
// hundreds of series reads.
export const RUN_CHECK_LIMIT = 40;

const VERB_BY_STATUS = { owned: "added", for_sale: "added", wishlist: "wants" };

export function feedSince(now = new Date(), days = FEED_WINDOW_DAYS) {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

// Listings come from the marketplace_listings view, which already hides
// sellers who aren't public or hide their for-sale list. This repeats that
// check so the feed never relies on the view alone.
export function isVisibleListing(profile) {
  return Boolean(profile?.username) && profile.is_public === true && profile.show_for_sale !== false;
}

// rows: user_collections { user_id, status, gcd_issue_id, created_at }
// listings: marketplace_listings rows (seller_id, created_at, ...)
// profilesById: Map of profile rows keyed by id (string)
// Returns flat items { user_id, verb, at, gcd_issue_id, listing? }, privacy
// checked. Local comics (no gcd_issue_id) are left out: they have no page.
export function feedItems({ rows = [], listings = [], profilesById }) {
  const profileOf = (id) => profilesById.get(String(id));
  const items = [];
  for (const row of rows) {
    const verb = VERB_BY_STATUS[row.status];
    if (!verb || row.gcd_issue_id == null) continue;
    if (!isVisibleActivity(row, profileOf(row.user_id))) continue;
    items.push({ user_id: String(row.user_id), verb, at: row.created_at, gcd_issue_id: Number(row.gcd_issue_id) });
  }
  for (const listing of listings) {
    if (listing.gcd_issue_id == null || !isVisibleListing(profileOf(listing.seller_id))) continue;
    items.push({ user_id: String(listing.seller_id), verb: "listed", at: listing.created_at,
      gcd_issue_id: Number(listing.gcd_issue_id), listing });
  }
  return items;
}

const dayOf = (at) => String(at).slice(0, 10);

// One event per (member, verb, UTC day). Books inside an event are newest
// first and counted once per issue, so two copies of the same book read as
// one. Listings count per copy: each one is its own thing to buy.
export function groupFeed(items, { limit = FEED_EVENT_LIMIT, perEvent = BOOKS_PER_EVENT } = {}) {
  const groups = new Map();
  const sorted = [...items].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  for (const item of sorted) {
    const id = `${item.user_id}|${item.verb}|${dayOf(item.at)}`;
    let group = groups.get(id);
    if (!group) {
      group = { id, user_id: item.user_id, verb: item.verb, at: item.at, count: 0, books: [], seen: new Set() };
      groups.set(id, group);
    }
    const key = item.listing ? `l:${item.listing.id}` : `i:${item.gcd_issue_id}`;
    if (group.seen.has(key)) continue;
    group.seen.add(key);
    group.count += 1;
    if (group.books.length < perEvent) group.books.push(item.listing ? { gcd_issue_id: item.gcd_issue_id, listing: item.listing } : { gcd_issue_id: item.gcd_issue_id });
  }
  return [...groups.values()]
    .map(({ seen, ...event }) => event)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, limit);
}

// Recent "added" items -> the (member, series) pairs worth checking for a
// finished run, newest first. issueById maps gcd_id -> { series_gcd_id }.
export function runCandidates(items, issueById, limit = RUN_CHECK_LIMIT) {
  const pairs = new Map();
  const sorted = items.filter((item) => item.verb === "added")
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  for (const item of sorted) {
    const seriesId = issueById.get(item.gcd_issue_id)?.series_gcd_id;
    if (seriesId == null) continue;
    const key = `${item.user_id}|${seriesId}`;
    if (!pairs.has(key)) pairs.set(key, { user_id: item.user_id, series_gcd_id: Number(seriesId) });
    if (pairs.size >= limit) break;
  }
  return [...pairs.values()];
}

// candidates: from runCandidates. seriesIssueRows: every gcd_issues row
// { gcd_id, series_gcd_id, issue_number } of the candidate series.
// ownedRows: the candidates' owned user_collections rows in those series,
// all time { user_id, gcd_issue_id, created_at }.
// A run is finished when the member owns every base issue number of a
// series with at least MIN_RUN_SIZE of them (the same rule as the shelf's
// "Runs complete" count). It happened when the last of those books went in,
// and only that moment, if it falls on or after `since`, counts. Returns
// one entry per run; groupFinished turns them into feed events.
export function finishedRuns({ candidates, seriesIssueRows, ownedRows, since }) {
  const totals = issueNumbersBySeries(seriesIssueRows);
  const issueById = new Map(seriesIssueRows.map((row) => [Number(row.gcd_id), row]));
  const ownedByPair = new Map();
  for (const row of ownedRows) {
    const issue = issueById.get(Number(row.gcd_issue_id));
    if (!issue) continue;
    const key = `${row.user_id}|${issue.series_gcd_id}`;
    if (!ownedByPair.has(key)) ownedByPair.set(key, []);
    ownedByPair.get(key).push({ ...row, issue });
  }
  const events = [];
  for (const { user_id, series_gcd_id } of candidates) {
    const total = totals.get(series_gcd_id);
    if (!total || total.size < MIN_RUN_SIZE) continue;
    const owned = ownedByPair.get(`${user_id}|${series_gcd_id}`) ?? [];
    const ownedNumbers = issueNumbersBySeries(owned.map((row) => row.issue)).get(series_gcd_id) ?? new Set();
    if ([...total].some((number) => !ownedNumbers.has(number))) continue;
    const last = owned.reduce((best, row) => (!best || String(row.created_at) > String(best.created_at) ? row : best), null);
    if (!last || String(last.created_at) < String(since)) continue;
    events.push({ user_id: String(user_id), at: last.created_at, count: total.size, series_gcd_id,
      books: [{ gcd_issue_id: Number(last.gcd_issue_id) }] });
  }
  return events;
}

// One import can close several runs at once: fold a member's runs finished
// on the same UTC day into one event, newest run first.
export function groupFinished(runs) {
  const groups = new Map();
  for (const run of [...runs].sort((a, b) => String(b.at).localeCompare(String(a.at)))) {
    const id = `${run.user_id}|finished|${dayOf(run.at)}`;
    if (!groups.has(id)) groups.set(id, { id, user_id: run.user_id, verb: "finished", at: run.at, count: 0, runs: [], books: [] });
    const group = groups.get(id);
    group.count += 1;
    group.runs.push({ series_gcd_id: run.series_gcd_id, total: run.count });
    if (group.books.length < BOOKS_PER_EVENT) group.books.push(...run.books);
  }
  return [...groups.values()];
}

export function mergeEvents(groups, runs, limit = FEED_EVENT_LIMIT) {
  return [...groups, ...runs].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
}

// The blocked set for a viewer: anyone they blocked or who blocked them.
export function blockedIds(blockRows, viewerId) {
  const viewer = String(viewerId);
  const out = new Set();
  for (const row of blockRows ?? []) {
    if (String(row.blocker_id) === viewer) out.add(String(row.blocked_id));
    if (String(row.blocked_id) === viewer) out.add(String(row.blocker_id));
  }
  return out;
}
