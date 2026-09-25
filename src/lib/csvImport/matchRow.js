// Matching a CSV row to the real catalog, without inventing anything.
//
// The importer used to resolve a row like this:
//
//   publishers .eq("name", "Valiant Comics") .maybeSingle()   -> not found
//   series     .eq("title", "Rai") .maybeSingle()             -> PGRST116
//
// and then took the "not found" branch on BOTH, because only `data` was
// destructured and the error was dropped on the floor. The result was a
// freshly invented publisher, a sixth duplicate series called "Rai", and a
// local `comics` row inside it — for a book the catalog already had, with 16
// covers. Verified live 2026-09-24:
//
//   publishers has "Valiant", "Valiant Entertainment LLC" and
//   "Valiant and Dark Horse Comics Inc." — but not "Valiant Comics", which
//   is the name series.resolved_publisher_cached actually carries.
//
//   series .eq("title","Rai").maybeSingle() returns
//   PGRST116: JSON object requested, multiple (or no) rows returned,
//   because five different volumes are called Rai.
//
// So the two failure modes were "publisher spelled differently" and "this
// title has more than one volume" — which between them cover most of a real
// long box. The rules below are the correction:
//
//   - match the series on a normalized title, never an exact string
//   - use the publisher only as a tiebreak, never as a filter, because the
//     CSV's spelling and ours rarely agree
//   - when several volumes fit and the row gives no year, REFUSE and say
//     which years were available. A wrong volume is worse than a skipped
//     row: it puts the book in a run the collector does not own and every
//     cover, value and completion badge downstream is then wrong.

// Same reduction the search route applies to a query, so a CSV title and a
// catalog title meet on identical ground.
export function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Publishers are compared loosely and only ever as a tiebreak. "Valiant
// Comics", "Valiant" and "Valiant Entertainment LLC" all have to count as
// the same publisher, so this asks whether either name contains the other
// once both are reduced.
export function publisherMatches(a, b) {
  const x = normalizeKey(a);
  const y = normalizeKey(b);
  if (!x || !y) return false;
  return x === y || x.startsWith(y) || y.startsWith(x);
}

// A comic's issue number is text and inconsistent across sources: "1",
// "001", "1A", "#1". Compare on a reduced form, but keep an exact hit ahead
// of a reduced one so "1A" never quietly satisfies a row asking for "1".
export function issueKey(value) {
  const raw = String(value ?? "").trim().toLowerCase().replace(/^#/, "");
  const reduced = raw.replace(/[^a-z0-9]/g, "").replace(/^0+(?=\d)/, "");
  return { raw, reduced };
}

export function matchIssue(issues, issueNumber) {
  const want = issueKey(issueNumber);
  if (!want.reduced) return null;
  const exact = (issues ?? []).find(
    (i) => String(i.issue_number ?? "").trim().toLowerCase() === want.raw
  );
  if (exact) return exact;
  return (issues ?? []).find((i) => issueKey(i.issue_number).reduced === want.reduced) ?? null;
}

// A year, or null. Never 0.
//
// Number("") and Number(null) are both 0, and 0 passes Number.isFinite, so
// comparing them directly made "no year given" equal "series with no year
// recorded". Caught in dev 2026-09-25 on the contribute lookup: asking for
// Amazing Spider-Man #300 with no year matched the eleven ASM-ish series
// that have no year_start_cached, decided those were the only candidates,
// and reported that the catalog does not carry issue 300 — of Amazing
// Spider-Man. Same shape as the $0-sale bug in valuation.js.
function plausibleYear(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1800 || n > 2200) return null;
  return n;
}

// Decide which volume a row means.
//
// Returns one of:
//   { status: "matched",   series }
//   { status: "ambiguous", candidates }   caller reports, writes nothing
//   { status: "none" }                    caller may fall back to a local entry
export function chooseSeries(candidates, { releaseYear, publisher } = {}) {
  const pool = candidates ?? [];
  if (pool.length === 0) return { status: "none" };
  if (pool.length === 1) return { status: "matched", series: pool[0] };

  // A year is the strongest thing a CSV row can offer, and it is how a
  // collector distinguishes Rai (1992) from Rai (2014) on the shelf. Exact
  // first, then within a year either side for off-by-one cover dates.
  const year = plausibleYear(releaseYear);
  if (year != null) {
    const exact = pool.filter((s) => plausibleYear(s.year_start_cached) === year);
    if (exact.length === 1) return { status: "matched", series: exact[0] };
    if (exact.length > 1) return { status: "ambiguous", candidates: exact };

    const near = pool.filter((s) => {
      const ys = plausibleYear(s.year_start_cached);
      return ys != null && Math.abs(ys - year) <= 1;
    });
    if (near.length === 1) return { status: "matched", series: near[0] };
  }

  // No year, or the year did not separate them. Publisher is a weak signal
  // but it can still cut a Marvel run away from an identically titled
  // indie one.
  if (publisher) {
    const byPublisher = pool.filter((s) => publisherMatches(s.resolved_publisher_cached, publisher));
    if (byPublisher.length === 1) return { status: "matched", series: byPublisher[0] };
    if (byPublisher.length > 1) return { status: "ambiguous", candidates: byPublisher };
  }

  return { status: "ambiguous", candidates: pool };
}

// The message the importer puts in front of the user for an ambiguous row.
// It names the years, because adding a release_year column is the fix and
// the user cannot guess which years exist.
export function ambiguityMessage(title, candidates) {
  const pool = candidates ?? [];
  const years = pool.map((s) => Number(s.year_start_cached)).filter(Number.isFinite);
  const yearsAreDistinct = new Set(years).size === years.length && years.length === pool.length;

  // When the years differ, naming them is enough: the user adds a
  // release_year column and the next run resolves.
  if (yearsAreDistinct && years.length) {
    return (
      `"${title}" matches ${pool.length} volumes (${[...years].sort((a, b) => a - b).join(", ")}). ` +
      `Add a release_year column to say which one — nothing was imported for this row.`
    );
  }

  // When two volumes share a year, a release_year column cannot fix it and
  // saying "add a year" would be advice that does not work. Two runs called
  // "Rai" both start in 2014, with 16 issues and 4. Describe them by size
  // and send the user somewhere that can actually disambiguate.
  const described = pool
    .map((s) => {
      const y = Number.isFinite(Number(s.year_start_cached)) ? s.year_start_cached : "year unknown";
      const n = Number(s.issue_count_cached);
      return Number.isFinite(n) ? `${y} (${n} issues)` : `${y}`;
    })
    .join(" and ");
  return (
    `"${title}" matches ${pool.length} volumes a year cannot separate: ${described}. ` +
    `Add these from the site's search instead — nothing was imported for this row.`
  );
}
