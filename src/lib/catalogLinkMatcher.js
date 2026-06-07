// catalogLinkMatcher.js — shared matcher logic for catalog-link.
//
// Two earlier rounds of data loss came from this code existing in THREE
// places at once: the endpoint, the audit script, and the apply script.
// Improving the matcher in one without the others created mismatches between
// what the audit promised and what the apply actually did. This module is
// now the single source of truth. The endpoint imports it directly; the
// node CLI scripts also import it.
//
// Public API:
//   normTitle(v)                  — lowercase, strip non-alnum
//   normIssue(v)                  — trim, lowercase
//   parseYear(v)                  — pull a 4-digit year from anything string-ish
//   bestYearFor(row)              — prefer publication_date, fall back to key_date
//   titleVariants(rawTitle)       — set of normalized title forms to match against
//                                   series.title_normalized
//   pickFromMatches(matches, comic) — tiered year disambiguation +
//                                     variant-collapse, returns {picked, status}
//
// CHANGES TO THIS FILE MUST BE TESTED AGAINST scripts/auditCatalogLink.js
// (run it after editing) BEFORE shipping. The endpoint and the apply script
// both consume this, so a bad change goes everywhere at once.

const ARABIC_TO_ROMAN = {
  1: "I", 2: "II", 3: "III", 4: "IV", 5: "V",
  6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X",
};
const ROMAN_TO_ARABIC = Object.fromEntries(
  Object.entries(ARABIC_TO_ROMAN).map(([a, r]) => [r, Number(a)])
);

export function normTitle(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normIssue(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function parseYear(value) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isNaN(n) && n > 1800 && n < 2200) return n;
  const m = String(value).match(/\b(18|19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

export function bestYearFor(row) {
  return parseYear(row?.publication_date) ?? parseYear(row?.key_date);
}

// User-side titles often carry annotations that GCD doesn't index in the
// series name. We generate a set of candidate normalized forms per title
// and let the lookup match against any of them.
//
// Each rule is documented inline. Order matters: most-conservative variant
// first so a clean title doesn't artificially expand the match space.
export function titleVariants(rawTitle) {
  const seen = new Set();
  const out = [];
  function push(s) {
    const n = normTitle(s);
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  }
  const raw = String(rawTitle ?? "").trim();
  if (!raw) return out;

  // 1. As-is.
  push(raw);

  // 2. Normalize ellipsis chars — GCD inconsistently uses "…" vs "..." vs none.
  const noEllipsis = raw.replace(/…/g, "").replace(/\.{2,}/g, "");
  push(noEllipsis);

  // 3. Strip trailing annotations users add but GCD doesn't carry.
  //    Iterates because chains like "X-Men Vol. 2 (Newsstand)" need two passes.
  function stripAnnotations(s) {
    let cur = s;
    let prev = null;
    while (cur !== prev) {
      prev = cur;
      cur = cur
        .replace(/\s*\(Variant[^)]*\)\s*$/i, "")
        .replace(/\s*\(Newsstand\)\s*$/i, "")
        .replace(/\s*\(Direct(?:\s+Edition)?\)\s*$/i, "")
        .replace(/\s*\(New\s*52\)\s*$/i, "")
        .replace(/\s+The\s+New\s*52\s*$/i, "")
        .replace(/\s*\(Vol\.?\s*\d+\)\s*$/i, "")
        .replace(/\s+Vol\.?\s*\d+\s*$/i, "")
        .replace(/\s*\(\d{4}\)\s*$/, "")
        .replace(/\s+\d{4}\s*$/, "")
        .replace(/\s*#\s*[\w.]+\s*$/, "")
        .trim();
    }
    return cur;
  }
  const stripped = stripAnnotations(raw);
  push(stripped);
  push(stripAnnotations(noEllipsis));

  // 3b. Mid-title volume stripping. Handles "Good Apollo... Vol. 2: No World"
  //     vs catalog's "Good Apollo... Volume II - No World".
  function stripMidVolume(s) {
    return s
      .replace(/[\s,:\-]*\bVol(?:ume)?\.?\s*(\d+|[IVX]+)\b[\s,:\-]*/gi, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  push(stripMidVolume(raw));
  push(stripMidVolume(stripped));
  push(stripMidVolume(noEllipsis));
  push(stripMidVolume(stripAnnotations(noEllipsis)));

  function replaceTrailingVol(s, numeralFormatter) {
    return s.replace(/\s+Vol(?:ume)?\.?\s*(\d+|[IVX]+)\s*$/i, (_m, n) => {
      const asArabic = /^\d+$/.test(n) ? Number(n) : ROMAN_TO_ARABIC[n.toUpperCase()];
      if (!asArabic) return " " + n;
      return " " + numeralFormatter(asArabic);
    });
  }

  function toggleLeadingThe(s) {
    if (s.toLowerCase().startsWith("the ")) return s.slice(4);
    return `The ${s}`;
  }

  // 3c. Trailing "Vol. N" → numeral, both arabic and roman. Critical for
  //     "Amory Wars Vol. 2" → "Amory Wars II". Pair with leading-The toggle
  //     so "The Amory Wars II" → "Amory Wars II" → matches gcd-52493.
  const trailingVolForms = [
    replaceTrailingVol(raw, (n) => String(n)),
    replaceTrailingVol(raw, (n) => ARABIC_TO_ROMAN[n] ?? String(n)),
    replaceTrailingVol(noEllipsis, (n) => String(n)),
    replaceTrailingVol(noEllipsis, (n) => ARABIC_TO_ROMAN[n] ?? String(n)),
  ];
  for (const form of trailingVolForms) {
    push(form);
    push(toggleLeadingThe(form));
  }

  // 3d. Roman ↔ Arabic numeral cross-variants on full title and stripped.
  function arabicToRoman(s) {
    return s.replace(/\b(\d{1,2})\b/g, (m, n) => ARABIC_TO_ROMAN[Number(n)] ?? m);
  }
  function romanToArabic(s) {
    return s.replace(/\b([IVX]{1,4})\b/g, (m) => ROMAN_TO_ARABIC[m] ?? m);
  }
  push(arabicToRoman(stripped));
  push(romanToArabic(stripped));
  push(arabicToRoman(stripMidVolume(stripped)));
  push(romanToArabic(stripMidVolume(stripped)));

  // 4. Leading-"The" toggle on the canonical stripped form. GCD inconsistently
  //    carries "The"; we try with and without.
  push(toggleLeadingThe(stripped));

  // 5. & ↔ and swaps. Goes in both directions so we hit either casing.
  function ampToAnd(s) { return s.replace(/&/g, " and "); }
  function andToAmp(s) { return s.replace(/\band\b/gi, "&"); }
  push(ampToAnd(stripped));
  push(andToAmp(stripped));
  push(ampToAnd(toggleLeadingThe(stripped)));
  push(andToAmp(toggleLeadingThe(stripped)));

  return out;
}

// Given the list of issue-level matches for a row, run the tiered
// disambiguation: exact year → ±1 year → variant-cover collapse. Returns:
//   { status: "confident", picked, year_disambiguated, base_picked }
//   { status: "ambiguous", candidates }
//
// `comic` is the user's local row ({ release_year, ... }).
export function pickFromMatches(matches, comic) {
  if (!matches?.length) return { status: "no_match" };
  if (matches.length === 1) {
    return { status: "confident", picked: matches[0] };
  }

  const targetYear = parseYear(comic?.release_year);
  let pool = matches;
  let yearDisambiguated = false;
  if (targetYear != null) {
    const yearOf = (m) => m.issue_year ?? m.series_year_start;
    const exact = matches.filter((m) => yearOf(m) === targetYear);
    if (exact.length > 0) {
      pool = exact;
      yearDisambiguated = true;
    } else {
      const close = matches.filter((m) => {
        const y = yearOf(m);
        return y != null && Math.abs(y - targetYear) <= 1;
      });
      if (close.length > 0) {
        pool = close;
        yearDisambiguated = true;
      }
    }
  }

  if (pool.length === 1) {
    return { status: "confident", picked: pool[0], year_disambiguated: yearDisambiguated };
  }

  // Variant-cover collapse: if all remaining candidates share a single
  // series_gcd_id, they're variant covers of the same base issue. GCD's
  // convention puts cover-A first, so the lowest gcd_issue_id wins.
  const distinctSeries = new Set(pool.map((m) => m.series_gcd_id));
  if (distinctSeries.size === 1) {
    const picked = pool.reduce(
      (best, m) => (best == null || m.gcd_issue_id < best.gcd_issue_id ? m : best),
      null
    );
    return {
      status: "confident",
      picked,
      year_disambiguated: yearDisambiguated,
      base_picked: true,
    };
  }

  return { status: "ambiguous", candidates: matches };
}
