import test from "node:test";
import assert from "node:assert/strict";
import {
  PUBLIC_PROFILE_PAGE_SIZE,
  buildStubbedProfilePayload,
  parsePublicProfileQuery,
  profileResponseAllowed,
  queryPublicProfileRows,
  summarizePublicProfileRows,
} from "./publicProfilePaging.js";

function stubRows(size = 10_000) {
  return Array.from({ length: size }, (_, index) => {
    const last = index === size - 1;
    const status = last ? "owned" : index % 11 === 0 ? "wishlist" : index % 17 === 0 ? "for_sale" : "owned";
    const year = last ? 1947 : 1980 + (index % 5) * 10;
    return {
      id: `copy-${String(index).padStart(5, "0")}`,
      status,
      condition: "NM",
      grade_numeric: index % 7 === 0 ? 9.8 : null,
      slab_company: index % 7 === 0 ? "CGC" : null,
      purchase_price: 1,
      market_value: status === "wishlist" ? null : 2,
      created_at: new Date(Date.UTC(2020, 0, 1, 0, 0, index)).toISOString(),
      gcd_issue_id: index + 1,
      variant_label: null,
      copy_number: 1,
      open_to_trade: index % 13 === 0,
      display: {
        title: last ? "ZZZ Needle on the last page" : `Series ${String(index % 200).padStart(3, "0")}`,
        issueNumber: String(index + 1),
        year,
        publisher: last ? "Last Page Press" : `Publisher ${index % 4}`,
        href: `/issue/gcd-${index + 1}`,
        canonicalCoverUrl: `https://example.test/${index}.jpg`,
      },
      key_issue: index % 997 === 0 ? { tier: 1, reason: "Key issue" } : null,
    };
  });
}

const defaultQuery = () => parsePublicProfileQuery(new URLSearchParams());
const LARGE_ROWS = stubRows();
const SMALL_ROWS = stubRows(200);

function legacySummary(rows) {
  let owned = 0;
  let wantlist = 0;
  let forSale = 0;
  let slabbed = 0;
  let value = 0;
  const series = new Set();
  const publishers = new Map();
  const decades = new Map();
  for (const row of rows) {
    if (row.status === "owned" || row.status === "for_sale") {
      owned += 1;
      value += Number(row.market_value) || 0;
    }
    if (row.status === "wishlist") wantlist += 1;
    if (row.status === "for_sale") forSale += 1;
    if (row.slab_company) slabbed += 1;
    const title = String(row.display.title).trim().toLowerCase();
    const publisher = String(row.display.publisher ?? "").trim();
    if (title) series.add(`${title}::${publisher.toLowerCase()}`);
    if (publisher) publishers.set(publisher, (publishers.get(publisher) ?? 0) + 1);
    const year = Number(row.display.year);
    if (Number.isFinite(year) && year > 0) {
      const decade = Math.floor(year / 10) * 10;
      decades.set(decade, (decades.get(decade) ?? 0) + 1);
    }
  }
  return {
    stats: { owned, wantlist, forSale, slabbed, value, uniqueSeries: series.size },
    facets: {
      publishers: [...publishers].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([facetValue, count]) => ({ value: facetValue, count })),
      decades: [...decades].sort((left, right) => right[0] - left[0]).map(([facetValue, count]) => ({ value: facetValue, count })),
    },
  };
}

function legacyIssue(value) {
  const raw = String(value ?? "").trim();
  const exact = Number(raw);
  if (raw && Number.isFinite(exact)) return exact;
  const match = raw.match(/^(-?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function legacyOwnedOrder(rows, sort) {
  const result = rows.filter((row) => row.status === "owned" || row.status === "for_sale");
  const title = (row) => String(row.display.title ?? "").toLowerCase();
  const issue = (row) => legacyIssue(row.display.issueNumber);
  const year = (row) => Number(row.display.year ?? 0);
  result.sort((left, right) => {
    const id = String(left.id).localeCompare(String(right.id));
    if (sort === "issue-desc") return title(left).localeCompare(title(right)) || issue(right) - issue(left) || id;
    if (sort === "title-desc") return title(right).localeCompare(title(left)) || issue(left) - issue(right) || id;
    if (sort === "year-asc") return year(left) - year(right) || title(left).localeCompare(title(right)) || issue(left) - issue(right) || id;
    if (sort === "year-desc") return year(right) - year(left) || title(left).localeCompare(title(right)) || issue(left) - issue(right) || id;
    if (sort === "added-desc") return String(right.created_at).localeCompare(String(left.created_at)) || id;
    if (sort === "added-asc") return String(left.created_at).localeCompare(String(right.created_at)) || id;
    return title(left).localeCompare(title(right)) || issue(left) - issue(right) || id;
  });
  return result;
}

test("10,000-book initial payload has whole-collection totals and only 60 books", () => {
  const rows = LARGE_ROWS;
  const payload = buildStubbedProfilePayload({
    profile: { id: "profile", username: "large" },
    visibility: { collection: true, wantlist: true, for_sale: true, value: true },
    rows,
    query: defaultQuery(),
  });
  const summary = summarizePublicProfileRows(rows);
  assert.deepEqual(payload.summary.stats, summary.stats);
  assert.deepEqual(payload.summary.facets, summary.facets);
  assert.equal(payload.collection.length, PUBLIC_PROFILE_PAGE_SIZE);
  assert.equal(payload.collection.some((row) => row.id === "copy-09999"), false);
  assert.ok(Buffer.byteLength(JSON.stringify(payload)) < 300 * 1024);
});

for (const sort of ["issue-asc", "issue-desc", "title-asc", "title-desc", "year-asc", "year-desc", "added-desc", "added-asc"]) {
  test(`pages concatenate without gaps or repeats for ${sort}`, () => {
    const rows = stubRows(1_237);
    const expected = queryPublicProfileRows(rows, { ...defaultQuery(), sort, offset: 0, limit: 10_000 }).items;
    const actual = [];
    for (let offset = 0; offset < expected.length; offset += PUBLIC_PROFILE_PAGE_SIZE) {
      actual.push(...queryPublicProfileRows(rows, { ...defaultQuery(), sort, offset }).items);
    }
    assert.deepEqual(actual.map((row) => row.id), expected.map((row) => row.id));
    assert.equal(new Set(actual.map((row) => row.id)).size, expected.length);
  });
}

test("search and whole-collection facets find the last book", () => {
  const rows = LARGE_ROWS;
  const search = queryPublicProfileRows(rows, { ...defaultQuery(), q: "Needle on the last page" });
  const publisher = queryPublicProfileRows(rows, { ...defaultQuery(), publisher: "Last Page Press" });
  const decade = queryPublicProfileRows(rows, { ...defaultQuery(), decade: 1940 });
  assert.deepEqual(search.items.map((row) => row.id), ["copy-09999"]);
  assert.deepEqual(publisher.items.map((row) => row.id), ["copy-09999"]);
  assert.deepEqual(decade.items.map((row) => row.id), ["copy-09999"]);
});

test("private profiles return no payload without an authorized viewer", () => {
  const allowed = profileResponseAllowed({ isPublic: false, ownerViewer: false, privateMemberViewer: false });
  assert.equal(allowed, false);
  assert.equal(buildStubbedProfilePayload({ rows: stubRows(10), query: defaultQuery(), allowed }), null);
  assert.equal(profileResponseAllowed({ isPublic: false, ownerViewer: true, privateMemberViewer: false }), true);
  assert.equal(profileResponseAllowed({ isPublic: false, ownerViewer: false, privateMemberViewer: true }), true);
});

test("old full-array assembly and paged assembly agree for 10,000 books", () => {
  const rows = LARGE_ROWS;
  const old = legacySummary(rows);
  const next = summarizePublicProfileRows(rows);
  assert.deepEqual(next.stats, old.stats);
  assert.deepEqual(next.facets, old.facets);
  for (const sort of ["issue-asc", "issue-desc", "title-asc", "title-desc", "year-asc", "year-desc", "added-desc", "added-asc"]) {
    const oldOrder = legacyOwnedOrder(rows, sort).map((row) => row.id);
    const pagedOrder = [];
    for (let offset = 0; offset < oldOrder.length; offset += PUBLIC_PROFILE_PAGE_SIZE) {
      pagedOrder.push(...queryPublicProfileRows(rows, { ...defaultQuery(), sort, offset }).items.map((row) => row.id));
    }
    assert.deepEqual(pagedOrder, oldOrder, sort);
  }
});

test("signed-out, owner and Tony assemblies preserve totals, plaque value and section data", () => {
  const old = legacySummary(LARGE_ROWS);
  const modes = [
    { isPublic: true, ownerViewer: false, privateMemberViewer: false },
    { isPublic: true, ownerViewer: true, privateMemberViewer: false },
    { isPublic: false, ownerViewer: false, privateMemberViewer: true },
  ];
  for (const mode of modes) {
    const payload = buildStubbedProfilePayload({
      rows: LARGE_ROWS,
      query: defaultQuery(),
      allowed: profileResponseAllowed(mode),
    });
    assert.deepEqual(payload.summary.stats, old.stats);
    assert.deepEqual(payload.summary.facets, old.facets);
    assert.equal(payload.summary.stats.value, old.stats.value);
    assert.deepEqual(Object.keys(payload.summary).slice(-3), ["topShelf", "recentlyAdded", "activity"]);
  }
});

for (const path of [
  { name: "paged", query: { ...defaultQuery(), offset: 60 } },
  { name: "search", query: { ...defaultQuery(), q: "Needle on the last page" } },
  { name: "facet", query: { ...defaultQuery(), publisher: "Last Page Press" } },
]) {
  for (const viewer of [
    { name: "signed out", ownerViewer: false, privateMemberViewer: false, expected: false },
    { name: "another member", ownerViewer: false, privateMemberViewer: false, expected: false },
    { name: "owner", ownerViewer: true, privateMemberViewer: false, expected: true },
  ]) {
    test(`private ${path.name} path is protected for ${viewer.name}`, () => {
      const allowed = profileResponseAllowed({ isPublic: false, ownerViewer: viewer.ownerViewer, privateMemberViewer: viewer.privateMemberViewer });
      const payload = buildStubbedProfilePayload({ rows: SMALL_ROWS, query: path.query, allowed });
      assert.equal(Boolean(payload), viewer.expected);
    });
  }
}

test("Tony's private-member access can use paged, search and facet queries", () => {
  const rows = LARGE_ROWS;
  const allowed = profileResponseAllowed({ isPublic: false, ownerViewer: false, privateMemberViewer: true });
  assert.equal(Boolean(buildStubbedProfilePayload({ rows, query: { ...defaultQuery(), offset: 60 }, allowed })), true);
  assert.equal(buildStubbedProfilePayload({ rows, query: { ...defaultQuery(), q: "Needle on the last page" }, allowed }).collection.length, 1);
  assert.equal(buildStubbedProfilePayload({ rows, query: { ...defaultQuery(), publisher: "Last Page Press" }, allowed }).collection.length, 1);
});
