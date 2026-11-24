export function parseSparqlRows(rows = []) {
  return rows.map((row) => ({
    gcdId: String(row.gcd?.value ?? "").trim(),
    item: String(row.item?.value ?? "").trim(),
    image: String(row.image?.value ?? "").trim(),
  })).filter((row) => row.gcdId && row.item && row.image);
}

export function pickImagesByGcdId(rows = []) {
  const byGcd = new Map();
  for (const row of rows) {
    let items = byGcd.get(row.gcdId);
    if (!items) {
      items = new Map();
      byGcd.set(row.gcdId, items);
    }
    // Retaining the first row for an item preserves Wikidata's returned order.
    if (!items.has(row.item)) items.set(row.item, row.image);
  }
  const picked = new Map();
  for (const [gcdId, items] of byGcd) {
    if (items.size === 1) picked.set(gcdId, items.values().next().value);
  }
  return picked;
}

export function isFreeLicense(value) {
  const license = String(value ?? "").trim();
  return /^(?:Public domain|CC0|CC BY(?:-SA)? \d+(?:\.\d+)+(?: [\w.-]+)?)$/i.test(license);
}

export function cleanCredit(value) {
  const clean = String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return clean || "Unknown author";
}

export function commonsTitle(imageUrl) {
  const marker = "/Special:FilePath/";
  const index = imageUrl.indexOf(marker);
  if (index < 0) return null;
  return `File:${decodeURIComponent(imageUrl.slice(index + marker.length)).replace(/_/g, " ")}`;
}
