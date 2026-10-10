import assert from "node:assert/strict";
import test from "node:test";
import { buildSeriesDescription, buildSeriesIntro, seriesJsonLd } from "./seriesSeo.js";
import { safeJsonLd } from "./jsonLd.js";

test("describes a single-issue one-shot without calling it a series", () => {
  assert.equal(buildSeriesIntro({ title: "Solo", publisher: "Example", issue_count: 1, year_start: 2020, year_end: 2020, format_noun: "one-shot" }), "Solo is a one-shot from Example, published in 2020.");
});

test("describes a multi-year series span", () => {
  assert.equal(buildSeriesIntro({ title: "Long Run", publisher: "Example", issue_count: 12, year_start: 1963, year_end: 2011 }), "Long Run is a 12-issue series from Example, published from 1963 to 2011.");
});

test("omits dates when years are unknown", () => {
  assert.equal(buildSeriesIntro({ title: "Unknown", publisher: "Example", issue_count: 4 }), "Unknown is a 4-issue series from Example.");
});

test("describes a collected edition from known format data", () => {
  assert.equal(buildSeriesIntro({ title: "Collection", publisher: "Example", issue_count: 2, year_start: 2024, format_noun: "collected edition" }), "Collection is a collected edition from Example, published in 2024.");
});

test("safe JSON-LD escapes a quoted title and closing script text", () => {
  const json = safeJsonLd(seriesJsonLd({ title: 'The "Best" </script>', publisher: "Example", year_start: 2024, year_end: 2024 }, "https://example.com/series/1"));
  assert.match(json, /\\"Best\\"/);
  assert.doesNotMatch(json, /<\/script>/);
  assert.equal(JSON.parse(json).name, 'The "Best" </script>');
});

test("metadata keeps key issue numbers within its length target", () => {
  const description = buildSeriesDescription({ title: "A".repeat(170), key_issues: [{ issue_number: "1" }, { issue_number: "129" }] });
  assert.ok(description.length <= 160);
  assert.match(description, /Key issues: #1, #129\.$/);
});

test("intro only calls out creators at the 40 percent threshold", () => {
  const top_creators = { writers: [{ name: "A Writer", issues: 4 }], artists: [{ name: "An Artist", issues: 3 }] };
  assert.equal(buildSeriesIntro({ title: "Run", issue_count: 10, top_creators }), "Run is a 10-issue series. Written mostly by A Writer.");
  assert.doesNotMatch(buildSeriesIntro({ title: "Run", issue_count: 11, top_creators }), /mostly/);
});

test("creator threshold uses issues with credits when that count is available", () => {
  const intro = buildSeriesIntro({
    title: "Run",
    issue_count: 100,
    top_creators: { writers: [{ name: "A Writer", issues: 4 }], artists: [] },
    creator_credited_issues: { writers: 10, artists: 0 },
  });
  assert.match(intro, /Written mostly by A Writer/);
});

test("metadata includes the top writer and artist", () => {
  const description = buildSeriesDescription({ title: "Run", issue_count: 10, top_creators: { writers: [{ name: "A Writer", issues: 2 }], artists: [{ name: "An Artist", issues: 2 }] } });
  assert.match(description, /Writer: A Writer\./);
  assert.match(description, /Artist: An Artist\./);
  assert.ok(description.length <= 160);
});
