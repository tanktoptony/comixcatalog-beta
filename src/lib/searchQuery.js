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

const NUMBER_WORDS = new Map([
  ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5],
  ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9], ["ten", 10],
]);

// "amazing spider-man vol 2" means the 1999 run (reported 2026-10-28). A bare
// "v" needs digits right after it, so "v for vendetta" stays a title.
const VOLUME_PATTERN = /(?:^|\s)(?:(?:vol(?:ume)?\.?)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)|v(?:\.\s*|\.?)?(\d+))(?=\s|#|$)/i;

// Format words only count at the end of the title ("saga tpb"), never at
// the start, so "Absolute Batman" (the 2024 series) stays a title.
const FORMAT_WORDS = [
  ["trade paperbacks?|paperbacks?|tpb|tp", "tpb"],
  ["hardcovers?|hardbacks?|hc", "hc"],
  ["omnibuses|omnibus|omni", "omnibus"],
  ["deluxe", "deluxe"],
  ["absolute", "absolute"],
  ["compendium", "compendium"],
  ["graphic novels?|gn", "gn"],
  ["trades?|collected|collections?", "trades"],
];
const FORMAT_SUFFIXES = FORMAT_WORDS.map(([words, key]) => [new RegExp(`(?:\\s+)(${words})$`, "i"), key]);
// The same words still followed by the issue number or year that
// parseSearchQuery removes before it looks for them ("saga tpb 2012").
const FORMAT_BEFORE_TAIL = FORMAT_WORDS.map(([words]) =>
  new RegExp(`\\s+(?:${words})(?=(?:\\s*(?:\\(\\d{4}\\)|#?\\d+(?:\\.\\d+)?))*\\s*$)`, "i"));

/**
 * Splits a raw query into the title to search and an optional year.
 *
 * Returns { title, year, issue, volume, format } with nulls when absent.
 * `title` is never empty when the input had any non-numeric content, because
 * a query that reduces to nothing finds nothing.
 */
export function parseSearchQuery(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { title: "", year: null, issue: null, volume: null, format: null };

  let title = trimmed;
  let year = null;
  let issue = null;
  let volume = null;
  let format = null;

  const stripFormatSuffix = () => {
    for (const [pattern, key] of FORMAT_SUFFIXES) {
      const match = title.match(pattern);
      if (!match) continue;
      const withoutFormat = title.slice(0, match.index).trim();
      if (!withoutFormat) return;
      title = withoutFormat;
      format = key;
      return;
    }
  };

  stripFormatSuffix();

  // A year in parentheses is unambiguous and can sit anywhere: collectors
  // paste "Rai (1994)" straight off a listing.
  const paren = title.match(/\((\d{4})\)/);
  if (paren && plausibleYear(paren[1]) != null) {
    year = plausibleYear(paren[1]);
    title = (title.slice(0, paren.index) + title.slice(paren.index + paren[0].length)).trim();
  }

  // Volume is removed before the trailing issue, so "vol 2 36" keeps 36 as
  // the issue rather than mistaking the volume number for it.
  const volumeMatch = title.match(VOLUME_PATTERN);
  if (volumeMatch) {
    const rawVolume = volumeMatch[1] ?? volumeMatch[2];
    volume = NUMBER_WORDS.get(rawVolume.toLowerCase()) ?? Number(rawVolume);
    title = `${title.slice(0, volumeMatch.index)} ${title.slice(volumeMatch.index + volumeMatch[0].length)}`.trim();
  }

  // Otherwise a trailing number. Four digits in range is a year; anything
  // else trailing is an issue number, which is the pre-existing behaviour.
  const stripTrailingNumber = () => {
    const trailing = title.match(/[\s#]+(\d+(?:\.\d+)?)$/);
    if (!trailing) return;
    const raw = trailing[1];
    const asYear = year == null && /^\d{4}$/.test(raw) ? plausibleYear(raw) : null;
    if (asYear != null) {
      year = asYear;
    } else if (issue == null) {
      issue = raw;
    } else {
      return;
    }
    title = title.slice(0, trailing.index).trim();
  };
  stripTrailingNumber();

  // "1994" alone, or "(1994)" alone, leaves no title. A bare year is not a
  // search anyone can answer, so hand back the original and let the caller
  // treat it as a title — finding nothing is the honest result, but it must
  // not crash or silently search the whole catalog.
  if (!title) {
    return { title: trimmed, year: null, issue: null, volume: null, format: null };
  }

  stripFormatSuffix();
  stripTrailingNumber();

  return { title, year, issue, volume, format };
}

// The issue search keeps its own title, issue and year handling: it reads
// "spider-man 2099" as a title, where parseSearchQuery reads 2099 as a year.
// So it gets only the volume and format words taken out, with every other
// word (trailing number included) left as typed.
export function stripSearchQualifiers(raw) {
  let query = String(raw ?? "").trim();
  const { volume, format } = parseSearchQuery(query);
  const cut = (match) => {
    query = `${query.slice(0, match.index)} ${query.slice(match.index + match[0].length)}`.replace(/\s+/g, " ").trim();
  };
  if (volume != null) {
    const match = query.match(VOLUME_PATTERN);
    if (match) cut(match);
  }
  if (format != null) {
    for (const pattern of FORMAT_BEFORE_TAIL) {
      const match = query.match(pattern);
      if (match && query.slice(0, match.index).trim()) {
        cut(match);
        break;
      }
    }
  }
  return { query, volume, format };
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
