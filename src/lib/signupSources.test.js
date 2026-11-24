// Signups by source in the Monday email. Run: npm run test:signup-sources

import test from "node:test";
import assert from "node:assert/strict";

import { buildSignupSources, signupChannel, signupSourcesHtml, sourceReportFrom } from "./signupSources.js";

const NOW = Date.parse("2026-11-16T13:00:00Z");
const row = (username, created_at, signup_source, signup_medium, signup_campaign, invited_by = null) => ({ username, created_at, signup_source, signup_medium, signup_campaign, invited_by });
const find = (report, name) => report.channels.find((line) => line.name === name);

test("every kind of link lands on its own line", () => {
  assert.deepEqual(signupChannel(row("a", "", "youtube", "video", "yt-doom")), { channel: "YouTube", detail: "yt-doom" });
  assert.deepEqual(signupChannel(row("a", "", "instagram", "social", "vs-longbox")), { channel: "Instagram", detail: "vs-longbox" });
  assert.deepEqual(signupChannel(row("a", "", "challengers", "print", "shop-kit")), { channel: "Shop bookmarks", detail: "challengers" });
  assert.deepEqual(signupChannel(row("a", "", "invite", "referral", "member-invite")), { channel: "Member invites", detail: null });
  assert.deepEqual(signupChannel(row("a", "", "bing", "organic", null)), { channel: "Search", detail: "bing" });
  assert.deepEqual(signupChannel(row("a", "", "direct", "none", null)), { channel: "Direct", detail: null });
  assert.deepEqual(signupChannel(row("a", "", "leagueofcomicgeeks.com", "referral", null)), { channel: "Other sites", detail: "leagueofcomicgeeks.com" });
  assert.deepEqual(signupChannel(row("a", "", null, null, null)), { channel: "No source saved", detail: null });
});

test("campaigns roll up under their channel, in both windows", () => {
  const report = buildSignupSources([
    row("old1", "2026-11-03T18:00:00Z", "instagram", "social", "vs-bio"),
    row("old2", "2026-11-03T19:00:00Z", "instagram", "social", "vs-bio"),
    row("new1", "2026-11-12T10:00:00Z", "instagram", "social", "vs-longbox"),
    row("new2", "2026-11-13T10:00:00Z", "youtube", "video", "yt-doom"),
    row("new3", "2026-11-14T10:00:00Z", "youtube", "video", "yt-amory1"),
    row("new4", "2026-11-14T11:00:00Z", "challengers", "print", "shop-kit"),
    row("new5", "2026-11-15T10:00:00Z", "bing", "organic", null),
  ], NOW);
  assert.equal(report.last7, 5);
  assert.equal(report.since, 7);
  assert.deepEqual([find(report, "Instagram").last7, find(report, "Instagram").since], [1, 3]);
  assert.deepEqual(find(report, "Instagram").details.map((d) => [d.name, d.last7, d.since]), [["vs-bio", 0, 2], ["vs-longbox", 1, 1]]);
  assert.deepEqual(find(report, "YouTube").details.map((d) => d.name).sort(), ["yt-amory1", "yt-doom"]);
  assert.equal(find(report, "YouTube").last7, 2);
  assert.equal(find(report, "Shop bookmarks").details[0].name, "challengers");
  assert.equal(report.channels[0].name, "Instagram", "biggest channel first");
});

test("test accounts never count", () => {
  const report = buildSignupSources([row("test_tony", "2026-11-14T10:00:00Z", "bing", "organic", null)], NOW);
  assert.equal(report.since, 0);
  assert.deepEqual(report.channels, []);
});

test("an invite counts even when the first touch was somewhere else, and never twice", () => {
  const report = buildSignupSources([
    row("a", "2026-11-14T10:00:00Z", "invite", "referral", "member-invite", "inviter-id"),
    row("b", "2026-11-14T10:00:00Z", "bing", "organic", null, "inviter-id"),
    row("c", "2026-11-14T10:00:00Z", "invite", "referral", "member-invite"),
  ], NOW);
  assert.equal(report.since, 3);
  assert.equal(find(report, "Member invites").since, 2);
  assert.equal(find(report, "Search").since, 1);
  assert.deepEqual(report.invited, { last7: 2, since: 2 });
});

test("the 7-day window can reach before Nov 3 without changing the since count", () => {
  const nov5 = Date.parse("2026-11-05T13:00:00Z");
  assert.equal(sourceReportFrom(nov5), new Date(nov5 - 7 * 864e5).toISOString());
  assert.equal(sourceReportFrom(NOW), "2026-11-03T00:00:00.000Z");
  const report = buildSignupSources([row("a", "2026-11-01T10:00:00Z", null, null, null)], nov5);
  assert.deepEqual([report.last7, report.since], [1, 0]);
});

test("a signup outside both windows is ignored", () => {
  const report = buildSignupSources([row("a", "2026-10-24T10:00:00Z", "bing", "organic", null)], NOW);
  assert.deepEqual([report.last7, report.since], [0, 0]);
});

test("the email shows the rollup and escapes whatever the account saved", () => {
  const html = signupSourcesHtml(buildSignupSources([
    row("a", "2026-11-14T10:00:00Z", "youtube", "video", "yt-doom"),
    row("b", "2026-11-14T10:00:00Z", "<b>x</b>", "referral", null),
  ], NOW));
  assert.ok(html.includes("Signups by source"));
  assert.ok(html.includes("YouTube"));
  assert.ok(html.includes("yt-doom"));
  assert.ok(html.includes("Since Nov 3"));
  assert.ok(!html.includes("<b>x</b>"));
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
});
