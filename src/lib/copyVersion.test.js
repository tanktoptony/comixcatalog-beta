import assert from "node:assert/strict";
import test from "node:test";
import { barcodeVerdict, isPickedCatalogCover, labelForVersion, sharesRegularArt, unmatchedCovers, versionChoices } from "./copyVersion.js";

const SUPA = "https://x.supabase.co/storage/v1/object/public";
const cand = (gcd_issue_id, extra = {}) => ({ gcd_issue_id, series_title: "Spawn", issue_number: String(gcd_issue_id), ...extra });

test("barcode for this copy's own version says so", () => {
  const verdict = barcodeVerdict({ upc: "75960608936900111", matched: true, candidates: [cand(10)], familyIds: [10, 11], currentGcdId: 10 });
  assert.equal(verdict.kind, "same");
});

test("barcode for another version of the issue offers that version", () => {
  const verdict = barcodeVerdict({ upc: "75960608936900121", matched: true, candidates: [cand(11)], familyIds: [10, 11], currentGcdId: 10 });
  assert.equal(verdict.kind, "version");
  assert.equal(verdict.target.gcd_issue_id, 11);
});

test("a main-only read shared by several versions asks which one", () => {
  // Cover A and Cover B share the 12-digit code; the run's other issues do too.
  const verdict = barcodeVerdict({ upc: "759606089369", matched: true, candidates: [cand(99), cand(11), cand(10)], familyIds: [10, 11], currentGcdId: 10 });
  assert.equal(verdict.kind, "pick-version");
  assert.deepEqual(verdict.candidates.map((row) => row.gcd_issue_id), [11, 10]);
});

test("a barcode naming one different issue offers to move the copy", () => {
  const verdict = barcodeVerdict({ upc: "75960608936900511", matched: true, candidates: [cand(500)], familyIds: [10, 11], currentGcdId: 10 });
  assert.equal(verdict.kind, "other-issue");
  assert.equal(verdict.target.gcd_issue_id, 500);
});

test("an add-on read shared by two issues still asks, never takes the first", () => {
  // Live case: 07148602457605 is ASM #300 newsstand (1988) and ASM #51 (2003).
  const verdict = barcodeVerdict({ upc: "07148602457605", matched: true, candidates: [cand(500), cand(1266237)], familyIds: [370589], currentGcdId: 370589 });
  assert.equal(verdict.kind, "pick-issue");
  assert.equal(verdict.withAddOn, true);
  assert.equal(verdict.candidates.length, 2);
});

test("a main-only read that names a whole run never guesses one issue", () => {
  const verdict = barcodeVerdict({ upc: "759606089369", matched: true, candidates: [cand(500), cand(501), cand(502)], familyIds: [10, 11], currentGcdId: 10 });
  assert.equal(verdict.kind, "pick-issue");
  assert.equal(verdict.candidates.length, 3);
});

test("an unknown barcode is unknown", () => {
  assert.equal(barcodeVerdict({ upc: "759606089369", matched: false, candidates: [], familyIds: [10], currentGcdId: 10 }).kind, "unknown");
});

test("the regular edition carries no label; other versions carry their name", () => {
  assert.equal(labelForVersion({ gcdId: 10, baseGcdId: 10, variantName: "Direct Edition" }), null);
  assert.equal(labelForVersion({ gcdId: 11, baseGcdId: 10, variantName: "Newsstand" }), "Newsstand");
  assert.equal(labelForVersion({ gcdId: 11, baseGcdId: 10, variantName: "   " }), null);
});

test("only a picked catalog cover counts as replaceable, never the collector's photo", () => {
  assert.equal(isPickedCatalogCover(`${SUPA}/canonical-covers/a/b.jpg`), true);
  assert.equal(isPickedCatalogCover(`${SUPA}/comic-covers/library/abc.jpg?t=1`), false);
  assert.equal(isPickedCatalogCover(null), false);
});

test("version tiles: regular first, thumbs, no borrowed regular cover on a variant", () => {
  const choices = versionChoices({
    base_gcd_issue_id: 10,
    series_title: "Spawn",
    cover: `${SUPA}/canonical-covers/spawn/1.jpg`,
    versions: [
      { gcdId: 10, name: "Base edition", cover: null },
      { gcdId: 11, name: "Newsstand", cover: null },
      { gcdId: 12, name: "Cover B Mattina Variant", cover: null },
    ],
    variants: [{ id: "v1", storageUrl: `${SUPA}/canonical-covers/spawn/1b.jpg`, caption: "Mattina Variant Cover" }],
  });
  assert.deepEqual(choices.map((choice) => choice.name), ["Regular edition", "Newsstand", "Cover B Mattina Variant"]);
  assert.match(choices[0].cover, /cover-thumbs\/w400\/spawn\/1\.jpg\.webp$/);
  // Newsstand prints the regular art, so it shows the regular cover.
  assert.equal(choices[1].cover, choices[0].cover);
  assert.match(choices[2].cover, /spawn\/1b\.jpg\.webp$/);
});

test("version tiles add the regular edition when GCD lists only variants", () => {
  const choices = versionChoices({ base_gcd_issue_id: 10, versions: [{ gcdId: 11, name: "Newsstand" }] });
  assert.deepEqual(choices.map((choice) => [choice.gcdId, choice.isBase]), [[10, true], [11, false]]);
});

test("the copy's own issue counts as its version even before the list loads", () => {
  const verdict = barcodeVerdict({ upc: "75960608936900111", matched: true, candidates: [cand(10)], familyIds: [], currentGcdId: 10 });
  assert.equal(verdict.kind, "same");
});

test("only editions that print the regular art borrow its cover", () => {
  for (const name of ["Newsstand", "Direct Edition", "Canadian", "Second Printing", "3rd Printing", "Whitman"]) {
    assert.equal(sharesRegularArt(name), true, name);
  }
  for (const name of ["Cover B", "Cover B Mattina Variant", "Second Printing Variant", "1:25 Incentive", "Virgin Edition", "Newsstand Blank", "Peach Momoko Variant"]) {
    assert.equal(sharesRegularArt(name), false, name);
  }
  const choices = versionChoices({
    base_gcd_issue_id: 10, cover: `${SUPA}/canonical-covers/a/1.jpg`,
    versions: [{ gcdId: 10, name: "Direct" }, { gcdId: 12, name: "Cover B" }],
  });
  assert.equal(choices[1].cover, null);
});

test("unlabeled covers are offered once, and never one already tied to a version", () => {
  const url = (name) => `${SUPA}/canonical-covers/spawn/${name}.jpg`;
  const covers = unmatchedCovers({
    base_gcd_issue_id: 10,
    series_title: "Spawn",
    cover: url("1"),
    versions: [{ gcdId: 10, name: "Base edition" }, { gcdId: 11, name: "Mattina Variant" }],
    variants: [
      { id: "tied", storageUrl: url("1b"), caption: "Mattina Variant Cover" },
      { id: "a", storageUrl: url("1c"), caption: null },
      { id: "repeat", storageUrl: url("1c"), caption: "" },
      { id: "main", storageUrl: url("1"), caption: null },
      { id: "missing", storageUrl: null, caption: null },
    ],
  });
  assert.deepEqual(covers.map((cover) => cover.id), ["a"]);
  assert.equal(covers[0].url, url("1c"));
  assert.match(covers[0].thumb, /cover-thumbs/);
});

test("an issue with no pictures offers no covers", () => {
  assert.deepEqual(unmatchedCovers({ base_gcd_issue_id: 10, versions: [], variants: [] }), []);
  assert.deepEqual(unmatchedCovers(null), []);
});
