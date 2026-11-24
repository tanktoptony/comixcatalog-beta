// Which stored covers with no series and no issue (the ingest saved them but
// could not file them) belong to a given series. Searching ComicVine again
// can't fix these: the ingest sees the cover already exists and skips it.
// Found 2026-11-24: 13 of 15 "done" series with blank member books already
// had every cover stored.
//
// A wrong cover is worse than none, so one volume is filed only when all of
// this holds: exact title (punctuation and a leading "The" aside), exact
// publisher, exact start year, only one such volume, every cover number is
// distinct and maps to exactly one base issue, and no other US series of the
// same name and publisher within a year has all of those numbers. (A trade
// paperback shares the name but can't hold a 5-issue run, so it doesn't block.)
// A volume with any cover already filed is the repair job's business, and an
// issue that already has a cover never gets a second one.

export function normTitle(value) {
  return String(value ?? "").toLowerCase().replace(/&/g, "and").replace(/^the /, "").replace(/[^a-z0-9]/g, "");
}

export function normPublisher(value) {
  return normTitle(value).replace(/(comics|comic|publishing|publications|entertainment|productions|studios|press|books|inc|llc)/g, "");
}

export function normNumber(value) {
  return String(value ?? "").toLowerCase().replace(/\s*\[.*?\]\s*/g, "").replace(/^#/, "").replace(/\s*\(\d+\)$/, "").trim().replace(/^0+(?=\d)/, "");
}

// series:   { gcd_id, name, year, publisher }
// issues:   this series' gcd_issues { gcd_id, issue_number, variant_of_gcd_id }
// volumes:  [{ vol, rows: [{ id, series_title, series_year, publisher, issue_number }] }], all unfiled
// covered:  Set of this series' gcd_issue ids that already have a cover
// siblings: other series [{ gcd_id, name, year, publisher, us_market, numbers: Set }]
// Returns { links: [{ id, series_gcd_id, gcd_issue_id }] } or { skip: reason }.
export function planSeries({ series, issues, volumes, covered = new Set(), siblings = [] }) {
  const title = normTitle(series.name);
  const publisher = normPublisher(series.publisher);
  if (!title || !publisher || !series.year) return { skip: "series is missing a title, publisher or year" };

  const titled = volumes.filter((v) => v.rows.length && v.rows.every((r) => normTitle(r.series_title) === title));
  if (!titled.length) return { skip: "no unfiled volume with this title" };
  const fits = titled.filter((v) => {
    const years = v.rows.map((r) => Number(r.series_year)).filter(Boolean);
    const publishers = new Set(v.rows.map((r) => normPublisher(r.publisher)));
    return years.length > 0 && Math.min(...years) === Number(series.year) && publishers.size === 1 && publishers.has(publisher);
  });
  if (!fits.length) return { skip: "year or publisher not exact" };
  if (fits.length > 1) return { skip: "several volumes fit" };
  if (fits[0].partlyFiled) return { skip: "volume is partly filed already" };

  const byNumber = new Map();
  for (const issue of issues) {
    if (issue.variant_of_gcd_id != null) continue;
    const key = normNumber(issue.issue_number);
    byNumber.set(key, byNumber.has(key) ? null : issue.gcd_id);
  }
  const rows = fits[0].rows;
  const numbers = rows.map((r) => normNumber(r.issue_number));
  if (numbers.some((n) => !n) || new Set(numbers).size !== numbers.length) return { skip: "missing or repeated cover numbers" };
  if (numbers.some((n) => byNumber.get(n) == null)) return { skip: "a cover number has no single issue" };
  if (numbers.some((n) => covered.has(Number(byNumber.get(n))))) return { skip: "an issue already has a cover" };

  const rival = siblings.some(
    (s) =>
      Number(s.gcd_id) !== Number(series.gcd_id) &&
      normTitle(s.name) === title &&
      Math.abs(Number(s.year) - Number(series.year)) <= 1 &&
      s.us_market &&
      (!s.publisher || normPublisher(s.publisher) === publisher) &&
      numbers.every((n) => s.numbers?.has(n))
  );
  if (rival) return { skip: "another series of this name has the same numbers" };

  return {
    links: rows.map((r, i) => ({ id: r.id, series_gcd_id: Number(series.gcd_id), gcd_issue_id: Number(byNumber.get(numbers[i])) })),
  };
}
