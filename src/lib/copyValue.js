// The whole valuation chain for one copy, in one place. src/lib/marketValue.js
// (library, public profile, PDF, share cards) and
// scripts/snapshotCollectionValue.js (the stored value the home page shows)
// both call this, so the two numbers can't drift apart again: until
// 2026-11-20 the snapshot skipped the regular cover's comps and the home page
// showed a different total from the library. Relative imports only, so plain
// `node scripts/...` can load it.
//
// Order:
//   1. This edition's PriceCharting guide price.
//   2. This edition's comps (compValue.js), unless it is a later printing.
//   3. The regular cover's guide price, then the regular cover's comps
//      (flagged regular_cover), for variant covers only.
//   4. Whatever step 2 gave: the cover-price floor from 1990 on, else no value.
//
// Later printings (2nd printing, reprint, facsimile) never borrow the first
// printing's value and never use their own comp pool. eBay searches for a
// later printing return mostly first-printing listings: a TMNT #2 (1984)
// second printing was valued at $500 from first-printing CGC 9.8 asking
// prices, then at $165.71 from the first printing's guide row. The honest
// answer without a guide row of its own is the floor or no value.

import { valueFromComps } from "./compValue.js";
import { pcValueForIssue, pcValueForRegularCover } from "./pcValue.js";

const ORDINAL = "(?:2nd|3rd|[4-9]th|1[0-9]th|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)";
const LATER_PRINTING = new RegExp(`\\b${ORDINAL}\\s+(?:print(?:ing)?|edition)\\b|\\breprint|\\bfacsimile\\b`, "i");

// gcd_issues.variant_name of an edition, e.g. "Second Printing".
export function isLaterPrinting(variantName) {
  return LATER_PRINTING.test(String(variantName ?? ""));
}

// item:          { gcd_issue_id, grade_numeric, slab_company, condition }
// issueRow:      gcd_issues row (variant_of_gcd_id, variant_name), may be null
// issue:         { seriesTitle, issueYear, seriesStartYear } for compValue
// guideRows:     Map gcd_issue_id -> pricecharting_prices rows, including the
//                regular cover's
// comps:         this edition's market_comps rows
// regularComps:  the regular cover's comps, or null when not loaded yet
//
// Returns { value, needsRegularComps }. needsRegularComps is true when the
// answer would come from the regular cover's comps and they weren't passed:
// load them and call again (marketValue.js reads them lazily, the snapshot
// script up front).
export function valueCopy({ item, issueRow = null, issue = {}, guideRows, comps = [], regularComps = null, minSamples }) {
  const guideValue = pcValueForIssue(guideRows, item);
  if (guideValue) return { value: guideValue, needsRegularComps: false };

  const later = isLaterPrinting(issueRow?.variant_name);
  const value = valueFromComps({ comps: later ? [] : comps, item, issue, minSamples });
  const variantOf = issueRow?.variant_of_gcd_id;
  if (later || value.source === "market-comp" || variantOf == null) {
    return { value, needsRegularComps: false };
  }

  const baseGuide = pcValueForRegularCover(guideRows, item, variantOf);
  if (baseGuide) return { value: baseGuide, needsRegularComps: false };
  if (regularComps == null) return { value, needsRegularComps: true };

  const regular = valueFromComps({ comps: regularComps, item, issue, minSamples });
  return {
    value: regular.source === "market-comp" ? { ...regular, regular_cover: true } : value,
    needsRegularComps: false,
  };
}
