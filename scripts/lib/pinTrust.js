// When the issue evidence may overrule a series.comicvine_volume_id pin.
//
// A pin outranks issue overlap on purpose: our GCD mirror is thin on new series
// (Absolute Batman had one issue indexed when its volume had 23), so low overlap
// alone proves nothing. But nothing ever checked the pins themselves. On
// 2026-11-24, 81 volumes were pinned to a finished series from another publisher
// that lacks most of the volume's issues: Marvel's Spectacular Spider-Man #49-132
// and #134 to a one-book Australian reprint, Chew to the German edition, Revival
// to the French one. The repair re-filed every cover there on every run.
import { normalizePublisher, publisherMatches } from "./publisherMatch.js";

export const PIN_MIN_ISSUES = 5;
export const PIN_MAX_OVERLAP = 0.5;

// All of these together can't be the thin-mirror case: the pinned series ended
// at least two years ago, belongs to a different publisher, and lacks more than
// half of the volume's issues.
export function pinIsWrong({ volumeIssues, overlap, volumePublisher, pinPublisher, pinYearEnded, thisYear = new Date().getUTCFullYear() }) {
  if (volumeIssues < PIN_MIN_ISSUES || overlap >= PIN_MAX_OVERLAP) return false;
  if (!pinYearEnded || Number(pinYearEnded) > thisYear - 2) return false;
  if (!normalizePublisher(volumePublisher) || !normalizePublisher(pinPublisher)) return false;
  return !publisherMatches(volumePublisher, pinPublisher);
}

// A volume freed from its pin may only move to a series from its own publisher.
// Looser than publisherMatches because the databases name the same house
// differently ("Caliber Comics" / "Caliber Press", "Lev Gleason" / "Lev Gleason
// [1930s-1950s]"): the first word has to agree. An Australian Felix the Cat
// volume (Yaffa / Page) fits Toby's US run on numbers alone.
export function samePublisherFamily(a, b) {
  if (publisherMatches(a, b)) return true;
  const first = (value) => normalizePublisher(value).split(" ")[0];
  return first(a) !== "" && first(a) === first(b);
}
