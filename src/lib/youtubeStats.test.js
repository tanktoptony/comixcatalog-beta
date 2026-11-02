import test from "node:test";
import assert from "node:assert/strict";
import { aggregateReach, completedWeeks, parseCsv, parseIsoDuration, weeklyReach, youtubeDigestHtml } from "./youtubeStats.js";

test("completedWeeks returns completed UTC weeks newest first", () => {
  assert.deepEqual(completedWeeks(new Date("2026-11-09T12:00:00Z"), 2), [
    { start: "2026-11-02", end: "2026-11-08" },
    { start: "2026-10-26", end: "2026-11-01" },
  ]);
  assert.deepEqual(completedWeeks(new Date("2026-11-08T23:59:59Z"), 1), [{ start: "2026-10-26", end: "2026-11-01" }]);
  assert.deepEqual(completedWeeks(new Date("2027-01-04T00:00:00Z"), 1), [{ start: "2026-12-28", end: "2027-01-03" }]);
});

test("parseCsv handles RFC 4180 quoting and CRLF", () => {
  const rows = parseCsv('name,note\r\n"A, B","line 1\nline 2 with ""quotes"""\r\n');
  assert.deepEqual(rows, [{ name: "A, B", note: 'line 1\nline 2 with "quotes"' }]);
});

test("aggregateReach sums dimensions and weights CTR", () => {
  const rows = aggregateReach([
    { date: "20261102", video_id: "a", video_thumbnail_impressions: "100", video_thumbnail_impressions_ctr: "0.1", country: "US" },
    { date: "20261102", video_id: "a", video_thumbnail_impressions: "300", video_thumbnail_impressions_ctr: "0.2", country: "CA" },
    { date: "20261102", video_id: "", video_thumbnail_impressions: "50", video_thumbnail_impressions_ctr: "0.5" },
  ]);
  assert.deepEqual(rows, [{ day: "2026-11-02", video_id: "a", impressions: 400, clicks: 70 }]);
});

test("aggregateReach treats an entire percent report consistently", () => {
  const rows = aggregateReach([
    { date: "20261102", video_id: "a", video_thumbnail_impressions: "100", video_thumbnail_impressions_ctr: "5" },
    { date: "20261102", video_id: "a", video_thumbnail_impressions: "100", video_thumbnail_impressions_ctr: "1" },
  ]);
  assert.equal(rows[0].clicks, 6);
});

test("weeklyReach filters dates and leaves zero-impression CTR null", () => {
  const result = weeklyReach([
    { day: "2026-11-02", video_id: "a", impressions: 100, clicks: 5 },
    { day: "2026-11-03", video_id: "b", impressions: 0, clicks: 0 },
    { day: "2026-11-09", video_id: "a", impressions: 200, clicks: 20 },
  ], { start: "2026-11-02", end: "2026-11-08" });
  assert.deepEqual(result.videos.get("a"), { impressions: 100, impressions_ctr: 0.05 });
  assert.deepEqual(result.videos.get("b"), { impressions: 0, impressions_ctr: null });
  assert.deepEqual(result.channel, { impressions: 100, impressions_ctr: 0.05 });
  assert.deepEqual(weeklyReach([], { start: "2026-11-02", end: "2026-11-08" }).channel, { impressions: null, impressions_ctr: null });
});

test("parseIsoDuration parses videos and rejects junk", () => {
  assert.equal(parseIsoDuration("PT1M6S"), 66);
  assert.equal(parseIsoDuration("PT2H3M4S"), 7384);
  assert.equal(parseIsoDuration("junk"), null);
});

test("youtubeDigestHtml formats deltas and escapes titles", () => {
  const html = youtubeDigestHtml({
    thisWeek: { views: 112, watch_minutes: 90, subscribers_gained: 4, subscribers_lost: 1, impressions: 1000, impressions_ctr: null },
    lastWeek: { views: 100, watch_minutes: 0, subscribers_gained: 0, subscribers_lost: 0, impressions: 1030, impressions_ctr: null },
    topVideos: [{ title: 'A & <B> "C"', views: 50, subscribers_gained: 2, subscribers_lost: 1, impressions_ctr: null }],
  });
  assert.match(html, /views <strong>112<\/strong> \(\+12%\)/);
  assert.match(html, /watch hours <strong>1\.5<\/strong> \(new\)/);
  assert.match(html, /impressions <strong>1,000<\/strong> \(-3%\)/);
  assert.match(html, /CTR <strong>n\/a<\/strong> \(new\)/);
  assert.match(html, /A &amp; &lt;B&gt; &quot;C&quot;/);
  assert.match(youtubeDigestHtml({ thisWeek: { views: 1, impressions: null }, lastWeek: null }), /impressions <strong>n\/a<\/strong>,/);
  assert.equal(youtubeDigestHtml({ thisWeek: null, lastWeek: null, topVideos: [] }), "");
});
