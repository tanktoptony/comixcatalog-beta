// Issue-page price guide from pricecharting_prices (migration 0105).
//
// PriceCharting's terms for showing this data (email 2026-11-10): every place
// a price shows cites PriceCharting with a link to that product's page, which
// is `url` below. Relative imports only.

export const GUIDE_GRADES = [
  { grade: "ungraded", label: "Ungraded", name: "Raw copy" },
  { grade: "2.0", label: "2.0", name: "GD" },
  { grade: "3.0", label: "3.0", name: "GD/VG" },
  { grade: "4.0", label: "4.0", name: "VG" },
  { grade: "5.0", label: "5.0", name: "VG/FN" },
  { grade: "6.0", label: "6.0", name: "FN" },
  { grade: "7.0", label: "7.0", name: "FN/VF" },
  { grade: "8.0", label: "8.0", name: "VF" },
  { grade: "9.0", label: "9.0", name: "VF/NM" },
  { grade: "9.2", label: "9.2", name: "NM-" },
  { grade: "9.4", label: "9.4", name: "NM" },
  { grade: "9.6", label: "9.6", name: "NM+" },
  { grade: "9.8", label: "9.8", name: "NM/M" },
  { grade: "10.0", label: "10.0", name: "Gem Mint" },
];

export function priceChartingUrl(pcId) {
  return `https://www.pricecharting.com/game/${encodeURIComponent(String(pcId))}`;
}

// rows: pricecharting_prices rows for the issue's editions. Returns the guide
// for exactly the edition being viewed, or null. A newsstand page never shows
// the direct edition's prices (they differ, sometimes several times over).
// Two PriceCharting products on one edition: the one with more sales wins.
export function buildPriceGuide(rows, editionGcdId) {
  const id = Number(editionGcdId);
  const mine = (Array.isArray(rows) ? rows : []).filter((r) => Number(r.gcd_issue_id) === id && r.prices && typeof r.prices === "object");
  if (mine.length === 0) return null;
  mine.sort((a, b) => (Number(b.sales_volume) || 0) - (Number(a.sales_volume) || 0) || Number(a.pc_id) - Number(b.pc_id));
  const row = mine[0];
  const grades = GUIDE_GRADES
    .map((g) => ({ ...g, value: centsToDollars(row.prices[g.grade]) }))
    .filter((g) => g.value != null);
  if (grades.length === 0) return null;
  return {
    pcId: Number(row.pc_id),
    url: priceChartingUrl(row.pc_id),
    productName: row.product_name ?? null,
    ungraded: grades.find((g) => g.grade === "ungraded")?.value ?? null,
    grades,
  };
}

function centsToDollars(cents) {
  const n = Number(cents);
  return Number.isFinite(n) && n > 0 ? Math.round(n) / 100 : null;
}
