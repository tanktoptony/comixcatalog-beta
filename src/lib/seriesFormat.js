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

function has(value, pattern) {
  return pattern.test(String(value ?? ""));
}

export function formatTag(format = {}) {
  const collected = isCollectedEdition(format) || has(format.publishing_format, /graphic novel/i);
  if (collected) {
    if (has(format.name, /\bomnibus\b/i)) return "Omnibus";
    if (has(format.name, /\babsolute\b/i)) return "Absolute";
    if (has(format.name, /\bcompendium\b/i)) return "Compendium";
    if (has(format.name, /\blibrary edition\b/i)) return "Library Edition";
    if (has(format.name, /\bartist(?:'|’)?s edition\b/i)) return "Artist's Edition";
    if (has(format.name, /\bdeluxe\b/i)) return "Deluxe";
    if (has(format.binding, /hardcover|hard cover/i)) return "HC";
    if (has(format.binding, /trade paperback|softcover|squarebound|perfect bound/i)) return "TPB";
    if (has(format.publishing_format, /graphic novel/i)) return "Graphic Novel";
    return "Collected";
  }
  if (has(format.publishing_format, /giveaway/i)) return "Giveaway";
  if (has(format.name, /\bdigest\b/i)) return "Digest";
  if (has(format.name, /treasury edition|treasury[- ]size/i)) return "Treasury";
  if (has(format.publishing_format, /one-shot/i)) return "One-shot";
  if (has(format.publishing_format, /limited series|miniseries/i)) return "Limited";
  return null;
}

export function formatTagTitle(format = {}) {
  const tag = formatTag(format);
  if (!tag) return null;
  const labels = {
    HC: "Hardcover collected edition",
    TPB: "Trade paperback collected edition",
    Collected: "Collected edition",
    Omnibus: "Omnibus collected edition",
    Absolute: "Absolute collected edition",
    Compendium: "Compendium collected edition",
    "Library Edition": "Library Edition collected edition",
    "Artist's Edition": "Artist's Edition collected edition",
    Deluxe: "Deluxe collected edition",
    "Graphic Novel": "Graphic novel",
    Giveaway: "Giveaway",
    Digest: "Digest series",
    Treasury: "Treasury-size series",
    "One-shot": "One-shot series",
    Limited: "Limited series",
  };
  return labels[tag] ?? tag;
}

// Plain noun used in factual prose. Keep this aligned with formatLabel so
// unsynced format data never turns into a claim about the publication type.
export function formatNoun(format = {}) {
  if (isCollectedEdition(format)) return "collected edition";
  if (format.publishing_format && /one-shot/i.test(format.publishing_format)) {
    return "one-shot";
  }
  return "series";
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
