// Parse an eBay listing title into structured fields for matching against
// gcd_issues + bucketing into market_comps.
//
// eBay sellers write titles like:
//   "AMAZING SPIDER-MAN #300 CGC 9.8 1ST VENOM HOT KEY MCFARLANE"
//   "Batman #1 1940 Golden Age Detective Comics RAW VF/NM"
//   "Walking Dead 1 CGC SS 9.6 Signed Robert Kirkman 2003 Image"
//   "X-Men 1 CBCS 7.5 OW/W Pages 1991 Marvel Jim Lee"
//
// We extract whatever's reliable (slab + grade are easy; series/issue are
// fuzzy). Series matching against `gcd_issues` is handled downstream — this
// parser produces *candidates* and confidence scores; it doesn't pretend to
// resolve them.
//
// Output shape (all fields nullable except `raw` and `grade_bucket`):
//   {
//     raw:                  original title string
//     normalized:           upper-cased, whitespace-collapsed
//     series_guess:         best-guess series name (heuristic)
//     issue_guess:          best-guess issue number ("300", "1", "5A", null)
//     slab_company:         "CGC" | "CBCS" | "PGX" | null
//     grade_numeric:        0.5–10.0 or null
//     signature_series:     true if "SS" / "Signature Series" detected
//     cert_number:          10-digit CGC / variable CBCS, if present
//     condition_label:      raw condition ("NM", "VF", etc) if not slabbed
//     year_guess:           4-digit year if found in title (often in parens)
//     is_key_indicator:     true if "1st", "origin", "death of", etc
//     grade_bucket:         output of gradeBucket() — the lookup key
//     confidence: {
//       slab_grade:  "high" | "low" | "none"
//       issue:       "high" | "low" | "none"
//       series:      "high" | "low" | "none"
//     }
//   }

// Relative import (not @/lib/valuation) so this file is usable from Node
// scripts as well as from Next.js routes — the eBay ingest will run from
// scripts/fetchEbayComps.js under raw Node, where the @/ alias doesn't resolve.
import { gradeBucket } from "./valuation.js";

// ── Patterns ──────────────────────────────────────────────────────────────

// "CGC 9.8", "CGC SS 9.6", "CBCS 7.5", "PGX 9.4". Allows the SS marker
// between company and number. Also handles "CGC 9.8 SS" (suffix form).
const SLAB_PATTERNS = [
  /\b(CGC|CBCS|PGX)\s+(?:(SS|SIGNATURE\s+SERIES)\s+)?(\d+(?:\.\d+)?)(?:\s+(SS|SIGNATURE\s+SERIES))?\b/i,
  // Inverted: "9.8 CGC". Less common but seen.
  /\b(\d+(?:\.\d+)?)\s+(CGC|CBCS|PGX)\b/i,
];

// Raw condition labels — looser. Word-bounded so "FINE PRINT" doesn't match.
// Order matters: longer forms first so "VF/NM" wins over "VF".
const RAW_CONDITION_PATTERN =
  /\b(NM\/M|VF\/NM|F\/VF|G\/VG|MINT|NEAR\s+MINT|VERY\s+FINE|FINE|VERY\s+GOOD|GOOD|FAIR|POOR|NM|VF|FN|VG|GD|FA|PR)\b/i;

// Issue number — try "#123" first since it's least ambiguous. Then fall back
// to "ISSUE 123" / "NO. 123" patterns. Bare-number extraction comes last.
const HASH_ISSUE_PATTERN = /#\s*(\d+(?:\.\d+)?[A-Za-z]?)/;
const ISSUE_LABEL_PATTERN = /\b(?:ISSUE|NO\.?)\s+(\d+(?:\.\d+)?[A-Za-z]?)\b/i;

// Parenthetical year. Sellers love writing "(1962)" or "(1984)".
const PAREN_YEAR_PATTERN = /\(\s*(19|20)(\d{2})\s*\)/;
// Bare year fallback — only used when no parenthetical exists.
const BARE_YEAR_PATTERN = /\b(19|20)(\d{2})\b/;

// Cert numbers. CGC is 10 digits, CBCS varies (8–10). PGX shorter.
const CERT_PATTERNS = [
  /\b(?:CGC|CBCS|PGX)[^0-9A-Za-z]*?(\d{8,12})\b/i,
];

// Key-issue keywords. We use these as a *flag* (boolean), not as the matching
// signal — the actual key-issue catalog lives elsewhere.
const KEY_PATTERNS = [
  /\b1ST\s+(?:APP|APPEARANCE|COVER|CAMEO)\b/i,
  /\bFIRST\s+(?:APP|APPEARANCE|COVER|CAMEO)\b/i,
  /\bORIGIN\b/i,
  /\bDEATH\s+OF\b/i,
  /\bDEBUT\b/i,
];

// Words that pollute series-name extraction. We strip them after slab/grade/
// year/etc are taken out, then the remainder is the series-name candidate.
//
// CAREFUL: never put character names ("Venom", "Spider", "Wolverine") or other
// nouns that show up in real titles here — they're part of legitimate series
// names. This list is only seller-jargon, condition markers, and ultra-generic
// words.
const NOISE_TOKENS = new Set([
  "COMIC", "COMICS", "BOOK", "BOOKS", "KEY", "HOT", "WP", "OW", "OW/W",
  "WHITE", "PAGES", "PAGE", "RAW", "SLABBED", "SS", "SIGNATURE", "SERIES",
  "WITH", "AND", "OF", "BY", "FOR", "VINTAGE", "RARE", "SUPER", "EXC",
  "NICE", "SHARP", "GLOSSY", "SIGNED", "AUTO", "AUTOGRAPHED",
  "GOLDEN", "AGE", "SILVER", "BRONZE", "MODERN", "ERA",
  "1ST", "FIRST", "APPEARANCE", "APP", "CAMEO", "DEBUT", "ORIGIN",
  // Note: "MARVEL", "DC", "IMAGE", etc. removed — sellers tag these but they
  // can also be part of legitimate names like "Marvel Team-Up". Better to
  // keep them and let the downstream fuzzy-matcher handle it.
]);

// ── Helpers ───────────────────────────────────────────────────────────────

function normalize(title) {
  return String(title ?? "").trim().replace(/\s+/g, " ");
}

function extractSlab(normalized) {
  for (const pat of SLAB_PATTERNS) {
    const m = normalized.match(pat);
    if (!m) continue;
    // Group order differs between SLAB_PATTERNS entries — figure it out by
    // which group looks like a company name vs a number.
    const company = m.slice(1).find((g) => /^(CGC|CBCS|PGX)$/i.test(g ?? ""));
    const grade = m.slice(1).find((g) => /^\d+(\.\d+)?$/.test(g ?? ""));
    const ss = m.slice(1).some((g) => /^(SS|SIGNATURE\s+SERIES)$/i.test(g ?? ""));
    if (company && grade) {
      return {
        slab_company: company.toUpperCase(),
        grade_numeric: Number(grade),
        signature_series: ss,
      };
    }
  }
  return { slab_company: null, grade_numeric: null, signature_series: false };
}

function extractRawCondition(normalized) {
  const m = normalized.match(RAW_CONDITION_PATTERN);
  if (!m) return null;
  return m[1].toUpperCase().replace(/\s+/g, " ");
}

function extractIssue(normalized) {
  let m = normalized.match(HASH_ISSUE_PATTERN);
  if (m) return { issue: m[1], confidence: "high" };
  m = normalized.match(ISSUE_LABEL_PATTERN);
  if (m) return { issue: m[1], confidence: "high" };

  // Bare-number fallback. This is dangerous — "1962" looks like an issue
  // number. We require: (a) not 4 digits that look like a year, (b) not
  // immediately preceded by "$" (price), (c) appears before any slab marker
  // so we don't pick the grade itself.
  const withoutSlab = normalized.replace(/(CGC|CBCS|PGX).*$/i, "");
  const bare = withoutSlab.match(/\b(\d{1,4})\b/g) ?? [];
  for (const candidate of bare) {
    const n = Number(candidate);
    if (n >= 1900 && n <= 2099) continue; // looks like a year
    if (candidate.length === 4 && n >= 1900) continue;
    return { issue: candidate, confidence: "low" };
  }
  return { issue: null, confidence: "none" };
}

function extractYear(normalized) {
  let m = normalized.match(PAREN_YEAR_PATTERN);
  if (m) return Number(`${m[1]}${m[2]}`);
  m = normalized.match(BARE_YEAR_PATTERN);
  if (m) return Number(`${m[1]}${m[2]}`);
  return null;
}

function extractCert(normalized) {
  for (const pat of CERT_PATTERNS) {
    const m = normalized.match(pat);
    if (m) return m[1];
  }
  return null;
}

function isKey(normalized) {
  return KEY_PATTERNS.some((pat) => pat.test(normalized));
}

// Build a best-guess series name by stripping everything we've already
// extracted, then dropping noise tokens. Heuristic — downstream matching
// should treat this as a candidate, not gospel.
function extractSeries(normalized, { slab_company, grade_numeric, issue_guess, year_guess, condition_label }) {
  let working = normalized;

  // Strip slab + grade phrase
  if (slab_company) {
    working = working.replace(
      new RegExp(`\\b${slab_company}\\s+(?:SS\\s+|SIGNATURE\\s+SERIES\\s+)?\\d+(?:\\.\\d+)?(?:\\s+SS)?\\b`, "gi"),
      ""
    );
    working = working.replace(new RegExp(`\\b\\d+(?:\\.\\d+)?\\s+${slab_company}\\b`, "gi"), "");
  }
  // Strip issue marker
  if (issue_guess) {
    working = working.replace(new RegExp(`#\\s*${issue_guess}\\b`, "g"), "");
    working = working.replace(new RegExp(`\\b(?:ISSUE|NO\\.?)\\s+${issue_guess}\\b`, "gi"), "");
    // Also strip bare issue number when it's at a word boundary AND there's
    // a series name remaining. Avoid stripping if it's the only number.
    working = working.replace(new RegExp(`\\b${issue_guess}\\b`), "");
  }
  // Strip year(s)
  if (year_guess) {
    working = working.replace(new RegExp(`\\(?\\s*${year_guess}\\s*\\)?`, "g"), "");
  }
  // Strip raw condition
  if (condition_label) {
    working = working.replace(new RegExp(`\\b${condition_label.replace(/[/]/g, "\\/")}\\b`, "gi"), "");
  }

  // Tokenize, drop noise, drop short non-word tokens.
  const tokens = working
    .split(/[\s\-:|,]+/)
    .map((t) => t.replace(/[^A-Za-z0-9'!?]/g, ""))
    .filter((t) => t.length > 0)
    .filter((t) => !NOISE_TOKENS.has(t.toUpperCase()));

  if (tokens.length === 0) return { series: null, confidence: "none" };

  const series = tokens.join(" ").trim();
  // Confidence: high if we found 2+ word tokens that aren't all-caps single
  // letters; low otherwise (probably a noise residue).
  const wordy = tokens.filter((t) => /[A-Za-z]/.test(t)).length;
  return {
    series: series || null,
    confidence: wordy >= 2 ? "high" : wordy === 1 ? "low" : "none",
  };
}

// ── Main entry point ──────────────────────────────────────────────────────

export function parseEbayTitle(rawTitle) {
  const normalized = normalize(rawTitle).toUpperCase();
  const slab = extractSlab(normalized);
  const condition_label = !slab.slab_company ? extractRawCondition(normalized) : null;
  const issue = extractIssue(normalized);
  const year_guess = extractYear(normalized);
  const cert_number = slab.slab_company ? extractCert(normalized) : null;
  const is_key_indicator = isKey(normalized);
  const seriesInfo = extractSeries(normalized, {
    slab_company: slab.slab_company,
    grade_numeric: slab.grade_numeric,
    issue_guess: issue.issue,
    year_guess,
    condition_label,
  });

  // Build the grade bucket using the same helper the UI uses, so eBay-side
  // ingest and library-side lookup agree on the key string.
  const bucket = gradeBucket({
    grade_numeric: slab.grade_numeric,
    slab_company: slab.slab_company,
    condition: condition_label,
  });

  return {
    raw: rawTitle ?? "",
    normalized,
    series_guess: seriesInfo.series,
    issue_guess: issue.issue,
    slab_company: slab.slab_company,
    grade_numeric: slab.grade_numeric,
    signature_series: slab.signature_series,
    cert_number,
    condition_label,
    year_guess,
    is_key_indicator,
    grade_bucket: bucket,
    confidence: {
      slab_grade: slab.slab_company && slab.grade_numeric != null
        ? "high"
        : condition_label
          ? "low"
          : "none",
      issue: issue.confidence,
      series: seriesInfo.confidence,
    },
  };
}
