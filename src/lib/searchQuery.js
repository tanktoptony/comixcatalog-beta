// Pulling a volume year out of a search query.
//
// Collectors say "rai 1994" and "x-men 1991" because the year is how you
// name a volume out loud. Until now that query returned NOTHING:
//
//   "hulk 181"                12 results   trailing issue number, stripped
//   "amazing spider-man 300"  12 results   same
//   "rai 1994"                ZERO
//   "x-men 1991"              ZERO
//
// stripTrailingIssueNumber deliberately refuses to strip 1900-2099, which is
// right — 1994 is not issue 1994. But the year then stayed in the title text
// and normalized to "rai1994", which matches no title on earth. The query was
// correctly identified as containing a year and then punished for it.
//
// A year is a filter, not title text. This splits the two so the title
// searches on "rai" and the year picks the volume.

const MIN_YEAR = 1900;
const MAX_YEAR = 2099;

function plausibleYear(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  return n >= MIN_YEAR && n <= MAX_YEAR ? n : null;
}

/**
 * Splits a raw query into the title to search and an optional year.
 *
 * Returns { title, year, issue } where year and issue are null when absent.
 * `title` is never empty when the input had any non-numeric content, because
 * a query that reduces to nothing finds nothing.
 */
export function parseSearchQuery(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { title: "", year: null, issue: null };

  let title = trimmed;
  let year = null;
  let issue = null;

  // A year in parentheses is unambiguous and can sit anywhere: collectors
  // paste "Rai (1994)" straight off a listing.
  const paren = title.match(/\((\d{4})\)/);
  if (paren && plausibleYear(paren[1]) != null) {
    year = plausibleYear(paren[1]);
    title = (title.slice(0, paren.index) + title.slice(paren.index + paren[0].length)).trim();
  }

  // Otherwise a trailing number. Four digits in range is a year; anything
  // else trailing is an issue number, which is the pre-existing behaviour.
  if (year == null) {
    const trailing = title.match(/[\s#]+(\d+(?:\.\d+)?)$/);
    if (trailing) {
      const raw = trailing[1];
      const asYear = /^\d{4}$/.test(raw) ? plausibleYear(raw) : null;
      if (asYear != null) {
        year = asYear;
        title = title.slice(0, trailing.index).trim();
      } else {
        issue = raw;
        title = title.slice(0, trailing.index).trim();
      }
    }
  }

  // "1994" alone, or "(1994)" alone, leaves no title. A bare year is not a
  // search anyone can answer, so hand back the original and let the caller
  // treat it as a title — finding nothing is the honest result, but it must
  // not crash or silently search the whole catalog.
  if (!title) {
    return { title: trimmed, year: null, issue: null };
  }

  return { title, year, issue };
}

// Does a series row satisfy the year the searcher asked for?
//
// Deliberately a window, not equality. GCD's year_start_cached and the year
// printed on a cover disagree by one more often than you would like, and a
// collector who types 1994 for a book cover-dated 1993 should still find it.
export function yearMatches(row, year, slack = 1) {
  if (year == null) return true;
  const start = Number(row?.year_start_cached);
  if (!Number.isFinite(start)) return false;
  if (Math.abs(start - year) <= slack) return true;
  // A long run started earlier and was still going: "Batman 1975" should
  // find the 1940 run that ran through 1975.
  const end = Number(row?.year_end_cached);
  if (Number.isFinite(end)) return year >= start - slack && year <= end + slack;
  return false;
}

// Exact start-year hits rank above merely-in-range ones.
export function yearScore(row, year) {
  if (year == null) return 0;
  const start = Number(row?.year_start_cached);
  if (!Number.isFinite(start)) return 0;
  if (start === year) return 2;
  return yearMatches(row, year) ? 1 : 0;
}
