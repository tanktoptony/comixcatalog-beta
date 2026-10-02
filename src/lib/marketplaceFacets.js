// Discogs-style browsing for /marketplace: filters with live counts, sort and
// pagination over the listing objects from src/lib/marketplace.js. Pure, so
// it runs in the browser and under `node --test`.
//
// Each facet's counts apply every *other* active filter, the way Discogs
// does it: picking "Marvel" still shows how many DC books there are, so you
// can switch publisher without clearing first.

export const PAGE_SIZE = 25;

export const SORTS = {
  newest: "Newest",
  "value-desc": "Value: high to low",
  "value-asc": "Value: low to high",
  title: "Title A–Z",
};

export const FORMATS = { raw: "Raw", slabbed: "Slabbed" };

export const GRADES = [
  ["9.0-10", "9.0 and up", 9, 10],
  ["8.0-8.9", "8.0 to 8.9", 8, 8.95],
  ["6.0-7.9", "6.0 to 7.9", 6, 7.95],
  ["0-5.9", "Under 6.0", 0, 5.95],
];

export const PRICES = [
  ["0-10", "Under $10", 0, 10],
  ["10-50", "$10 to $50", 10, 50],
  ["50-100", "$50 to $100", 50, 100],
  ["100-", "$100 and up", 100, Infinity],
];

const OTHER = "Other publishers";

export function publisherOf(l) {
  return l.publisher || OTHER;
}

export function decadeOf(l) {
  const y = Number(l.year);
  return Number.isFinite(y) && y > 1800 ? `${Math.floor(y / 10) * 10}s` : null;
}

// The price a buyer sees: the asking price when set, else the est. value.
export function shownValue(l) {
  return l.price ?? l.estValue ?? null;
}

function gradeBand(l) {
  if (l.grade == null) return null;
  const g = GRADES.find(([, , lo, hi]) => l.grade >= lo && l.grade <= hi);
  return g ? g[0] : null;
}

function priceBand(l) {
  const v = shownValue(l);
  if (v == null) return null;
  const p = PRICES.find(([, , lo, hi]) => v >= lo && v < hi);
  return p ? p[0] : null;
}

const FIELDS = {
  publisher: publisherOf,
  series: (l) => l.title,
  format: (l) => (l.slab ? "slabbed" : "raw"),
  grade: gradeBand,
  decade: decadeOf,
  price: priceBand,
};

export const FILTER_KEYS = Object.keys(FIELDS);

// URLSearchParams (or a plain object) -> { q, sort, page, publisher, ... }.
export function readFilters(params) {
  const get = (k) => (typeof params?.get === "function" ? params.get(k) : params?.[k]) || null;
  const f = { q: (get("q") ?? "").trim(), sort: SORTS[get("sort")] ? get("sort") : "newest" };
  const page = Number.parseInt(get("page") ?? "1", 10);
  f.page = Number.isFinite(page) && page > 0 ? page : 1;
  for (const k of FILTER_KEYS) f[k] = get(k);
  // A series only means something inside its publisher.
  if (!f.publisher) f.series = null;
  return f;
}

export function isBrowsing(f) {
  return Boolean(f.q) || FILTER_KEYS.some((k) => f[k]);
}

function matchesQuery(l, q) {
  if (!q) return true;
  const hay = `${l.title} #${l.issueNumber} ${l.title} ${l.issueNumber} ${l.publisher ?? ""} ${l.seller} ${l.variant ?? ""} ${l.year ?? ""}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word.replace(/^#/, "")));
}

function matches(l, f, skip) {
  if (!matchesQuery(l, f.q)) return false;
  for (const k of FILTER_KEYS) {
    if (k === skip || !f[k]) continue;
    if (FIELDS[k](l) !== f[k]) return false;
  }
  return true;
}

export function filterListings(listings, f) {
  return listings.filter((l) => matches(l, f, null));
}

// { publisher: [[value, count], ...], series: [...], ... } in display order.
export function facetCounts(listings, f) {
  const out = {};
  for (const k of FILTER_KEYS) {
    if (k === "series" && !f.publisher) continue;
    const counts = new Map();
    for (const l of listings) {
      if (!matches(l, f, k)) continue;
      const v = FIELDS[k](l);
      if (v == null) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    let entries = [...counts.entries()];
    if (k === "grade") entries = GRADES.map(([v]) => [v, counts.get(v) ?? 0]).filter(([, n]) => n);
    else if (k === "price") entries = PRICES.map(([v]) => [v, counts.get(v) ?? 0]).filter(([, n]) => n);
    else if (k === "format") entries = Object.keys(FORMATS).map((v) => [v, counts.get(v) ?? 0]).filter(([, n]) => n);
    else if (k === "decade") entries.sort((a, b) => b[0].localeCompare(a[0]));
    else entries.sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    out[k] = entries;
  }
  return out;
}

const issueOrder = (a, b) =>
  String(a.issueNumber).localeCompare(String(b.issueNumber), undefined, { numeric: true });

export function sortListings(list, sort) {
  const a = list.slice();
  const val = (l) => shownValue(l);
  if (sort === "value-desc") a.sort((x, y) => (val(y) ?? -1) - (val(x) ?? -1));
  else if (sort === "value-asc") a.sort((x, y) => (val(x) ?? Infinity) - (val(y) ?? Infinity));
  else if (sort === "title") a.sort((x, y) => x.title.localeCompare(y.title) || issueOrder(x, y));
  else a.sort((x, y) => String(y.listedAt ?? "").localeCompare(String(x.listedAt ?? "")));
  return a;
}

export function paginate(list, page, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { items: list.slice((current - 1) * size, current * size), page: current, pages, total: list.length };
}

// Label for an active filter chip.
export function filterLabel(key, value) {
  if (key === "format") return FORMATS[value] ?? value;
  if (key === "grade") return GRADES.find(([v]) => v === value)?.[1] ?? value;
  if (key === "price") return PRICES.find(([v]) => v === value)?.[1] ?? value;
  if (key === "publisher") return String(value).replace(/ Comics$/, "");
  return value;
}

// The landing page's shelves. Each list is capped so the page stays short.
export function landingSections(listings, n = 6) {
  const byNewest = sortListings(listings, "newest");
  const withValue = listings.filter((l) => shownValue(l) != null);
  const mostValuable = sortListings(withValue, "value-desc").slice(0, n);
  const mostWanted = listings
    .filter((l) => (l.wantCount ?? 0) > 0)
    .sort((a, b) => b.wantCount - a.wantCount || (shownValue(b) ?? 0) - (shownValue(a) ?? 0))
    .slice(0, n);
  const pubCounts = new Map();
  const sellerCounts = new Map();
  for (const l of listings) {
    const p = publisherOf(l);
    pubCounts.set(p, (pubCounts.get(p) ?? 0) + 1);
    sellerCounts.set(l.seller, (sellerCounts.get(l.seller) ?? 0) + 1);
  }
  const rank = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  return {
    justListed: byNewest.slice(0, n),
    mostWanted,
    mostValuable,
    publishers: rank(pubCounts).slice(0, 12),
    sellers: rank(sellerCounts).slice(0, 8),
  };
}
