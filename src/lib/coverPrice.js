// Rough cover-price estimate from publication year. Used as a UX hint in
// the library grade editor — shown under the "Paid" input when the user
// doesn't remember what they paid. NOT a market value; just the original
// newsstand/direct cover price tied to the era.
//
// Ranges follow the standard Marvel/DC mainline curve. Indies vary (Mirage
// TMNT #1 1984 was $1.50, way above the year's average), so we present this
// strictly as an "approx." hint and never as the authoritative paid value.

const COVER_PRICE_BY_YEAR = [
  { until: 1961, price: 0.1 },
  { until: 1969, price: 0.12 },
  { until: 1975, price: 0.25 },
  { until: 1979, price: 0.4 },
  { until: 1985, price: 0.65 },
  { until: 1990, price: 1.0 },
  { until: 1995, price: 1.5 },
  { until: 2000, price: 2.25 },
  { until: 2005, price: 2.75 },
  { until: 2010, price: 3.5 },
  { until: 2015, price: 3.99 },
  { until: 2020, price: 4.5 },
  { until: 2099, price: 4.99 },
];

export function estimateCoverPrice(year) {
  if (year == null) return null;
  const y = Number(year);
  if (!Number.isFinite(y)) return null;
  for (const band of COVER_PRICE_BY_YEAR) {
    if (y <= band.until) return band.price;
  }
  return null;
}

export function formatCoverPriceHint(year) {
  const price = estimateCoverPrice(year);
  if (price == null) return null;
  return `~$${price.toFixed(2)}`;
}
