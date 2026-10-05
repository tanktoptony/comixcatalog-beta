// Decides whether an eBay listing title describes the issue a comp row is
// filed under. Pure, no imports, so the eBay fetch script, the snapshot
// script and the Next routes all share it.
//
// Why this exists: the eBay query is "<series title> <issue number>", and the
// only check on the results used to be "the parsed issue number matches".
// For The X-Men #2 (1963) that let in Amazing X-Men #2 (1995), the Official
// Marvel Index to the X-Men #2 and Uncanny X-Men #2 (2024). For Fantastic
// Four #12 (1963) it let in FF #12 (1977) and a 2026 Facsimile Edition. A
// raw book is valued at the 25th percentile of its raw comps, and those pools
// were mostly $3-5 modern books, so a $600 Silver Age key showed as $4.
// Found on /u/legendofpayne, 2026-10-04.
//
// The rules, in order:
//   1. A listing for a range of issues ("#1-24 | Select Covers") is out.
//   2. Any year in the title (1963, (1965), 8/75) must be within a year of the
//      issue's own year, or equal the series start year ("1970 Series").
//   3. Reprints, facsimiles, lots, collected editions, later printings,
//      signed or remarked copies, foreign editions and ratio/virgin/exclusive
//      variants are out. They are real books, but not a plain copy of this one.
//   4. Annual / King-Size / Giant-Size / Special / Tales / Team-Up and similar
//      are out unless the series title itself contains the word.
//   5. Before 1990, modern cover cues (CVR A, VARIANT, LGY, FOIL) are out.
//   6. The series title has to appear in the listing. If the word right
//      before it is a qualifier ("AMAZING X-Men", "SPECTACULAR Spider-Man"),
//      the listing is out unless it also carries an in-range year.

const YEAR_RE = /\b(19[3-9]\d|20[0-3]\d)\b/g;
// Cover-date shorthand: "8/75", "3/63". Not a grade out of ten ("9.8/10") and
// not the tail of a full date ("9/18/24").
const SHORT_DATE_RE = /(?<![\d/.])(\d{1,2})\/(\d{2})(?![\d/]|\.\d)/g;
const RANGE_RE = /#\s*\d+\s*-\s*\d+/;

const NOT_A_PLAIN_COPY = [
  /\bFACSIMILE\b/, /\bREPRINTS?\b/, /\bMILESTONE\b/, /\bTRUE BELIEVERS\b/, /\bMASTERWORKS\b/,
  /\bOMNIBUS\b/, /\bTPB\b/, /\bTRADE PAPERBACK\b/, /\bPAPERBACK\b/, /\bHARDCOVER\b/, /\bGRAPHIC NOVEL\b/, /\bMANGA\b/,
  /\bLOT\b/, /\bSET\b/, /\bCOMBO\b/, /\b\d+ ?PC\b/, /\b\d+ (COMICS|BOOKS|ISSUES)\b/,
  /\bINDEX\b/, /\bHOMAGE\b/, /\bCOVER ONLY\b/, /\bPA?GE?S? \d+ ONLY\b/, /\bPAGE ONLY\b/, /\bCOVERLESS\b/,
  /\bSTAN LEE EDITION\b/, /\bPOSTER\b/, /\bFOREIGN\b/, /\bUK\b/, /\bPENCE\b/,
  /\b(2 ?ND|3 ?RD|[4-9] ?TH|1\d ?TH|SECOND|THIRD|FOURTH) (PRINT|PRINTING|PTG|PT)\b/,
  /\bSIGNED\b/, /\bAUTOGRAPHED\b/, /\bSIGNATURE SERIES\b/, /\bCGC SS\b/, /\bSS \d/, /\bCOA\b/, /\bWITNESSED\b/, /\bREMARK/,
  /\b(PANINI|ITALIAN|SPANISH|GERMAN|FRENCH|MEXICAN|PORTUGUESE|BRAZIL)\b/,
  /\bVIRGIN\b/, /\bRATIO\b/, /\bINCENTIVE\b/, /\bEXCLUSIVE\b/, /\bFAN EXPO\b/,
  /\b(CVR|COVER) [B-Z]\b/, /\bSKETCH\b/,
];
const OTHER_FORMATS = ["ANNUAL", "KING SIZE", "GIANT SIZE", "SPECIAL", "TALES", "TEAM UP", "UNLIMITED", "CLASSICS"];
const MODERN_CUES = [/\bVARIANT\b/, /\bCVR\b/, /\bCOVER [A-Z]\b/, /\bLGY\b/, /\bLEGACY\b/, /\bFOIL\b/];
// Words that can sit right before the series name without naming a different series.
const NEUTRAL_PREFIX = new Set([
  "", "THE", "MARVEL", "MARVELS", "COMICS", "COMIC", "DC", "VINTAGE", "VTG", "RARE", "KEY", "HOT",
  "SILVER", "GOLDEN", "BRONZE", "AGE", "ORIGINAL", "ORIG", "CLASSIC", "GROUP",
  "NM", "VF", "FN", "VG", "GD", "PR", "CGC", "CBCS", "PGX",
]);

function normalize(s) {
  return String(s ?? "")
    .toUpperCase()
    .replace(/[’']/g, "")
    .replace(/-/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function seriesCore(seriesTitle) {
  return normalize(seriesTitle).replace(/^THE /, "");
}

export function titleYears(title) {
  const text = String(title ?? "");
  const years = [...text.matchAll(YEAR_RE)].map((m) => Number(m[1]));
  for (const m of text.matchAll(SHORT_DATE_RE)) {
    const month = Number(m[1]);
    const yy = Number(m[2]);
    if (month >= 1 && month <= 12) years.push(yy <= 35 ? 2000 + yy : 1900 + yy);
  }
  return years;
}

// Returns { ok, reason, yearConfirmed }. yearConfirmed means the title named
// an in-range year, which is the strongest evidence it is this exact book.
export function compMatchesIssue({ title, seriesTitle, issueYear, seriesStartYear }) {
  const raw = String(title ?? "");
  if (RANGE_RE.test(raw)) return { ok: false, reason: "range" };

  const years = titleYears(raw);
  const year = Number(issueYear) || null;
  if (year && years.some((y) => Math.abs(y - year) > 1 && y !== Number(seriesStartYear))) {
    return { ok: false, reason: "year" };
  }
  const yearConfirmed = year != null && years.length > 0;

  const text = normalize(raw);
  // Ratio variants ("1:25") are checked on the raw title; normalizing drops the colon.
  if (/\b1:\d+/.test(raw) || NOT_A_PLAIN_COPY.some((re) => re.test(text))) {
    return { ok: false, reason: "not a plain copy" };
  }

  const core = seriesCore(seriesTitle);
  for (const word of OTHER_FORMATS) {
    if (new RegExp(`\\b${word}\\b`).test(text) && !core.includes(word)) {
      return { ok: false, reason: "other format" };
    }
  }
  if (year && year < 1990 && MODERN_CUES.some((re) => re.test(text))) {
    return { ok: false, reason: "modern cue" };
  }

  if (!core) return { ok: true, yearConfirmed };
  const padded = ` ${text} `;
  const prefixBefore = (at) =>
    padded.slice(0, at).trim().split(" ").filter((w) => w && !/^\d/.test(w)).pop() ?? "";
  const at = padded.indexOf(` ${core} `);
  if (at >= 0) {
    if (!NEUTRAL_PREFIX.has(prefixBefore(at)) && !yearConfirmed) return { ok: false, reason: "different series" };
    return { ok: true, yearConfirmed };
  }

  // Sellers shorten long GCD titles: "Marvel Super-Heroes Secret Wars #8" is
  // listed as "Secret Wars #8 1984". For titles of three or more words, the
  // last two are enough, but only with an in-range year and nothing but a
  // neutral word in front, so "Spectacular Spider-Man" never stands in for
  // The Amazing Spider-Man.
  const words = core.split(" ");
  if (words.length >= 3 && yearConfirmed) {
    const tail = words.slice(-2).join(" ");
    const tailAt = padded.indexOf(` ${tail} `);
    if (tailAt >= 0 && NEUTRAL_PREFIX.has(prefixBefore(tailAt))) return { ok: true, yearConfirmed };
  }
  return { ok: false, reason: "series" };
}

// Filters an issue's comp rows down to the ones that describe it. Rows need
// `listing_title` and `sold_price`. Without a series title there is nothing
// to match against (a local comic, or missing metadata), so rows pass as-is.
//
// Before 1990 there is one more pass: if any surviving title names an
// in-range year, the median of those year-confirmed prices is an anchor, and
// anything under a tenth of it is dropped. A 1964 book with one "(1964)
// GD 2.0 $284" listing does not also have a real copy at $4.50; that $4.50
// is the 2014 book with the year left off.
export function filterCompsForIssue(rows, { seriesTitle, issueYear, seriesStartYear } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!seriesTitle) return list;

  const kept = [];
  const confirmedPrices = [];
  for (const row of list) {
    const verdict = compMatchesIssue({ title: row.listing_title, seriesTitle, issueYear, seriesStartYear });
    if (!verdict.ok) continue;
    kept.push(row);
    if (verdict.yearConfirmed) confirmedPrices.push(Number(row.sold_price));
  }

  const year = Number(issueYear) || null;
  const anchorMin = year && year < 1980 ? 1 : 3;
  if (!year || year >= 1990 || confirmedPrices.length < anchorMin) return kept;
  const sorted = confirmedPrices.filter(Number.isFinite).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const anchor = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return kept.filter((row) => Number(row.sold_price) >= anchor / 10);
}
