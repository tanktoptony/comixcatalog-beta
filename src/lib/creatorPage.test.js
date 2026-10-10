import assert from "node:assert/strict";
import test from "node:test";
import { buildCreatorRuns, buildCreatorSummary, creatorJsonLd, formatIssueRange } from "./creatorPage.js";
import { safeJsonLd } from "./jsonLd.js";

test("non-numeric issue numbers fall back to a count", () => {
  assert.equal(formatIssueRange(["1", "Annual 1", "2"]), "3 issues");
});

test("a single-issue run shows its issue number", () => {
  const runs = buildCreatorRuns(
    [{ gcd_issue_id: 10, role: "writer" }],
    [{ gcd_id: 10, series_gcd_id: 20, issue_number: "94" }],
    [{ id: "series-id", gcd_id: 20, title: "X-Men" }]
  );
  assert.equal(runs[0].issue_range, "#94");
  assert.equal(runs[0].issue_count, 1);
});

test("capped creator copy discloses the first 3,000 credits", () => {
  const text = buildCreatorSummary({ name: "Stan Lee", credit_count: 5000, role_counts: { writer: 3000 }, capped: true });
  assert.match(text, /has 5,000 credits/);
  assert.match(text, /showing the first 3,000 credits\.$/);
});

test("a quoted creator name is safely escaped in JSON-LD", () => {
  const json = safeJsonLd(creatorJsonLd({ name: 'Chris "Ace" Writer </script>', role_counts: { writer: 2 } }, "https://example.com/creator/chris"));
  assert.match(json, /\\"Ace\\"/);
  assert.doesNotMatch(json, /<\/script>/);
  assert.equal(JSON.parse(json).name, 'Chris "Ace" Writer </script>');
});
