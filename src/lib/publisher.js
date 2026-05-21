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
  // Additional US indies surfaced by the publisher audit dry-run.
  "Fantagraphics",
  "Avatar Press",
  "Titan Comics",
  "Antarctic Press",
  "Zenescope Entertainment",
  "VIZ Media",
  "Archaia",
  "Rebellion",
  // Modern indies — popular publishers user explicitly asked for or that
  // commonly turn up in searches for current-era books.
  "Aspen Comics",
  "Vault Comics",
  "Skybound",
  "Mad Cave Studios",
  "Heavy Metal",
  "Action Lab Entertainment",
  "Devil's Due",
  // Classic-era US publishers. Missing these is why Donald Duck (1952) shows
  // as "BOOM! Studios" — GCD indicia says "Dell" but Dell wasn't recognized,
  // so the year-aware pre-2000 branch fell back to the cv_publisher (which
  // reflects the modern IP holder, BOOM! in this case).
  "Dell Comics",
  "Gold Key",
  "Charlton Comics",
  "Harvey Comics",
  "EC Comics",
  "Fawcett Comics",
  "Atlas Comics",
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

  "fantagraphics": "Fantagraphics",
  "fantagraphics books": "Fantagraphics",
  "fantagraphics books inc": "Fantagraphics",
  "fantagraphics books, inc.": "Fantagraphics",

  "avatar": "Avatar Press",
  "avatar press": "Avatar Press",
  "avatar press inc": "Avatar Press",
  "avatar press inc.": "Avatar Press",

  "titan": "Titan Comics",
  "titan comics": "Titan Comics",
  "titan books": "Titan Comics",

  "antarctic press": "Antarctic Press",

  "zenescope": "Zenescope Entertainment",
  "zenescope entertainment": "Zenescope Entertainment",
  "zenescope entertainment inc": "Zenescope Entertainment",
  "zenescope entertainment, inc.": "Zenescope Entertainment",

  "viz": "VIZ Media",
  "viz media": "VIZ Media",
  "viz media llc": "VIZ Media",
  "viz media, llc": "VIZ Media",
  "viz comics": "VIZ Media",

  "archaia": "Archaia",
  "archaia entertainment": "Archaia",
  "archaia studios press": "Archaia",

  "rebellion": "Rebellion",
  "rebellion developments": "Rebellion",
  "2000 ad": "Rebellion",

  // Modern indies added in the recent allowlist expansion.
  "aspen": "Aspen Comics",
  "aspen comics": "Aspen Comics",
  "aspen mlt": "Aspen Comics",
  "aspen mlt inc": "Aspen Comics",
  "aspen mlt, inc.": "Aspen Comics",

  "vault": "Vault Comics",
  "vault comics": "Vault Comics",

  "skybound": "Skybound",
  "skybound entertainment": "Skybound",

  "mad cave": "Mad Cave Studios",
  "mad cave studios": "Mad Cave Studios",

  "heavy metal": "Heavy Metal",
  "heavy metal magazine": "Heavy Metal",
  "metal mammoth": "Heavy Metal",
  "metal mammoth inc": "Heavy Metal",

  "action lab": "Action Lab Entertainment",
  "action lab entertainment": "Action Lab Entertainment",
  "action lab comics": "Action Lab Entertainment",

  "devil's due": "Devil's Due",
  "devils due": "Devil's Due",
  "devil's due publishing": "Devil's Due",
  "devil's due entertainment": "Devil's Due",

  // Classic-era US publishers — added to fix mis-attribution of older books
  // (e.g. Donald Duck 1952 showing "BOOM! Studios" because Dell wasn't
  // recognized, so the pre-2000 indicia branch returned null and fell back
  // to cv_publisher which holds the modern IP owner).
  "dell": "Dell Comics",
  "dell comics": "Dell Comics",
  "dell publishing": "Dell Comics",
  "dell publishing co inc": "Dell Comics",
  "dell publishing co., inc.": "Dell Comics",

  "gold key": "Gold Key",
  "gold key comics": "Gold Key",
  "western publishing": "Gold Key",
  "western publishing company inc": "Gold Key",
  "k. k. publications": "Gold Key",
  "k. k. publications, inc.": "Gold Key",
  "whitman": "Gold Key",
  "whitman publishing": "Gold Key",

  "charlton": "Charlton Comics",
  "charlton comics": "Charlton Comics",
  "charlton comics group": "Charlton Comics",
  "charlton publications": "Charlton Comics",
  "charlton publications inc": "Charlton Comics",

  "harvey": "Harvey Comics",
  "harvey comics": "Harvey Comics",
  "harvey publications": "Harvey Comics",
  "harvey publications inc": "Harvey Comics",
  "harvey features syndicate": "Harvey Comics",

  "ec": "EC Comics",
  "ec comics": "EC Comics",
  "ec publications": "EC Comics",
  "entertaining comics": "EC Comics",
  "william m. gaines": "EC Comics",

  "fawcett": "Fawcett Comics",
  "fawcett comics": "Fawcett Comics",
  "fawcett publications": "Fawcett Comics",
  "fawcett publications inc": "Fawcett Comics",

  "atlas": "Atlas Comics",
  "atlas comics": "Atlas Comics",
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

  // Additional US indies — surfaced when the publisher audit found these
  // were getting downgraded to "Unknown Publisher".
  if (lower.includes("fantagraphics")) return "Fantagraphics";
  if (lower.includes("avatar press")) return "Avatar Press";
  if (lower.includes("titan comics") || lower.includes("titan books") || lower === "titan") return "Titan Comics";
  if (lower.includes("antarctic press")) return "Antarctic Press";
  if (lower.includes("zenescope")) return "Zenescope Entertainment";
  if (lower.includes("viz media") || lower.includes("viz comics") || lower === "viz") return "VIZ Media";
  if (lower.includes("archaia")) return "Archaia";
  if (lower.includes("rebellion") || lower === "2000 ad") return "Rebellion";

  // Modern indies (recent expansion).
  if (lower.includes("aspen")) return "Aspen Comics";
  if (lower.includes("vault")) return "Vault Comics";
  if (lower.includes("skybound")) return "Skybound";
  if (lower.includes("mad cave")) return "Mad Cave Studios";
  if (lower.includes("heavy metal") || lower.includes("metal mammoth")) return "Heavy Metal";
  if (lower.includes("action lab")) return "Action Lab Entertainment";
  if (lower.includes("devil's due") || lower.includes("devils due")) return "Devil's Due";

  // Classic-era US — needed to keep pre-2000 mis-attribution from falling
  // through to the modern cv_publisher (current IP holder).
  if (lower.includes("dell")) return "Dell Comics";
  if (lower.includes("gold key") || lower.includes("western publishing") || lower.includes("whitman")) return "Gold Key";
  if (lower.includes("charlton")) return "Charlton Comics";
  if (lower.includes("harvey")) return "Harvey Comics";
  if (lower === "ec" || lower.includes("ec comics") || lower.includes("entertaining comics")) return "EC Comics";
  if (lower.includes("fawcett")) return "Fawcett Comics";
  // "Atlas" is ambiguous — the 50s Marvel-predecessor and the 70s Atlas/Seaboard
  // are both real. Only exact-match here, no substring fallback.

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
