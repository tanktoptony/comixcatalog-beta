import { parseSearchQuery } from "./searchQuery.js";

// Discogs-style browsing for /marketplace: filters with live counts, sort and
// pagination over the listing objects from src/lib/marketplace.js. Pure, so
// it runs in the browser and under `node --test`.
//
// Each facet's counts apply every *other* active filter, the way Discogs
// does it: picking "Marvel" still shows how many DC books there are, so you
// can switch publisher without clearing first.

export const PAGE_SIZE = 25;

export const SORTS = {
  relevance: "Best match",
  newest: "Newest",
  "value-desc": "Price: high to low",
  "value-asc": "Price: low to high",
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

// The only price a buyer sees is the seller's asking price.
export function shownValue(l) {
  return l.price ?? null;
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
  const q = (get("q") ?? "").trim();
  // Searching ranks by best match unless a sort was picked; browsing
  // without a query has nothing to match, so it falls back to newest.
  const asked = SORTS[get("sort")] ? get("sort") : null;
  const f = { q, sort: asked && !(asked === "relevance" && !q) ? asked : q ? "relevance" : "newest" };
  const page = Number.parseInt(get("page") ?? "1", 10);
  f.page = Number.isFinite(page) && page > 0 ? page : 1;
  for (const k of FILTER_KEYS) f[k] = get(k);
  // "From your wantlist": only books on the viewer's wantlist.
  f.wants = get("wants") === "1";
  // A series only means something inside its publisher.
  if (!f.publisher) f.series = null;
  return f;
}

export function isBrowsing(f) {
  return Boolean(f.q) || Boolean(f.wants) || FILTER_KEYS.some((k) => f[k]);
}

// Same rules as the catalog search (/api/search/*, src/lib/searchQuery.js):
// punctuation and case don't matter ("xmen" finds X-Men, "spiderman" finds
// Spider-Man), a leading "The" doesn't matter, a trailing number is the
// issue ("hulk 181"), a four-digit one is the year ("x-men 1991"). The
// query can also name a seller or publisher.
function compact(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/^\s*(the|a|an)\s+/, "")
    .replace(/[^a-z0-9]/g, "");
}

function baseIssue(value) {
  const m = String(value ?? "").trim().replace(/^#/, "").match(/^\d+(?:\.\d+)?/);
  return m ? m[0].replace(/^0+(?=\d)/, "") : String(value ?? "").trim().toLowerCase();
}

const parsedCache = new Map();
function parseQuery(q) {
  if (!parsedCache.has(q)) {
    const p = parseSearchQuery(q);
    const words = q.toLowerCase().split(/\s+/).map((w) => w.replace(/^[#@]/, "")).filter(Boolean);
    parsedCache.set(q, { ...p, titleKey: compact(p.title), words });
    if (parsedCache.size > 50) parsedCache.delete(parsedCache.keys().next().value);
  }
  return parsedCache.get(q);
}

// 0 = no match; higher is a better match (used by the "Best match" sort).
export function queryScore(l, q) {
  if (!q) return 1;
  const p = parseQuery(q);
  const title = compact(l.title);
  let score = 0;
  if (p.titleKey) {
    if (title === p.titleKey) score = 1000;
    else if (title.startsWith(p.titleKey)) score = 600 - Math.min(300, title.length - p.titleKey.length);
    else if (title.includes(p.titleKey)) score = 250 - Math.min(200, title.length - p.titleKey.length);
  }
  if (score > 0) {
    if (p.issue != null && baseIssue(l.issueNumber) !== baseIssue(p.issue)) return 0;
    if (p.year != null && !(Math.abs(Number(l.year) - p.year) <= 1)) return 0;
    if (p.issue != null) score += 200;
    return score;
  }
  // Not a title hit: every word has to land somewhere (seller, publisher,
  // variant, issue, year, or a piece of the title).
  const hay = [title, compact(l.publisher), compact(l.seller), compact(l.variant), baseIssue(l.issueNumber), String(l.year ?? "")];
  const all = p.words.every((w) => {
    const k = compact(w) || w;
    return hay.some((h) => h && (h === k || h.includes(k)));
  });
  return all ? 50 : 0;
}

function matchesQuery(l, q) {
  return queryScore(l, q) > 0;
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

export function sortListings(list, sort, q = "") {
  const a = list.slice();
  const val = (l) => shownValue(l);
  if (sort === "relevance" && q) {
    const scored = new Map(a.map((l) => [l, queryScore(l, q)]));
    a.sort((x, y) => scored.get(y) - scored.get(x) || x.title.localeCompare(y.title) || issueOrder(x, y));
  } else if (sort === "value-desc") a.sort((x, y) => (val(y) ?? -1) - (val(x) ?? -1));
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

// Listings of issues on the viewer's wantlist, not their own. wantIds is a
// Set of catalog issue ids (gcd_issue_id) from the viewer's wishlist rows.
// Priced listings first by seller-set price, then unpriced listings by newest.
export function wantlistMatches(listings, wantIds, ownSeller) {
  if (!wantIds || wantIds.size === 0) return [];
  return listings
    .filter((l) => wantIds.has(Number(l.gcdIssueId)) && l.seller !== ownSeller)
    .sort((a, b) => (shownValue(a) ?? Infinity) - (shownValue(b) ?? Infinity) || String(b.listedAt ?? "").localeCompare(String(a.listedAt ?? "")));
}
