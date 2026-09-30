// First-touch campaign attribution (Instagram funnel).
//
// Run: npm run test:attribution

import test from "node:test";
import assert from "node:assert/strict";

import { parseAttribution, isFresh, attributionParams } from "./attribution.js";

const qs = (s) => new URLSearchParams(s);
const NOW = 1_800_000_000_000;

test("reads the Instagram bio link's utm params", () => {
  const a = parseAttribution(
    qs("utm_source=instagram&utm_medium=social&utm_campaign=profile"),
    "/start",
    NOW
  );
  assert.deepEqual(a, {
    source: "instagram",
    medium: "social",
    campaign: "profile",
    landing: "/start",
    ts: NOW,
  });
});

test("no campaign signal means nothing is stored", () => {
  assert.equal(parseAttribution(qs(""), "/start", NOW), null);
  assert.equal(parseAttribution(qs("q=x-men"), "/start", NOW), null);
});

test("values are normalised to lowercase slugs", () => {
  const a = parseAttribution(qs("utm_source=Instagram"), "/start", NOW);
  assert.equal(a.source, "instagram");
});

test("values that are not campaign slugs are dropped, not stored", () => {
  // These end up in the account's user_metadata, so free text is refused.
  const a = parseAttribution(
    qs("utm_source=instagram&utm_campaign=<script>alert(1)</script>&utm_medium=" + "x".repeat(200)),
    "/start",
    NOW
  );
  assert.deepEqual(Object.keys(a).sort(), ["landing", "source", "ts"]);
});

test("ref is kept only when it is a valid username", () => {
  assert.equal(parseAttribution(qs("ref=tony_c"), "/start", NOW).ref, "tony_c");
  assert.equal(parseAttribution(qs("ref=no spaces allowed"), "/start", NOW), null);
  assert.equal(parseAttribution(qs("ref=ab"), "/start", NOW), null);
});

test("records expire after 30 days", () => {
  assert.equal(isFresh({ ts: NOW - 29 * 864e5 }, NOW), true);
  assert.equal(isFresh({ ts: NOW - 31 * 864e5 }, NOW), false);
  assert.equal(isFresh(null, NOW), false);
  assert.equal(isFresh({}, NOW), false);
});

test("GA params never carry the referrer's username", () => {
  const p = attributionParams({ source: "instagram", medium: "story", campaign: "share_card", ref: "tony_c" });
  assert.deepEqual(p, {
    attr_source: "instagram",
    attr_medium: "story",
    attr_campaign: "share_card",
    attr_has_ref: true,
  });
  assert.ok(!JSON.stringify(p).includes("tony_c"));
});

test("no record means no params", () => {
  assert.deepEqual(attributionParams(null), {});
});
