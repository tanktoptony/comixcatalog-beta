// Shared publisher resolution helpers.
//
// Problem context: GCD stores per-issue *indicia* publishers, which are often
// distributors or short-lived corporate entities (e.g. "Canam Publishers Sales
// Corp.", "Curtis Circulation Company", "Olympia Publications Inc.") rather
// than the master publisher a reader expects to see ("Marvel Comics",
// "DC Comics"). ComicVine data (stored in `series.cv_publisher` and
// `canonical_covers.publisher`) uses clean master names, so we prefer those
// when available and fall back to normalizing the GCD names.

export function normalizePublisherName(value) {
  return String(value ?? "").trim();
}

// MVP filter: restrict search surfaces to US publishers while we get the app
// off the ground. Values must match exactly what `resolvePublisher` produces
// (see MASTER_EXACT_MAP below). To expand, add the normalized name here and
// ensure MASTER_EXACT_MAP maps its variants to it.
export const US_PUBLISHER_ALLOWLIST = [
  "Marvel Comics",
  "DC Comics",
  "Image Comics",
  "Dark Horse Comics",
  "IDW Publishing",
  "BOOM! Studios",
  "Valiant Comics",
  "Dynamite Entertainment",
  "Archie Comics",
  "Top Cow Comics",
  "Vertigo",
  // Indie / classic-indie houses with significant US runs.
  // Mirage Studios is the canonical home of the original TMNT run (1984)
  // and was previously filtered out — that's why the original TMNT main
  // run didn't surface in series search. Same goes for the rest below.
  "Mirage Studios",
  "WildStorm",
  "Oni Press",
  "Caliber Comics",
  "Eclipse Comics",
  "First Comics",
  "AfterShock Comics",
  "Ahoy Comics",
  "Black Mask Studios",
  "AWA Studios",
  "Now Comics",
];

const MASTER_EXACT_MAP = {
  "marvel": "Marvel Comics",
  "marvel comics": "Marvel Comics",
  "marvel comics group": "Marvel Comics",
  "marvel comic": "Marvel Comics",
  "marvel worldwide": "Marvel Comics",
  "marvel worldwide inc": "Marvel Comics",
  "marvel worldwide, inc.": "Marvel Comics",

  "atlas magazines": "Marvel Comics",
  "atlas magazines inc": "Marvel Comics",
  "atlas magazines inc.": "Marvel Comics",
  "magazine management": "Marvel Comics",
  "magazine management co inc": "Marvel Comics",
  "magazine management co. inc.": "Marvel Comics",
  "magazine management co., inc.": "Marvel Comics",
  "olympia publications inc": "Marvel Comics",
  "olympia publications inc.": "Marvel Comics",

  "dc": "DC Comics",
  "dc comics": "DC Comics",
  "dc comics inc": "DC Comics",
  "dc comics inc.": "DC Comics",
  "dc comics, inc.": "DC Comics",
  "dc comics group": "DC Comics",
  "detective comics": "DC Comics",
  "detective comics inc": "DC Comics",
  "detective comics inc.": "DC Comics",
  "detective comics, inc.": "DC Comics",
  "national periodical publications": "DC Comics",
  "national periodical publications inc": "DC Comics",
  "national periodical publications inc.": "DC Comics",
  "wonder woman publishing company inc": "DC Comics",
  "wonder woman publishing company inc.": "DC Comics",

  "top cow": "Top Cow Comics",
  "top cow comics": "Top Cow Comics",
  "top cow productions": "Top Cow Comics",

  "image": "Image Comics",
  "image comics": "Image Comics",
  "image comics inc": "Image Comics",
  "image comics, inc.": "Image Comics",

  "dark horse": "Dark Horse Comics",
  "dark horse comics": "Dark Horse Comics",
  "dark horse comics inc.": "Dark Horse Comics",

  "boom": "BOOM! Studios",
  "boom studios": "BOOM! Studios",
  "boom! studios": "BOOM! Studios",

  "idw": "IDW Publishing",
  "idw publishing": "IDW Publishing",

  "vertigo": "Vertigo",
  "vertigo comics": "Vertigo",

  "archie": "Archie Comics",
  "archie comics": "Archie Comics",
  "archie comic publications": "Archie Comics",
  "archie comic publications, inc.": "Archie Comics",

  "valiant": "Valiant Comics",
  "valiant comics": "Valiant Comics",
  "valiant entertainment": "Valiant Comics",

  "dynamite": "Dynamite Entertainment",
  "dynamite entertainment": "Dynamite Entertainment",

  "mirage": "Mirage Studios",
  "mirage studios": "Mirage Studios",
  "mirage publishing": "Mirage Studios",
  "mirage comics": "Mirage Studios",

  "wildstorm": "WildStorm",
  "wildstorm productions": "WildStorm",
  "wildstorm comics": "WildStorm",

  "oni": "Oni Press",
  "oni press": "Oni Press",

  "caliber": "Caliber Comics",
  "caliber comics": "Caliber Comics",
  "caliber press": "Caliber Comics",

  "eclipse": "Eclipse Comics",
  "eclipse comics": "Eclipse Comics",
  "eclipse enterprises": "Eclipse Comics",

  "first": "First Comics",
  "first comics": "First Comics",
  "first publishing": "First Comics",

  "aftershock": "AfterShock Comics",
  "aftershock comics": "AfterShock Comics",

  "ahoy": "Ahoy Comics",
  "ahoy comics": "Ahoy Comics",

  "black mask": "Black Mask Studios",
  "black mask studios": "Black Mask Studios",

  "awa": "AWA Studios",
  "awa studios": "AWA Studios",
  "artists writers & artisans": "AWA Studios",

  "now": "Now Comics",
  "now comics": "Now Comics",
};

// Distributors, regional reprinters, and generic "<series> Publishing Co Inc"
// shell companies that GCD sometimes records as the issue publisher. We treat
// these as noise and prefer any alternative resolution path.
const DISTRIBUTOR_PATTERNS = [
  /\bcanam publishers\b/,
  /\bcurtis circulation\b/,
  /\bworld color press\b/,
  /\bindependent news\b/,
  /\bnewsstand distribution\b/,
  /\bdistribution co\b/,
  /\bdistributing co\b/,
];

export function normalizePublisherLabel(value) {
  const pub = normalizePublisherName(value);
  if (!pub) return null;

  const lower = pub.toLowerCase();

  if (MASTER_EXACT_MAP[lower]) return MASTER_EXACT_MAP[lower];

  if (DISTRIBUTOR_PATTERNS.some((re) => re.test(lower))) return null;

  if (lower.includes("marvel")) return "Marvel Comics";
  if (lower.includes("atlas magazines")) return "Marvel Comics";
  if (lower.includes("magazine management")) return "Marvel Comics";

  if (lower.includes("dc comics")) return "DC Comics";
  if (lower.includes("detective comics")) return "DC Comics";
  if (lower.includes("national periodical")) return "DC Comics";

  if (lower.includes("top cow")) return "Top Cow Comics";
  if (lower.includes("image comics")) return "Image Comics";
  if (lower.includes("dark horse")) return "Dark Horse Comics";
  if (lower.includes("boom")) return "BOOM! Studios";
  if (lower.includes("idw")) return "IDW Publishing";
  if (lower.includes("vertigo")) return "Vertigo";
  if (lower.includes("archie")) return "Archie Comics";
  if (lower.includes("valiant")) return "Valiant Comics";
  if (lower.includes("dynamite")) return "Dynamite Entertainment";

  // Indie / classic-indie houses (added after the original TMNT main run
  // failed to surface in series search because Mirage wasn't in any list).
  if (lower.includes("mirage")) return "Mirage Studios";
  if (lower.includes("wildstorm")) return "WildStorm";
  if (lower.includes("oni press") || lower === "oni") return "Oni Press";
  if (lower.includes("caliber")) return "Caliber Comics";
  if (lower.includes("eclipse")) return "Eclipse Comics";
  if (lower.includes("first comics") || lower.includes("first publishing")) return "First Comics";
  if (lower.includes("aftershock")) return "AfterShock Comics";
  if (lower.includes("ahoy")) return "Ahoy Comics";
  if (lower.includes("black mask")) return "Black Mask Studios";
  if (lower.includes("awa studios") || lower === "awa") return "AWA Studios";

  return null;
}

export function isSuspiciousPublisherName(publisherName, seriesTitle) {
  const pub = normalizePublisherName(publisherName).toLowerCase();
  const title = String(seriesTitle ?? "").trim().toLowerCase();

  if (!pub) return true;
  if (pub === "unknown publisher") return true;

  if (title && pub.includes(title)) return true;

  if (DISTRIBUTOR_PATTERNS.some((re) => re.test(pub))) return true;

  if (
    pub.includes("publishing company") ||
    pub.includes("publishing co") ||
    pub.includes("company inc") ||
    pub.includes("publications inc") ||
    pub.includes("publishers inc") ||
    pub.includes("comics inc")
  ) {
    return true;
  }

  return false;
}

// Given a set of candidate publisher names (in any order/priority), pick the
// first one that normalizes to a known master publisher. Used to scan all
// per-issue publishers across a series so one mislabeled issue doesn't poison
// the result.
export function pickMasterFromCandidates(candidateNames) {
  for (const name of candidateNames ?? []) {
    const normalized = normalizePublisherLabel(name);
    if (normalized) return normalized;
  }
  return null;
}

// Resolve a final publisher display name from the available sources, ordered
// by trust:
//   1. Normalized ComicVine value (clean master names)
//   2. Raw ComicVine value (if present, even if not normalized)
//   3. Normalized value from any local/GCD candidate
//   4. Raw local/GCD candidate if not suspicious
//   5. "Unknown Publisher"
export function resolvePublisher({
  cv = null,
  candidates = [],
  seriesTitle = null,
} = {}) {
  const normalizedCv = normalizePublisherLabel(cv);
  if (normalizedCv) return normalizedCv;

  const rawCv = normalizePublisherName(cv);
  if (rawCv && !isSuspiciousPublisherName(rawCv, seriesTitle)) return rawCv;

  const master = pickMasterFromCandidates(candidates);
  if (master) return master;

  for (const candidate of candidates) {
    const raw = normalizePublisherName(candidate);
    if (raw && !isSuspiciousPublisherName(raw, seriesTitle)) return raw;
  }

  return "Unknown Publisher";
}
