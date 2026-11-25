// Which version on file a collector's own label is describing ("Cover F 1:25
// Ian Bertram Variant"). Only ever a suggestion the collector confirms, so it
// answers when exactly one version says the same thing and stays quiet
// otherwise. Read by hand on 3,245 real labels (2026-11-24): versions with
// extra words were often a different book ("Kris Anka Variant" vs "Kris Anka
// Design Variant"), so the words must match both ways.
//
// Plain functions only, so node --test can load this without Next.js.

// Words that don't tell one version of an issue from another.
const FILLER = new Set([
  "cover", "covers", "variant", "variants", "edition", "version", "comic", "comics", "issue", "the", "a", "an",
  "of", "by", "and", "with", "in", "for", "cardstock", "card", "stock", "incentive", "ratio", "art",
]);

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];

function printingNumber(word) {
  const digits = word.match(/^(\d+)(?:st|nd|rd|th)?$/);
  if (digits) return Number(digits[1]);
  const index = ORDINALS.indexOf(word);
  return index < 0 ? null : index + 1;
}

function plain(value) {
  return String(value ?? "")
    .normalize("NFD").replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’`]s\b/g, "").replace(/['’`]/g, "")
    .replace(/\b(?:black|b)\s*(?:&|and|\/)\s*(?:white|w)\b/g, " bw ");
}

// { letter, printing, words } for a label or a version name.
export function readVariantName(value, seriesTitle = "") {
  let text = plain(value);
  const letter = text.match(/\b(?:cover|cvr)\s+([a-z])\b/)?.[1] ?? text.match(/\bvariant\s+([b-z])$/)?.[1] ?? null;
  if (letter) text = text.replace(new RegExp(`\\b(cover|cvr|variant)\\s+${letter}\\b`), " ");
  let printing = null;
  text = text.replace(/\b(\w+)\s+print(?:ing)?\b/, (match, word) => {
    printing = printingNumber(word);
    return printing ? " " : match;
  });
  text = text.replace(/\b\d+\s*:\s*\d+\b/g, " ");
  const series = new Set(plain(seriesTitle).match(/[a-z0-9]+/g) ?? []);
  const words = new Set((text.match(/[a-z0-9]+/g) ?? [])
    .filter((word) => word.length > 1 && !FILLER.has(word) && !series.has(word)));
  return { letter, printing: printing > 1 ? printing : null, words };
}

function saysTheSame(label, name) {
  if (label.printing !== name.printing) return false;
  if (label.letter && name.letter && label.letter !== name.letter) return false;
  if (label.words.size !== name.words.size) return false;
  // "2nd Printing" alone is enough; "Variant" alone is not.
  if (!label.words.size && !label.printing) return false;
  return [...label.words].every((word) => name.words.has(word));
}

// versions: the picker's tiles [{ gcdId, name, isBase, cover }]. Returns one
// version or null. Only for a copy still saved as the regular edition: anyone
// on another version has already said which one they own.
export function suggestVersion(label, versions, { seriesTitle = "", currentGcdId = null } = {}) {
  const current = (versions ?? []).find((version) => Number(version.gcdId) === Number(currentGcdId));
  if (!current?.isBase || !String(label ?? "").trim()) return null;
  const wanted = readVariantName(label, seriesTitle);
  const hits = versions.filter((version) => saysTheSame(wanted, readVariantName(version.name, seriesTitle)));
  return hits.length === 1 && !hits[0].isBase ? hits[0] : null;
}

// "Not mine" is remembered on this device so the question isn't asked again.
const dismissKey = (collectionId) => `cc-label-suggestion-no:${collectionId}`;
export function isLabelSuggestionDismissed(collectionId) {
  try { return window.localStorage.getItem(dismissKey(collectionId)) === "1"; } catch { return false; }
}
export function dismissLabelSuggestion(collectionId) {
  try { window.localStorage.setItem(dismissKey(collectionId), "1"); } catch { /* asked again next time */ }
}
