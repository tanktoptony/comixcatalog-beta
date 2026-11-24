import { test } from "node:test";
import assert from "node:assert/strict";
import { creatorSlugRange, seriesGcdIdsWithKeyPages } from "./sitemapCore.js";

// A stand-in for the Supabase client that behaves like PostgREST where it
// matters here: embeds across tables with no foreign key fail, and reads stop
// at their limit.
function fakeClient({ keyIds, seriesByIssue }) {
  const calls = [];
  const from = (table) => {
    const state = { table, filters: {} };
    const builder = {
      select(columns) {
        state.columns = columns;
        return builder;
      },
      order() {
        return builder;
      },
      limit(value) {
        state.limit = value;
        return builder;
      },
      gt(column, value) {
        state.filters.gt = value;
        return builder;
      },
      in(column, values) {
        state.filters.in = values;
        return builder;
      },
      then(resolve) {
        calls.push(state);
        if (String(state.columns).includes("!inner")) {
          return resolve({ data: null, error: { code: "PGRST200", message: "no relationship" } });
        }
        if (table === "key_issues") {
          const rows = keyIds.filter((id) => state.filters.gt == null || id > state.filters.gt).slice(0, state.limit);
          return resolve({ data: rows.map((gcd_issue_id) => ({ gcd_issue_id })), error: null });
        }
        const rows = state.filters.in.slice(0, state.limit).map((id) => ({ series_gcd_id: seriesByIssue.get(id) }));
        return resolve({ data: rows, error: null });
      },
    };
    return builder;
  };
  return { client: { from }, calls };
}

test("returns only series with at least three key issues", async () => {
  const { client } = fakeClient({
    keyIds: [1, 2, 3, 4, 5],
    seriesByIssue: new Map([[1, 10], [2, 10], [3, 10], [4, 20], [5, 20]]),
  });
  assert.deepEqual(await seriesGcdIdsWithKeyPages(client), [10]);
});

test("counts across pages, past the 500-row page and the 1000-row PostgREST cap", async () => {
  const keyIds = Array.from({ length: 1205 }, (_, index) => index + 1);
  const seriesByIssue = new Map(keyIds.map((id) => [id, id <= 1203 ? 7 : 8]));
  const { client, calls } = fakeClient({ keyIds, seriesByIssue });
  assert.deepEqual(await seriesGcdIdsWithKeyPages(client), [7]);
  assert.equal(calls.filter((call) => call.table === "key_issues").length, 3);
  assert.ok(calls.every((call) => call.limit <= 500));
});

test("never asks PostgREST for an embed key_issues has no foreign key for", async () => {
  const { client, calls } = fakeClient({ keyIds: [1], seriesByIssue: new Map([[1, 10]]) });
  await seriesGcdIdsWithKeyPages(client);
  assert.ok(calls.every((call) => !String(call.columns).includes("!")));
});

test("stores nothing for a key issue whose row has no series", async () => {
  const { client } = fakeClient({ keyIds: [1, 2, 3], seriesByIssue: new Map([[1, null], [2, null], [3, null]]) });
  assert.deepEqual(await seriesGcdIdsWithKeyPages(client), []);
});

test("treats an RLS-empty gcd_issues read as a failure, not as no key pages", async () => {
  const { client } = fakeClient({ keyIds: [1, 2, 3], seriesByIssue: new Map() });
  const rlsClient = {
    from(table) {
      const builder = client.from(table);
      if (table !== "gcd_issues") return builder;
      return { select: () => ({ in: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
    },
  };
  await assert.rejects(seriesGcdIdsWithKeyPages(rlsClient), /no rows/);
});

test("surfaces a read error instead of reporting no key pages", async () => {
  const client = {
    from: () => ({
      select() { return this; },
      order() { return this; },
      limit() { return this; },
      then(resolve) { return resolve({ data: null, error: new Error("down") }); },
    }),
  };
  await assert.rejects(seriesGcdIdsWithKeyPages(client), /down/);
});

// Compare the way the database does: en_US sorts punctuation before digits
// and digits before letters. Intl.Collator is the same ordering rule.
const collator = new Intl.Collator("en-US");
const inRange = (slug, { lower, upper }) =>
  collator.compare(slug, lower) >= 0 && (upper == null || collator.compare(slug, upper) < 0);

test("creator ranges cover digit and z slugs under en_US collation", () => {
  assert.ok(inRange("zeb-wells", creatorSlugRange("z")));
  assert.ok(inRange("2000-ad-staff", creatorSlugRange("0-9")));
  assert.ok(inRange("jack-kirby", creatorSlugRange("j")));
});

test("each creator slug lands in exactly one range", () => {
  const parts = ["0-9", ..."abcdefghijklmnopqrstuvwxyz"];
  for (const slug of ["0-kid", "9-lives", "a", "a-b", "azzarello", "brian-azzarello", "y-z", "yanick-paquette", "z", "zeb-wells", "zzz"]) {
    const matches = parts.filter((part) => inRange(slug, creatorSlugRange(part)));
    assert.deepEqual(matches, [/^[0-9]/.test(slug) ? "0-9" : slug[0]], slug);
  }
});

test("the old upper bounds really do match nothing under this collation", () => {
  assert.ok(collator.compare(":", "0") < 0);
  assert.ok(collator.compare("{", "z") < 0);
});
