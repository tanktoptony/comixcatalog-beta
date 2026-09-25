// Reading the barcode off the back of a comic.
//
// This is the comics equivalent of the catalogue number Discogs dedupes on:
// the one identifier printed on the object itself, which is what makes two
// printings of the same issue tellable apart without a photograph.
//
// Comic barcodes are not plain UPC-A. A monthly book prints a 12-digit UPC
// followed by a small 5-digit supplement, and the supplement is what tells
// two printings of the same issue apart.
//
// That is why a "duplicate" barcode is usually not a duplicate at all. Two
// covers of the same issue share the 12-digit base and differ only in the
// supplement, exactly the way two pressings of a record share a Master and
// differ in catalogue number.
//
// This module deliberately stops short of decoding the supplement. See
// parseUpc for why.

// Barcodes get typed with spaces and dashes, or scanned as one run of
// digits. Strip to digits and judge the length.
export function normalizeUpc(value) {
  return String(value ?? "").replace(/\D/g, "");
}

// What we accept, and why each length:
//   12  UPC-A, the base barcode alone
//   13  EAN-13, used on UK and European printings
//   17  UPC-A + the 5-digit comics supplement (the common case)
//   18  EAN-13 + supplement
// Nothing else is a barcode a comic actually carries, and accepting a
// 9-digit typo as valid would put junk in the one field meant to be exact.
const VALID_LENGTHS = new Set([12, 13, 17, 18]);

export function isValidUpc(value) {
  const digits = normalizeUpc(value);
  return VALID_LENGTHS.has(digits.length);
}

// Split a scanned barcode into the parts that mean something.
// Returns null when it is not a length we recognise.
export function parseUpc(value) {
  const digits = normalizeUpc(value);
  if (!VALID_LENGTHS.has(digits.length)) return null;

  const hasSupplement = digits.length === 17 || digits.length === 18;
  const base = hasSupplement ? digits.slice(0, digits.length - 5) : digits;
  const supplement = hasSupplement ? digits.slice(-5) : null;

  return {
    digits,
    base,
    // Kept whole, on purpose, and not decoded.
    //
    // The supplement does encode the issue and the cover variant, but
    // published accounts of which digit means what disagree, and they
    // disagree differently across publishers and eras. Storing "issue 30"
    // because a slice happened to read 30 would be inventing a fact about
    // someone's book. Two printings of one issue share `base` and differ
    // here, which is the comparison this is actually for; decoding it can
    // come later, from real examples rather than from a guess.
    supplement,
    // A supplement of all zeroes is a placeholder the printer used, not data.
    hasSupplement: Boolean(supplement && supplement !== "00000"),
  };
}

// The message shown next to the field. It says what is wrong and what to do,
// rather than "invalid".
export function upcProblem(value) {
  const digits = normalizeUpc(value);
  if (digits.length === 0) return null; // empty is fine; the field is optional
  if (isValidUpc(value)) return null;
  if (digits.length < 12) {
    return `That is ${digits.length} digits. A comic barcode is 12 or 13, or 17 to 18 with the small 5-digit block beside it.`;
  }
  if (digits.length > 18) {
    return `That is ${digits.length} digits, which is longer than any barcode a comic carries. Check for a doubled scan.`;
  }
  return `That is ${digits.length} digits. Include either the main barcode alone, or the main barcode plus the 5-digit block beside it.`;
}

// A printing report needs to actually say something. A row with neither a
// name nor a barcode is a row that can never be reviewed.
export function describeSubmission({ printingName, upc } = {}) {
  const name = String(printingName ?? "").trim();
  const digits = normalizeUpc(upc);
  if (!name && !digits) return null;
  if (name && digits) return `${name} (${digits})`;
  return name || digits;
}
