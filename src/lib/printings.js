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
  const digits = String(value ?? "").replace(/\D/g, "");
  // A 13th digit after a valid UPC-A is usually a decoder catching only the
  // first digit of the add-on. It is not enough information to identify the
  // issue, so retain the valid main code and discard the partial add-on.
  if (digits.length === 13 && !hasValidBarcodeCheckDigit(digits) && hasValidBarcodeCheckDigit(digits.slice(0, 12))) {
    return digits.slice(0, 12);
  }
  // BarcodeDetector reports UPC-A as EAN-13 on some browsers. A leading zero
  // is only the EAN representation of the same UPC, so keep one catalog key.
  if ([13, 15, 18].includes(digits.length) && digits.startsWith("0")) {
    return digits.slice(1);
  }
  return digits;
}

// What we accept, and why each length:
//   12  UPC-A, the base barcode alone
//   13  EAN-13, used on UK and European printings
//   14/15  UPC-A/EAN-13 + a 2-digit supplement
//   17/18  UPC-A/EAN-13 + a 5-digit supplement
// Nothing else is a barcode a comic actually carries, and accepting a
// 9-digit typo as valid would put junk in the one field meant to be exact.
const VALID_LENGTHS = new Set([12, 13, 14, 15, 17, 18]);

export function isValidUpc(value) {
  const digits = normalizeUpc(value);
  if (!VALID_LENGTHS.has(digits.length)) return false;
  const parsed = splitBarcode(digits);
  return Boolean(parsed && hasValidBarcodeCheckDigit(parsed.base));
}

export function hasValidBarcodeCheckDigit(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== 12 && digits.length !== 13) return false;
  const body = digits.slice(0, -1);
  const sum = [...body].reduce((total, digit, index) => {
    const positionFromRight = body.length - index;
    return total + Number(digit) * (positionFromRight % 2 === 1 ? 3 : 1);
  }, 0);
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}

export function combineBarcodeParts(values = []) {
  const normalized = values.map(normalizeUpc).filter(Boolean);
  const base = normalized.find((value) => value.length === 12 || value.length === 13);
  const supplement = normalized.find((value) => value.length === 2 || value.length === 5);
  const combined = base && supplement ? `${base}${supplement}` : normalized.find((value) => VALID_LENGTHS.has(value.length));
  return combined && isValidUpc(combined) ? normalizeUpc(combined) : null;
}

export function createDuplicateDebouncer(windowMs = 3000) {
  const reads = new Map();
  return (value, now = Date.now()) => {
    const code = normalizeUpc(value);
    const previous = reads.get(code);
    for (const [key, timestamp] of reads) if (now - timestamp >= windowMs) reads.delete(key);
    if (previous != null && now - previous < windowMs) return true;
    reads.set(code, now);
    return false;
  };
}

// Split a scanned barcode into the parts that mean something.
// Returns null when it is not a length we recognise.
export function parseUpc(value) {
  const digits = normalizeUpc(value);
  const parsed = splitBarcode(digits);
  if (!parsed || !hasValidBarcodeCheckDigit(parsed.base)) return null;
  const { base, supplement } = parsed;

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

function splitBarcode(digits) {
  if (!VALID_LENGTHS.has(digits.length)) return null;
  if (digits.length === 14) return { base: digits.slice(0, 12), supplement: digits.slice(12) };
  if (digits.length === 15) return { base: digits.slice(0, 13), supplement: digits.slice(13) };
  if (digits.length === 17) return { base: digits.slice(0, 12), supplement: digits.slice(12) };
  if (digits.length === 18) return { base: digits.slice(0, 13), supplement: digits.slice(13) };
  return { base: digits, supplement: null };
}

// The message shown next to the field. It says what is wrong and what to do,
// rather than "invalid".
export function upcProblem(value) {
  const digits = normalizeUpc(value);
  if (digits.length === 0) return null; // empty is fine; the field is optional
  if (isValidUpc(value)) return null;
  if (digits.length < 12) {
    return `That is ${digits.length} digits. A comic barcode is 12 or 13 digits, optionally followed by the small 2- or 5-digit block beside it.`;
  }
  if (digits.length > 18) {
    return `That is ${digits.length} digits, which is longer than any barcode a comic carries. Check for a doubled scan.`;
  }
  return `That is ${digits.length} digits. Include either the main barcode alone, or the main barcode plus the 2- or 5-digit block beside it.`;
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
