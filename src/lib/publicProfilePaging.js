import { isOwnedStatus } from "./collectionStatus.js";

export const PUBLIC_PROFILE_PAGE_SIZE = 60;

export const PUBLIC_PROFILE_SORTS = new Set([
  "issue-asc",
  "issue-desc",
  "title-asc",
  "title-desc",
  "year-asc",
  "year-desc",
  "added-desc",
  "added-asc",
]);

const PROFILE_TABS = new Set(["owned", "wishlist", "for_sale"]);

const text = (value) => String(value ?? "").trim();
const folded = (value) => text(value).toLocaleLowerCase("en-US");

export function issueSortValue(issueNumber) {
  const raw = text(issueNumber);
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const exact = Number(raw);
  if (Number.isFinite(exact)) return exact;
  const match = raw.match(/^(-?\d+(?:\.\d+)?)/);
  const parsed = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function parsePublicProfileQuery(searchParams, defaultTab = "owned") {
  const requestedTab = searchParams.get("tab");
  const requestedSort = searchParams.get("sort");
  const rawLimit = Number(searchParams.get("limit"));
  const rawOffset = Number(searchParams.get("offset"));
  return {
    tab: PROFILE_TABS.has(requestedTab) ? requestedTab : defaultTab,
    sort: PUBLIC_PROFILE_SORTS.has(requestedSort) ? requestedSort : "title-asc",
    q: text(searchParams.get("q")).slice(0, 120),
    publisher: text(searchParams.get("publisher")).slice(0, 160),
    decade: /^\d{4}$/.test(text(searchParams.get("decade")))
      ? Number(searchParams.get("decade"))
      : null,
    tradeOnly: searchParams.get("trade") === "1",
    offset: Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0,
    limit: Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, PUBLIC_PROFILE_PAGE_SIZE)
      : PUBLIC_PROFILE_PAGE_SIZE,
  };
}

function belongsToTab(item, tab) {
  if (tab === "wishlist") return item.status === "wishlist";
  if (tab === "for_sale") return item.status === "for_sale";
  return isOwnedStatus(item.status);
}

function compareIds(left, right) {
  return String(left.id).localeCompare(String(right.id));
}

function compareTitleIssue(left, right, direction = 1, issueDirection = 1) {
  const title = folded(left.display?.title).localeCompare(folded(right.display?.title)) * direction;
  if (title) return title;
  const issue = (issueSortValue(left.display?.issueNumber) - issueSortValue(right.display?.issueNumber)) * issueDirection;
  return issue || compareIds(left, right);
}

export function sortPublicProfileRows(rows, sort) {
  const ordered = [...rows];
  ordered.sort((left, right) => {
    switch (sort) {
      case "issue-desc":
        return compareTitleIssue(left, right, 1, -1);
      case "title-desc":
        return compareTitleIssue(left, right, -1, 1);
      case "year-asc": {
        const delta = Number(left.display?.year ?? 0) - Number(right.display?.year ?? 0);
        return delta || compareTitleIssue(left, right);
      }
      case "year-desc": {
        const delta = Number(right.display?.year ?? 0) - Number(left.display?.year ?? 0);
        return delta || compareTitleIssue(left, right);
      }
      case "added-desc": {
        const delta = String(right.created_at ?? "").localeCompare(String(left.created_at ?? ""));
        return delta || compareIds(left, right);
      }
      case "added-asc": {
        const delta = String(left.created_at ?? "").localeCompare(String(right.created_at ?? ""));
        return delta || compareIds(left, right);
      }
      case "issue-asc":
      case "title-asc":
      default:
        return compareTitleIssue(left, right);
    }
  });
  return ordered;
}

export function queryPublicProfileRows(rows, query) {
  const needle = folded(query.q);
  const publisher = folded(query.publisher);
  const filtered = rows.filter((item) => {
    if (!belongsToTab(item, query.tab)) return false;
    if (query.tradeOnly && !item.open_to_trade) return false;
    if (publisher && folded(item.display?.publisher) !== publisher) return false;
    if (query.decade != null) {
      const year = Number(item.display?.year);
      if (!Number.isFinite(year) || Math.floor(year / 10) * 10 !== query.decade) return false;
    }
    if (needle) {
      const haystack = [
        item.display?.title,
        item.display?.issueNumber,
        item.display?.year,
        item.display?.publisher,
        item.variant_label,
      ].map(folded).join(" ");
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
  const ordered = sortPublicProfileRows(filtered, query.sort);
  const items = ordered.slice(query.offset, query.offset + query.limit);
  return {
    items,
    page: {
      ...query,
      total: ordered.length,
      hasMore: query.offset + items.length < ordered.length,
    },
  };
}

function numericValue(item) {
  const value = Number(item.market_value);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function topShelfScore(item) {
  if (item.key_issue) return (Number(item.key_issue.tier) === 1 ? 2_000_000 : 1_000_000) + numericValue(item);
  return numericValue(item);
}

export function selectPublicProfileHighlights(rows) {
  const owned = rows.filter((item) => isOwnedStatus(item.status));
  const topShelf = owned
    .filter((item) => item.display && (item.key_issue || numericValue(item) > 0))
    .sort((left, right) => topShelfScore(right) - topShelfScore(left)
      || String(right.created_at ?? "").localeCompare(String(left.created_at ?? ""))
      || compareIds(left, right))
    .slice(0, 5);
  const newest = (items, limit) => [...items]
    .sort((left, right) => String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")) || compareIds(left, right))
    .slice(0, limit);
  return {
    topShelf,
    recentlyAdded: newest(owned.filter((item) => item.display), 10),
    activity: newest(rows.filter((item) => item.display), 20),
  };
}

export function summarizePublicProfileRows(rows) {
  let owned = 0;
  let wantlist = 0;
  let forSale = 0;
  let slabbed = 0;
  let value = 0;
  let tradeCount = 0;
  let costBasis = 0;
  let hasCostData = false;
  let keyCount = 0;
  const seriesKeys = new Set();
  const ownedSeriesKeys = new Set();
  const publisherCounts = new Map();
  const decadeCounts = new Map();

  for (const item of rows) {
    const isOwned = isOwnedStatus(item.status);
    if (isOwned) owned += 1;
    if (item.status === "wishlist") wantlist += 1;
    if (item.status === "for_sale") forSale += 1;
    if (item.slab_company) slabbed += 1;
    if (item.open_to_trade && isOwned) tradeCount += 1;
    if (item.key_issue && isOwned) keyCount += 1;
    if (isOwned) {
      value += numericValue(item);
      const purchase = Number(item.purchase_price);
      if (Number.isFinite(purchase) && purchase > 0) {
        costBasis += purchase;
        hasCostData = true;
      }
    }

    const title = folded(item.display?.title);
    const publisher = text(item.display?.publisher);
    if (title) {
      const seriesKey = `${title}::${folded(publisher)}`;
      seriesKeys.add(seriesKey);
      if (isOwned) ownedSeriesKeys.add(seriesKey);
    }
    if (publisher) publisherCounts.set(publisher, (publisherCounts.get(publisher) ?? 0) + 1);
    const year = Number(item.display?.year);
    if (Number.isFinite(year) && year > 0) {
      const decade = Math.floor(year / 10) * 10;
      decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1);
    }
  }

  const publishers = [...publisherCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([value, count]) => ({ value, count }));
  const decades = [...decadeCounts.entries()]
    .sort((left, right) => right[0] - left[0])
    .map(([value, count]) => ({ value, count }));
  const dominantDecade = [...decadeCounts.entries()]
    .sort((left, right) => right[1] - left[1] || right[0] - left[0])[0]?.[0] ?? null;
  const uniqueSeries = seriesKeys.size;

  return {
    counts: { owned, wishlist: wantlist, for_sale: forSale, activity: rows.length },
    stats: { owned, wantlist, forSale, slabbed, value, uniqueSeries },
    facets: { publishers, decades },
    tradeCount,
    keyCount,
    ownedSeries: ownedSeriesKeys.size,
    dominantPublisher: publishers[0]?.value ?? null,
    insights: {
      dominantDecade,
      slabRatio: owned > 0 ? Math.round((slabbed / owned) * 100) : 0,
      uniqueSeries,
      topPublishers: publishers.slice(0, 5).map(({ value: name, count }) => [name, count]),
      costBasis,
      hasCostData,
    },
  };
}

export function profileResponseAllowed({ isPublic, ownerViewer, privateMemberViewer }) {
  return Boolean(isPublic || ownerViewer || privateMemberViewer);
}

export function buildStubbedProfilePayload({ profile, visibility, rows, query, allowed = true }) {
  if (!allowed) return null;
  const result = queryPublicProfileRows(rows, query);
  const highlights = selectPublicProfileHighlights(rows);
  return {
    profile,
    visibility,
    collection: result.items,
    summary: {
      ...summarizePublicProfileRows(rows),
      topShelf: highlights.topShelf,
      recentlyAdded: highlights.recentlyAdded,
      activity: highlights.activity,
    },
    page: result.page,
    degraded: false,
  };
}
