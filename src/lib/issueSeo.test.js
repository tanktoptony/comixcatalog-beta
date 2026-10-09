import test from "node:test";
import assert from "node:assert/strict";
import { buildIssueDescription, buildIssueJsonLd } from "./issueSeo.js";
import { safeJsonLd } from "./jsonLd.js";

const baseIssue = {
  series_title: "Wolverine / Punisher: Revelation",
  issue_number: "1",
  release_year: 1999,
  publisher: "Marvel Comics",
  series_id: "series-1",
  cover: "https://example.com/cover.jpg",
};

test("description handles a missing year", () => {
  const description = buildIssueDescription({ ...baseIssue, release_year: null });
  assert.match(description, /published by Marvel Comics\./);
  assert.doesNotMatch(description, /undefined|null/);
  assert.ok(description.length <= 160);
});

test("description handles a missing publisher", () => {
  const description = buildIssueDescription({ ...baseIssue, publisher: null });
  assert.match(description, /published in 1999\./);
  assert.doesNotMatch(description, /undefined|null/);
});

test("description includes a key-issue reason when it fits", () => {
  const description = buildIssueDescription({
    series_title: "Amazing Fantasy",
    issue_number: "15",
    release_year: 1962,
    publisher: "Marvel Comics",
    key_issue: { reason: "First appearance of Spider-Man" },
  });
  assert.match(description, /Key issue: First appearance of Spider-Man\./);
  assert.ok(description.length <= 160);
});

test("JSON-LD with quotes and a closing script sequence is escaped by safeJsonLd", () => {
  const jsonLd = buildIssueJsonLd({
    ...baseIssue,
    series_title: 'The "Best" </script><script>alert(1)</script>',
  }, "gcd-1");
  const serialized = safeJsonLd(jsonLd);
  assert.equal(serialized.includes("</script>"), false);
  assert.equal(serialized.includes("<"), false);
  assert.deepEqual(JSON.parse(serialized), jsonLd);
});
