// Changing which version of an issue a library copy is: the regular cover,
// the newsstand, a second printing, Cover B. Each of those is its own GCD
// issue row (gcd_issues.base_gcd_issue_id points at the regular one), so
// "my copy is the newsstand" means moving user_collections.gcd_issue_id to
// that row. That is what gives the copy the right cover, barcode and value.
//
// Plain functions only, so node --test can load this without Next.js.

import { matchVariantCovers } from "./variantCovers.js";
import { coverThumb } from "./coverThumb.js";
import { parseUpc } from "./printings.js";

const toId = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

// Newsstand, direct, Canadian, price and later-printing editions print the
// regular cover's art (only the barcode box or price differs). A cover
// variant does not, whatever else its name says.
const SAME_ART = /\b(newsstand|direct|canadian|british|uk|australian|whitman|printing|print|price|mark jewelers?|reprint|edition|sales)\b/i;
const OWN_ART = /\b(cover|variant|virgin|sketch|incentive|foil|blank|exclusive|ratio|homage)\b|\d+\s*:\s*\d+/i;
export function sharesRegularArt(name) {
  const text = String(name ?? "");
  return SAME_ART.test(text) && !OWN_ART.test(text);
}

// The picker's tiles, regular edition first. A version without a catalog
// cover of its own borrows a ComicVine variant image when
// matchVariantCovers ties that image to it, and the regular cover only when
// it is an edition that prints the same art. A Cover B tile showing Cover
// A's art would be a lie.
export function versionChoices(issue) {
  const baseGcdId = toId(issue?.base_gcd_issue_id);
  const versions = [...(issue?.versions ?? [])];
  if (baseGcdId && !versions.some((version) => toId(version.gcdId) === baseGcdId)) {
    versions.unshift({ gcdId: baseGcdId, name: "Regular edition", cover: null });
  }
  const matched = matchVariantCovers(versions, issue?.variants, { baseGcdId, seriesTitle: issue?.series_title });
  const imageByVersion = new Map();
  for (const image of matched) {
    if (image.versionGcdId && !imageByVersion.has(image.versionGcdId)) imageByVersion.set(image.versionGcdId, image.storageUrl);
  }
  return versions.map((version) => {
    const gcdId = toId(version.gcdId);
    const isBase = gcdId === baseGcdId;
    const cover = version.cover || imageByVersion.get(gcdId)
      || (isBase || sharesRegularArt(version.name) ? issue?.cover : null) || null;
    return {
      gcdId,
      name: isBase && (!version.name || version.name === "Base edition") ? "Regular edition" : version.name,
      isBase,
      onSaleDate: version.onSaleDate ?? null,
      price: version.price ?? null,
      barcode: version.barcode ?? null,
      cover: cover ? coverThumb(cover) : null,
    };
  }).filter((version) => version.gcdId);
}

// What the library prints in brackets after the title. The regular edition
// needs no label; anything else says which version it is.
export function labelForVersion({ gcdId, baseGcdId, variantName }) {
  if (toId(gcdId) && toId(gcdId) === toId(baseGcdId)) return null;
  const name = String(variantName ?? "").trim();
  return name ? name.slice(0, 60) : null;
}

// user_cover_url holds either the collector's own photo (comic-covers
// bucket) or a catalog cover they picked (canonical-covers). A picked cover
// belonged to the old version, so it goes; their own photo stays.
export function isPickedCatalogCover(url) {
  return typeof url === "string" && url.includes("/storage/v1/object/public/canonical-covers/");
}

// What a barcode read means for one copy.
//   same         the barcode is the version this copy already is
//   version      one other version of this issue: offer to switch
//   pick-version several versions share the code (main code without the
//                5-digit add-on, e.g. Cover A and Cover B): let them pick
//   other-issue  the barcode names one different issue: offer to move it there
//   pick-issue   several other issues share the code (usually the main code
//                alone, shared by a whole run): let them pick, never guess
//   unknown      no issue on file has this barcode
export function barcodeVerdict({ upc, matched, candidates = [], familyIds = [], currentGcdId }) {
  const list = (candidates ?? []).filter((candidate) => toId(candidate?.gcd_issue_id));
  if (!matched || !list.length) return { kind: "unknown" };
  const current = toId(currentGcdId);
  // The copy's own issue always counts, even before the version list loads.
  const family = new Set([...(familyIds ?? []), current].map(toId).filter(Boolean));
  const inFamily = list.filter((candidate) => family.has(toId(candidate.gcd_issue_id)));
  if (inFamily.length === 1) {
    const target = inFamily[0];
    return { kind: toId(target.gcd_issue_id) === current ? "same" : "version", target };
  }
  if (inFamily.length > 1) return { kind: "pick-version", candidates: inFamily };
  // Even a read with its add-on is not always unique: the short 2-digit
  // add-on repeats, so 07148602457605 is both Amazing Spider-Man #300
  // newsstand (1988) and #51 (2003). Only one candidate names the issue.
  if (list.length === 1) return { kind: "other-issue", target: list[0] };
  const withAddOn = Boolean(parseUpc(upc)?.hasSupplement);
  return { kind: "pick-issue", withAddOn, candidates: list.slice(0, 12) };
}
