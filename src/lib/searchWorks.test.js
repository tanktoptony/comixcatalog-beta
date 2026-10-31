import assert from "node:assert/strict";
import test from "node:test";
import { editionGroup, foldWorks, summarizeEditions } from "./searchWorks.js";

test("summarizeEditions groups WicDiv editions and orders their covers", () => {
  const work = { id: "work-id", title: "The Wicked + The Divine" };
  const editions = [
    { id: "special-2", gcd_id: 455, title: "Special 2", issue_count: 0, card_cover_path: "special-455.jpg", role: "special", format: { publishing_format: "one-shot" } },
    { id: "tpb", gcd_id: 98792, title: "The Wicked + The Divine", issue_count: 9, card_cover_path: "tpb.jpg", role: "collected", format: { publishing_format: "collected edition", binding: "trade paperback" } },
    { id: "hc", gcd_id: 104218, title: "The Wicked + The Divine Hardcover", issue_count: 4, card_cover_path: "hc.jpg", role: "collected", format: { publishing_format: "collected edition", binding: "hardcover" } },
    { id: "compendium", gcd_id: 224382, title: "The Wicked + The Divine Compendium", issue_count: 1, card_cover_path: null, role: "collected", format: { publishing_format: "collected edition", binding: "trade paperback" } },
    ...[1831, 1373, 1923, 3000, 4000].map((gcdId, index) => ({
      id: `special-${gcdId}`,
      gcd_id: gcdId,
      title: `Special ${index}`,
      issue_count: 1,
      card_cover_path: gcdId === 1373 ? "special-1373.jpg" : null,
      role: "special",
      format: { publishing_format: "one-shot" },
    })),
  ];

  const result = summarizeEditions({ work, editions });
  assert.equal(result.total_books, 20);
  assert.deepEqual(result.groups.map((group) => group.label), ["TPB", "HC", "Compendium", "Specials"]);
  assert.deepEqual(result.groups[0], {
    label: "TPB", books: 9, series_count: 1, series_id: "tpb", cover_path: "tpb.jpg", href: "/work/work-id?tab=tpb",
  });
  assert.equal(result.groups[1].books, 4);
  assert.equal(result.groups[2].href, "/work/work-id?tab=compendium");
  assert.deepEqual(result.groups[3], {
    label: "Specials", books: 6, series_count: 6, series_id: null, cover_path: "special-455.jpg", href: "/work/work-id?tab=specials",
  });
});

test("summarizeEditions links several TPB series to the work tab", () => {
  const result = summarizeEditions({
    work: { id: "work-id", title: "Saga & Friends" },
    editions: [1, 2].map((gcdId) => ({
      id: `tpb-${gcdId}`,
      gcd_id: gcdId,
      title: "Saga & Friends",
      issue_count: 1,
      card_cover_path: null,
      role: "collected",
      format: { publishing_format: "collected edition", binding: "trade paperback" },
    })),
  });
  assert.equal(result.groups[0].href, "/work/work-id?tab=tpb");
});

test("editionGroup provides stable labels and slugs", () => {
  assert.deepEqual(editionGroup({ title: "Absolute Batman", role: "collected", format: { publishing_format: "collected edition", binding: "hardcover" } }), { label: "Absolute", slug: "absolute" });
  assert.deepEqual(editionGroup({ title: "Annual", role: "special", format: {} }), { label: "Specials", slug: "specials" });
});

test("foldWorks removes editions whose work is present and keeps orphaned editions", () => {
  const work = { id: "work", gcd_id: 10, title: "Hush" };
  const folded = foldWorks([
    { id: "edition", gcd_id: 11, work_gcd_id: 10 },
    work,
    { id: "orphan", gcd_id: 12, work_gcd_id: 99 },
    { id: "other", gcd_id: 13 },
  ]);
  assert.deepEqual(folded, [work, { id: "orphan", gcd_id: 12, work_gcd_id: 99 }, { id: "other", gcd_id: 13 }]);
});
