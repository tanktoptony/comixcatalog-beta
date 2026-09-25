// Pick a ComicVine volume out of several candidates, or refuse.
//
// resolveNeedsVolumeIdBacklog.js only ever handled entries with exactly ONE
// candidate, leaving everything else for "a human call or a future matcher
// improvement". Measured against needs_volume_id.json on 2026-09-25:
//
//   1,560  unresolved targets
//     570  carry candidate volumes
//      39  have exactly one candidate   <- the old script's whole scope
//     531  have two or more             <- untouched
//
// Of those 531, the start year alone separates 98 cleanly: exactly one
// candidate begins the same year our series does. Another 10 have exactly
// one within a year either side, which covers cover-date drift.
//
// The other 423 stay untouched, and that is the point of this module being
// this conservative:
//
//   104  several candidates share our start year  -> the year proves nothing
//   241  no candidate matches our year at all     -> a match here would be a guess
//    88  our own row has no year                  -> nothing to compare
//
// Picking wrong is worse than not picking. A volume id gets PINNED, and
// comicvine_api_to_supabase.py trusts a pin ahead of its own title matching,
// so a bad pin routes an entire run's covers to the wrong series and keeps
// doing it on every future run.

import { looksCollectedTitle } from "./collectedTitle.js";
import { publisherCompatible } from "./publisherCompat.js";

function yearOf(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  // Number("") and Number(null) are both 0, and 0 passes isFinite. Same trap
  // that made a blank year match every series with no year recorded.
  if (!Number.isFinite(n) || n < 1800 || n > 2200) return null;
  return n;
}

function normalizeTitle(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Returns one of:
 *   { status: "matched", candidate, basis: "exact-year" | "near-year" }
 *   { status: "ambiguous", reason }
 *
 * `basis` is recorded so a later audit can tell a same-year pin apart from a
 * within-one-year pin without re-deriving it.
 */
export function resolveByYear(entry) {
  const candidates = entry?.candidates ?? [];
  if (candidates.length === 0) return { status: "ambiguous", reason: "no_candidates" };
  if (candidates.length === 1) {
    // Left to the existing single-candidate path, which also checks the
    // series side for duplicates. Claiming it here would double-handle it.
    return { status: "ambiguous", reason: "single_candidate_handled_elsewhere" };
  }

  const ourYear = yearOf(entry.year);
  if (ourYear == null) return { status: "ambiguous", reason: "no_year_on_our_side" };

  // A trade collection shares its title, and often its start year, with the
  // monthly it reprints. Drop those before counting, so a run whose only
  // same-year candidate is an omnibus reports ambiguous rather than pinning
  // the omnibus.
  const notCollected = candidates.filter((c) => !looksCollectedTitle(c.name));
  if (notCollected.length === 0) return { status: "ambiguous", reason: "all_candidates_look_collected" };

  // Every entry this path sees failed for publisher_mismatch, so the year is
  // being asked to override a signal that already said no. It is not allowed
  // to. A dry run without this guard wanted to pin Cinema Purgatorio to
  // Panini España and Girl to Dynamite (France) — foreign editions with
  // different issue counts and different art. See publisherCompat.js.
  const usable = notCollected.filter((c) => publisherCompatible(entry.publisher, c.publisher));
  if (usable.length === 0) return { status: "ambiguous", reason: "no_publisher_compatible_candidate" };

  const sameYear = usable.filter((c) => yearOf(c.start_year) === ourYear);
  if (sameYear.length === 1) {
    return { status: "matched", candidate: sameYear[0], basis: "exact-year" };
  }
  if (sameYear.length > 1) {
    // Two real volumes started the same year. The year has told us all it
    // can; a title tiebreak here would be guessing on a signal that already
    // failed upstream.
    return { status: "ambiguous", reason: "multiple_same_year" };
  }

  // No exact hit. Cover dates and GCD's key_date disagree by a year often
  // enough that ±1 is worth one more look, but only when it is unambiguous
  // AND the title matches exactly — a looser year needs a tighter title.
  const ourTitle = normalizeTitle(entry.name);
  const near = usable.filter((c) => {
    const y = yearOf(c.start_year);
    return y != null && Math.abs(y - ourYear) <= 1 && normalizeTitle(c.name) === ourTitle;
  });
  if (near.length === 1) {
    return { status: "matched", candidate: near[0], basis: "near-year" };
  }

  return { status: "ambiguous", reason: near.length > 1 ? "multiple_near_year" : "no_year_match" };
}
