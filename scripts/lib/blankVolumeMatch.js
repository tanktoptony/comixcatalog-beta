// Which ComicVine volume is this series, for a series where a member's book
// shows no cover. Used by scripts/matchBlankBooks.js.
//
// Three answers:
//   sure  title, publisher, start year and issue count all agree, and nothing
//         else fits. Ingested without asking.
//   ask   something close. Tony says yes or no with both listings in front of
//         him (scripts/matchBlankBooks.js --asks).
//   none  nothing close.
//
// A wrong cover is worse than none (a wrong pin hid 85 Marvel covers under a
// one-book reprint on 2026-11-24), so anything short of full agreement is ask.

import { looksCollectedTitle } from "./collectedTitle.js";
import { publisherCompatible } from "./publisherCompat.js";

// "Tigerman" and "Tiger-Man", "Dr. Strange" and "Doctor Strange", "Pokémon"
// and "Pokemon", "X-Men & Alpha Flight" and "X-Men and Alpha Flight".
export function titleKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/½/g, " 1/2 ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/&/g, " ")
    .replace(/\bdr\b\.?/g, "doctor")
    .replace(/\bmr\b\.?/g, "mister")
    .replace(/\bvs\b\.?/g, "versus")
    .replace(/\b(the|and)\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
}

// Same publisher under another name. Exact names only, each one checked:
// a loose match here would let a foreign licensee through.
const ALIASES = [
  ["slavelabor", "slavelaborgraphics", "slg", "slgpublishing"],
  ["seaboard", "atlascomics"], // Seaboard's 1975 Atlas line
  ["malibu", "eternity", "aircel"], // Malibu imprints; same group as the ingester's
  ["independentcomicsgroup", "icg"],
];
const plain = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
// "Kitchen Sink Press" and "Kitchen Sink", "Night Wynd Enterprises" and "Night
// Wynd". What is left must still be equal.
const noPress = (value) => String(value ?? "").replace(/\b(press|enterprises)\b/gi, "").trim();

export function publisherAgrees(ours, theirs) {
  if (!ours || !theirs) return false;
  return String(ours).split(";").some((part) =>
    publisherCompatible(part.trim(), theirs) ||
    publisherCompatible(noPress(part), noPress(theirs)) ||
    ALIASES.some((group) => group.includes(plain(part)) && group.includes(plain(theirs))));
}

const words = (value) => new Set(
  String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\[[^\]]*\]/g, " ")
    .split(/[^a-z0-9]+/).filter((w) => w && !["the", "a", "an", "of", "and", "comics"].includes(w)));

export function closeness(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let same = 0;
  for (const w of A) if (B.has(w)) same += 1;
  return same / (A.size + B.size - same);
}

const yearOf = (value) => {
  const n = Number(value);
  return value != null && value !== "" && Number.isInteger(n) && n > 1800 && n < 2200 ? n : null;
};

// series:     { name, publisher, year, count, collected }
// candidates: [{ id, name, publisher, start_year, count_of_issues }]
// rivals:     other GCD series of the same title [{ publisher, year, count }]
// takenBy:    Set of volume ids whose covers are already filed under another series
export function matchBlankSeries({ series, candidates, rivals = [], takenBy = new Set() }) {
  const year = yearOf(series.year);
  const key = titleKey(series.name);
  if (!key) return { status: "none", reason: "title has no letters to compare" };

  const scored = candidates.map((c) => {
    const theirYear = yearOf(c.start_year);
    return {
      ...c,
      title: titleKey(c.name) === key,
      pub: publisherAgrees(series.publisher, c.publisher),
      gap: year != null && theirYear != null ? Math.abs(year - theirYear) : null,
      count: Number(c.count_of_issues) > 0 && Number(c.count_of_issues) === Number(series.count),
      close: closeness(series.name, c.name),
    };
  });

  const fits = scored.filter((c) => c.title && c.pub && c.gap != null && c.gap <= 1);
  const sure = fits.filter((c) => c.count);
  const why = (c) => [
    !c.title && "title differs",
    !c.pub && "publisher differs",
    c.gap == null ? "no year to compare" : c.gap > 1 && "year differs",
    !c.count && "issue count differs",
  ].filter(Boolean);

  let reason = null;
  // A same-named trade or second volume doesn't cloud an exact count, except
  // for one-book series, where a count of one is no evidence.
  const oneBook = Number(series.count) === 1;
  if (sure.length === 1 && (fits.length === 1 || !oneBook)) {
    const [c] = sure;
    const twin = rivals.some((r) =>
      publisherAgrees(r.publisher, c.publisher) &&
      yearOf(r.year) != null && Math.abs(yearOf(r.year) - yearOf(c.start_year)) <= 1 &&
      Number(r.count) === Number(c.count_of_issues));
    if (takenBy.has(Number(c.id))) reason = "its covers are already filed under another series";
    else if (twin) reason = "another series of ours fits it equally well";
    // A count of one proves little: a trade, a hardcover and a one-shot can
    // share a title, publisher and year.
    else if (oneBook && series.collected) reason = "one-book collected edition";
    else if (oneBook && c.gap !== 0) reason = "one book and the years differ";
    else if (looksCollectedTitle(c.name) !== looksCollectedTitle(series.name)) reason = "only one of the two is a collected edition";
    else return { status: "sure", volume: pick(c) };
  } else if (fits.length > 1) reason = "several volumes fit";

  // Worth a person's time only when at most one of the four is off. A close
  // title counts as the one.
  const options = scored
    .filter((c) => (c.title || c.close >= 0.6) && why(c).length <= 1)
    .filter((c) => !takenBy.has(Number(c.id)))
    .sort((a, b) => Number(b.title) - Number(a.title) || Number(b.pub) - Number(a.pub) || Number(b.count) - Number(a.count) || (a.gap ?? 99) - (b.gap ?? 99) || b.close - a.close)
    .slice(0, 3)
    .map((c) => ({ ...pick(c), why: why(c) }));
  if (options.length) return { status: "ask", reason: reason ?? options[0].why.join(", "), options };
  return { status: "none", reason: reason ?? "nothing close on ComicVine" };
}

function pick(c) {
  return { id: Number(c.id), name: c.name, publisher: c.publisher ?? null, start_year: yearOf(c.start_year), count: Number(c.count_of_issues) || null };
}
