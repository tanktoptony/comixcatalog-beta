// One definition of "is this GCD series a collected edition" for every
// consumer: the unpin script, the cover-resolution read paths, the series
// page badge. Values come from gcd_series.publishing_format / binding,
// mirrored from GCD's API by scripts/syncGcdSeriesFormat.js (migration 0028).
//
// GCD's publishing_format is free text but consistent in practice. Seen
// live 2026-09-21: "was ongoing series", "collected edition", "limited
// series", "one-shot", "ongoing series", "was limited series". Binding is
// similarly loose: "saddle-stitched", "trade paperback", "hardcover",
// "squarebound", "perfect bound".
//
// Null/unknown format means "not synced yet", and every consumer must treat
// that as "not a collected edition" so unsynced rows keep today's behaviour.

const COLLECTED_FORMAT = /collected|trade paperback|hardcover|omnibus|graphic novel|compendium|library edition|deluxe edition|absolute edition/i;
const COLLECTED_BINDING = /trade paperback|hardcover|hard cover|squarebound|perfect bound|omnibus/i;

export function isCollectedEdition({ publishing_format, binding } = {}) {
  if (publishing_format && COLLECTED_FORMAT.test(publishing_format)) return true;
  // Binding alone is weaker (some ongoing series are squarebound), so only
  // trust it when the format field is present but silent on the matter.
  if (publishing_format && binding && COLLECTED_BINDING.test(binding) && !/ongoing|limited|one-shot|series/i.test(publishing_format)) {
    return true;
  }
  return false;
}

// Short label for a series page badge. Null when there is nothing worth
// saying (ongoing series are the default and get no badge).
export function formatLabel({ publishing_format, binding } = {}) {
  if (isCollectedEdition({ publishing_format, binding })) {
    if (binding && /hardcover|hard cover/i.test(binding)) return "Collected edition (hardcover)";
    if (binding && /trade paperback/i.test(binding)) return "Collected edition (trade paperback)";
    return "Collected edition";
  }
  if (publishing_format && /one-shot/i.test(publishing_format)) return "One-shot";
  if (publishing_format && /limited/i.test(publishing_format)) return "Limited series";
  return null;
}

// GCD collected-edition notes read like
//   "Volume 1 - Legends in Exile collects Fables (DC, 2002 series) #1–5;\r\nVolume 2 - ..."
// Split them into one line per volume for display. Returns [] for notes
// that do not follow that shape (we show nothing rather than a wall of text).
export function collectsLines(notes) {
  if (!notes || !/collects/i.test(notes)) return [];
  return notes
    .split(/\r?\n|;\s*(?=Volume|Vol\.|Book|#)/)
    .map((s) => s.trim().replace(/;$/, ""))
    .filter((s) => /collects/i.test(s))
    .slice(0, 40);
}
