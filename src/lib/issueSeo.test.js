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

test("no credits preserves the existing metadata and JSON-LD shape", () => {
  assert.equal(buildIssueDescription(baseIssue), "Wolverine / Punisher: Revelation #1, published by Marvel Comics in 1999. Cover, release date and story details, plus copies for sale from collectors.");
  assert.equal(buildIssueJsonLd(baseIssue, "gcd-1").author, undefined);
});

test("credits enrich the description and ComicIssue JSON-LD", () => {
  const issue = { ...baseIssue, credits: [
    { role: "writer", name: "Ann Writer", slug: "ann-writer" },
    { role: "penciller", name: "Pat Artist", slug: "pat-artist" },
    { role: "inker", name: "Inez Ink", slug: "inez-ink" },
  ], stories: [{ characters: "Hero, Villain", synopsis: "A short adventure." }] };
  assert.match(buildIssueDescription(issue), /By Ann Writer and Pat Artist\./);
  const jsonLd = buildIssueJsonLd(issue, "gcd-1");
  assert.equal(jsonLd.author[0].name, "Ann Writer");
  assert.equal(jsonLd.illustrator[0].name, "Pat Artist");
  assert.equal(jsonLd.inker[0].name, "Inez Ink");
  assert.deepEqual(jsonLd.character.map((entry) => entry.name), ["Hero", "Villain"]);
});

test("long story synopsis is truncated to 300 characters", () => {
  const jsonLd = buildIssueJsonLd({ ...baseIssue, stories: [{ synopsis: "x".repeat(400) }] }, "gcd-1");
  assert.equal(jsonLd.abstract.length, 300);
  assert.match(jsonLd.abstract, /\.\.\.$/);
  assert.equal(jsonLd.description, jsonLd.abstract);
});
