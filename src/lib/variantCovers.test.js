import assert from "node:assert/strict";
import test from "node:test";
import { matchVariantCovers, mergeEditionContents } from "./variantCovers.js";

const image = (caption, extra = {}) => ({ id: caption, storageUrl: `/covers/${caption}.jpg`, caption, ...extra });

test("matches a distinctive caption token", () => {
  const [match] = matchVariantCovers(
    [{ gcdId: 1, name: "Base edition" }, { gcdId: 2, name: "Cover B Mattina Variant" }],
    [image("Mattina Variant Cover")],
    { baseGcdId: 1 }
  );
  assert.equal(match.versionGcdId, 2);
});

test("leaves a caption unattached when no edition matches", () => {
  const [match] = matchVariantCovers([{ gcdId: 1, name: "Base edition" }], [image("Textless Cover")], { baseGcdId: 1 });
  assert.equal(match.versionGcdId, null);
});

test("leaves an ambiguous caption unattached", () => {
  const [match] = matchVariantCovers(
    [{ gcdId: 2, name: "Campbell Virgin" }, { gcdId: 3, name: "Campbell Sketch" }],
    [image("Campbell Variant Cover")]
  );
  assert.equal(match.versionGcdId, null);
});

test("an exact non-base GCD issue id wins over the caption", () => {
  const [match] = matchVariantCovers(
    [{ gcdId: 1, name: "Base edition" }, { gcdId: 2, name: "Mattina" }, { gcdId: 3, name: "Campbell" }],
    [image("Mattina Variant Cover", { gcdIssueId: 3 })],
    { baseGcdId: 1 }
  );
  assert.equal(match.versionGcdId, 3);
});

test("a shared first name alone does not attach a cover", () => {
  const [match] = matchVariantCovers(
    [{ gcdId: 1, name: "Base edition" }, { gcdId: 2, name: "Cover A - Ryan Ottley" }],
    [image("Ryan Stegman Variant Cover")],
    { baseGcdId: 1 }
  );
  assert.equal(match.versionGcdId, null);
});

test("a variant with only its cover keeps the base issue's interior credits", () => {
  const base = {
    credits: [{ role: "writer", name: "W" }, { role: "penciller", name: "P" }, { role: "cover", name: "Base Cover" }],
    stories: [{ type: "cover", pencils: "Base Cover" }, { type: "comic story", script: "W" }],
    ad_pages_count: 4,
  };
  const variant = { credits: [{ role: "cover", name: "Mattina" }], stories: [{ type: "cover", pencils: "Mattina" }], ad_pages_count: 0 };
  const merged = mergeEditionContents(base, variant);
  assert.deepEqual(merged.credits.map((c) => c.name), ["Mattina", "W", "P"]);
  assert.deepEqual(merged.stories.map((s) => s.type), ["cover", "comic story"]);
  assert.equal(merged.stories[0].pencils, "Mattina");
  assert.equal(merged.ad_pages_count, 4);
});

test("a fully indexed edition uses its own contents, and an empty one falls back", () => {
  const base = { credits: [{ role: "writer", name: "W" }], stories: [{ type: "comic story" }], ad_pages_count: 2 };
  const full = { credits: [{ role: "writer", name: "W2" }], stories: [{ type: "comic story", title: "Reprint" }], ad_pages_count: 1 };
  assert.deepEqual(mergeEditionContents(base, full).credits.map((c) => c.name), ["W2"]);
  assert.equal(mergeEditionContents(base, full).ad_pages_count, 1);
  assert.deepEqual(mergeEditionContents(base, { credits: [], stories: [] }).credits.map((c) => c.name), ["W"]);
});
