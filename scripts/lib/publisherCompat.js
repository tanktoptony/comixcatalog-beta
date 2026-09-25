// Are these two publisher names the same real publisher?
//
// A JavaScript port of _norm_publisher and PUBLISHER_ALIASES from
// comicvine_api_to_supabase.py. Ported rather than loosened on purpose: the
// Python comment explains that the alias list is exact-set membership, NOT a
// prefix or fuzzy match, because a prefix check on "marvel" would swallow
// "Marvel UK/Panini UK" — a different regional licensee whose issues do not
// correspond 1:1 to the US run.
//
// Why this exists here at all. resolveByYear was written to disambiguate
// multi-candidate backlog entries by start year, and a dry run against the
// real backlog showed every single one of the 107 it resolved came from
// reason `publisher_mismatch` — the one category where the publisher signal
// had already failed. Left unguarded it wanted to pin, among others:
//
//   Cinema Purgatorio (Avatar Press)      -> Panini España
//   Space-Mullet! (Dark Horse Comics)     -> Akileos
//   Girl (Dynamite Entertainment)         -> Dynamite (France)
//   Amazing Spider-Man (Marvel Comics)    -> Panini Comics
//
// Those are Spanish and French editions. A pinned volume_id overrides the
// ingester's own title matching on every future run, so pinning one would
// route that series' covers to the foreign edition permanently.
//
// The cost of this guard is real and accepted: Top Cow to Image and Malibu
// to Eternity are genuine imprint relationships it will refuse. A missed
// pin costs one series its covers until someone looks. A wrong pin costs the
// series its identity and keeps costing it.

const GENERIC =
  /\b(comics|entertainment|publishing|publications|productions|studios|media|inc\.?|llc|ltd|company|co\.?)\b/g;

export function normalizePublisher(value) {
  if (!value) return "";
  return String(value).trim().toLowerCase().replace(GENERIC, "").replace(/[^a-z0-9]+/g, "");
}

// Same real publisher under a different era's masthead. Every pair is
// confirmed in the Python source against actual collisions; this list is a
// copy of it, not an extension of it.
const PUBLISHER_ALIASES = [
  new Set(["goldkey", "western"]), // Gold Key was Western Publishing's own imprint
  new Set(["wildstorm", "dc"]), // WildStorm was a DC imprint 1999-2010
  new Set(["wildstorm", "image"]), // WildStorm was founded within Image 1992-1998
  new Set(["valiant", "valiantacclaim", "dmgvaliant"]),
  new Set(["aspen", "aspenmlt"]),
  new Set(["udon", "udoncorp"]),
];

export function publisherCompatible(a, b) {
  const x = normalizePublisher(a);
  const y = normalizePublisher(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return PUBLISHER_ALIASES.some((group) => group.has(x) && group.has(y));
}
