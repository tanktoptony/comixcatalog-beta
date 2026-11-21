import assert from "node:assert/strict";
import test from "node:test";
import { blockedIds, feedItems, feedSince, finishedRuns, groupFeed, groupFinished, mergeEvents, runCandidates } from "./feedEvents.js";

const pub = (id, extra = {}) => [id, { id, username: `u${id}`, is_public: true, ...extra }];
const profiles = new Map([pub("a"), pub("b"), pub("priv", { is_public: false }), pub("hidewant", { show_wantlist: false }),
  pub("hidesale", { show_for_sale: false }), ["nameless", { id: "nameless", is_public: true }]]);
const row = (user_id, status, gcd_issue_id, created_at) => ({ user_id, status, gcd_issue_id, created_at });

test("feedItems keeps only what the member shows publicly", () => {
  const items = feedItems({
    profilesById: profiles,
    rows: [
      row("a", "owned", 1, "2026-11-20T10:00:00Z"),
      row("a", "for_sale", 2, "2026-11-20T10:01:00Z"),
      row("a", "wishlist", 3, "2026-11-20T10:02:00Z"),
      row("a", "owned", null, "2026-11-20T10:03:00Z"),
      row("priv", "owned", 4, "2026-11-20T10:00:00Z"),
      row("hidewant", "wishlist", 5, "2026-11-20T10:00:00Z"),
      row("hidewant", "owned", 6, "2026-11-20T10:00:00Z"),
      row("nameless", "owned", 7, "2026-11-20T10:00:00Z"),
    ],
    listings: [
      { id: "L1", seller_id: "b", gcd_issue_id: 8, created_at: "2026-11-20T11:00:00Z" },
      { id: "L2", seller_id: "hidesale", gcd_issue_id: 9, created_at: "2026-11-20T11:00:00Z" },
      { id: "L3", seller_id: "priv", gcd_issue_id: 10, created_at: "2026-11-20T11:00:00Z" },
    ],
  });
  assert.deepEqual(items.map((i) => `${i.user_id}:${i.verb}:${i.gcd_issue_id}`).sort(),
    ["a:added:1", "a:added:2", "a:wants:3", "b:listed:8", "hidewant:added:6"]);
});

test("groupFeed makes one event per member, kind and day, newest books first", () => {
  const items = [
    ...Array.from({ length: 9 }, (_, i) => ({ user_id: "a", verb: "added", at: `2026-11-20T10:0${i}:00Z`, gcd_issue_id: i + 1 })),
    { user_id: "a", verb: "added", at: "2026-11-20T11:00:00Z", gcd_issue_id: 3 },
    { user_id: "a", verb: "added", at: "2026-11-19T09:00:00Z", gcd_issue_id: 50 },
    { user_id: "b", verb: "wants", at: "2026-11-20T12:00:00Z", gcd_issue_id: 60 },
  ];
  const events = groupFeed(items);
  assert.deepEqual(events.map((e) => [e.user_id, e.verb, e.count]), [["b", "wants", 1], ["a", "added", 9], ["a", "added", 1]]);
  assert.equal(events[1].at, "2026-11-20T11:00:00Z");
  assert.deepEqual(events[1].books.map((b) => b.gcd_issue_id), [3, 9, 8, 7, 6, 5]);
});

test("groupFeed counts listings per copy, not per issue", () => {
  const listing = (id) => ({ user_id: "b", verb: "listed", at: "2026-11-20T12:00:00Z", gcd_issue_id: 8, listing: { id } });
  const [event] = groupFeed([listing("L1"), listing("L2")]);
  assert.equal(event.count, 2);
  assert.deepEqual(event.books.map((b) => b.listing.id), ["L1", "L2"]);
});

const series = (seriesId, numbers, firstId) => numbers.map((n, i) => ({ gcd_id: firstId + i, series_gcd_id: seriesId, issue_number: n }));

test("finishedRuns reports a run completed by a recent add, and only then", () => {
  const saga = series(500, ["1", "2", "3", "3 [Variant]"], 100);
  const short = series(600, ["1", "2"], 200);
  const old = series(700, ["1", "2", "3"], 300);
  const owned = [
    { user_id: "a", gcd_issue_id: 100, created_at: "2026-10-01T00:00:00Z" },
    { user_id: "a", gcd_issue_id: 101, created_at: "2026-10-02T00:00:00Z" },
    { user_id: "a", gcd_issue_id: 103, created_at: "2026-11-20T09:00:00Z" },
    { user_id: "a", gcd_issue_id: 200, created_at: "2026-11-20T09:00:00Z" },
    { user_id: "a", gcd_issue_id: 201, created_at: "2026-11-20T09:00:00Z" },
    { user_id: "b", gcd_issue_id: 100, created_at: "2026-11-20T09:00:00Z" },
    { user_id: "b", gcd_issue_id: 101, created_at: "2026-11-20T09:00:00Z" },
    ...[300, 301, 302].map((id) => ({ user_id: "a", gcd_issue_id: id, created_at: "2026-09-01T00:00:00Z" })),
  ];
  const events = finishedRuns({
    candidates: [{ user_id: "a", series_gcd_id: 500 }, { user_id: "a", series_gcd_id: 600 }, { user_id: "b", series_gcd_id: 500 }, { user_id: "a", series_gcd_id: 700 }],
    seriesIssueRows: [...saga, ...short, ...old], ownedRows: owned, since: "2026-10-21T00:00:00Z",
  });
  // a owns #1, #2 and the #3 variant: finished, dated by the variant that closed it.
  // 600 is under the three-issue minimum, b is missing #3, 700 was finished before the window.
  assert.deepEqual(events, [{ user_id: "a", at: "2026-11-20T09:00:00Z", count: 3, series_gcd_id: 500, books: [{ gcd_issue_id: 103 }] }]);
});

test("groupFinished folds one member's runs from the same day into one event", () => {
  const run = (user_id, series_gcd_id, at, count) => ({ user_id, series_gcd_id, at, count, books: [{ gcd_issue_id: series_gcd_id * 10 }] });
  const events = groupFinished([run("a", 1, "2026-11-18T23:36:00Z", 283), run("a", 2, "2026-11-18T23:39:00Z", 25), run("a", 3, "2026-11-17T10:00:00Z", 4), run("b", 4, "2026-11-18T23:00:00Z", 6)]);
  assert.deepEqual(events.map((e) => [e.id, e.count, e.at, e.runs.map((r) => r.series_gcd_id)]), [
    ["a|finished|2026-11-18", 2, "2026-11-18T23:39:00Z", [2, 1]],
    ["b|finished|2026-11-18", 1, "2026-11-18T23:00:00Z", [4]],
    ["a|finished|2026-11-17", 1, "2026-11-17T10:00:00Z", [3]],
  ]);
  assert.deepEqual(events[0].runs[0], { series_gcd_id: 2, total: 25 });
  assert.deepEqual(events[0].books, [{ gcd_issue_id: 20 }, { gcd_issue_id: 10 }]);
});

test("runCandidates walks recent adds newest first, one pair per member and series, capped", () => {
  const issueById = new Map([[1, { series_gcd_id: 10 }], [2, { series_gcd_id: 10 }], [3, { series_gcd_id: 20 }], [4, { series_gcd_id: 30 }]]);
  const items = [
    { user_id: "a", verb: "added", at: "2026-11-20T01:00:00Z", gcd_issue_id: 1 },
    { user_id: "a", verb: "added", at: "2026-11-20T02:00:00Z", gcd_issue_id: 2 },
    { user_id: "a", verb: "wants", at: "2026-11-20T03:00:00Z", gcd_issue_id: 3 },
    { user_id: "b", verb: "added", at: "2026-11-20T04:00:00Z", gcd_issue_id: 4 },
    { user_id: "a", verb: "added", at: "2026-11-20T00:30:00Z", gcd_issue_id: 3 },
  ];
  assert.deepEqual(runCandidates(items, issueById), [{ user_id: "b", series_gcd_id: 30 }, { user_id: "a", series_gcd_id: 10 }, { user_id: "a", series_gcd_id: 20 }]);
  assert.equal(runCandidates(items, issueById, 1).length, 1);
});

test("mergeEvents interleaves by time and caps; blockedIds works both ways; feedSince counts back", () => {
  const merged = mergeEvents([{ at: "2026-11-20T01:00:00Z" }, { at: "2026-11-18T01:00:00Z" }], [{ at: "2026-11-19T01:00:00Z" }], 2);
  assert.deepEqual(merged.map((e) => e.at), ["2026-11-20T01:00:00Z", "2026-11-19T01:00:00Z"]);
  assert.deepEqual([...blockedIds([{ blocker_id: "me", blocked_id: "x" }, { blocker_id: "y", blocked_id: "me" }, { blocker_id: "p", blocked_id: "q" }], "me")].sort(), ["x", "y"]);
  assert.equal(feedSince(new Date("2026-11-21T00:00:00Z"), 30), "2026-10-22T00:00:00.000Z");
});
