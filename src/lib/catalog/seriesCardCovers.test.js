import assert from "node:assert/strict";
import test from "node:test";
import { resolveSeriesCardCovers } from "./seriesCardCovers.js";

function fakeSupabase(stored, { claimError = null } = {}) {
  const calls = [];
  return {
    calls,
    rpc(name, params) {
      calls.push([name, params]);
      if (name === "claim_series_card_covers") {
        if (claimError) return Promise.resolve({ data: null, error: claimError });
        return Promise.resolve({ data: stored.filter((row) => params.p_ids.includes(row.id)), error: null });
      }
      return Promise.resolve({ data: params.p_picks.length, error: null });
    },
  };
}

const entry = (id, extra) => ({
  id, gcd_id: Number(id.slice(1)), title: `T${id}`, year_start_cached: 1990, year_end_cached: 1995,
  resolved_publisher_cached: "Marvel", card_cover_path: null, card_cover_checked: false, card_cover_version: 0, ...extra,
});

test("stored picks are used, misses resolved from the database row and saved with their version", async () => {
  const supabase = fakeSupabase([
    entry("s1", { card_cover_path: "a.jpg", card_cover_checked: true }),
    entry("s2", { card_cover_checked: true }),
    entry("s3", { card_cover_version: 4, title: "From DB" }),
  ]);
  const resolvedWith = [];
  const covers = await resolveSeriesCardCovers(supabase, [
    { id: "s1", gcd_id: 1 }, { id: "s2", gcd_id: 2 }, { id: "s3", gcd_id: 3, title: "Stale" }, { id: "s4", gcd_id: null },
  ], {
    resolve: async (_db, rows) => {
      resolvedWith.push(...rows);
      return new Map([["s3", { storage_path: "c.jpg" }]]);
    },
  });
  assert.equal(covers.get("s1").storage_path, "a.jpg");
  assert.equal(covers.has("s2"), false, "checked with no path means no cover");
  assert.equal(covers.get("s3").storage_path, "c.jpg");
  assert.deepEqual(resolvedWith.map((row) => [row.id, row.title]), [["s3", "From DB"]]);
  const save = supabase.calls.find(([name]) => name === "save_series_card_covers");
  assert.deepEqual(save[1].p_picks, [{ id: "s3", version: 4, path: "c.jpg" }]);
});

test("a series with no cover is saved as a null path", async () => {
  const supabase = fakeSupabase([entry("s1")]);
  const covers = await resolveSeriesCardCovers(supabase, [{ id: "s1", gcd_id: 1 }], { resolve: async () => new Map() });
  assert.equal(covers.size, 0);
  const save = supabase.calls.find(([name]) => name === "save_series_card_covers");
  assert.deepEqual(save[1].p_picks, [{ id: "s1", version: 0, path: null }]);
});

test("all hits make no resolver call and no save", async () => {
  const supabase = fakeSupabase([entry("s1", { card_cover_path: "a.jpg", card_cover_checked: true })]);
  const covers = await resolveSeriesCardCovers(supabase, [{ id: "s1", gcd_id: 1 }], {
    resolve: async () => { throw new Error("should not resolve"); },
  });
  assert.equal(covers.get("s1").storage_path, "a.jpg");
  assert.deepEqual(supabase.calls.map(([name]) => name), ["claim_series_card_covers"]);
});

test("missing RPC (migration not applied) falls back to resolving every series as given", async () => {
  const supabase = fakeSupabase([], { claimError: { code: "PGRST202", message: "not found" } });
  const rows = [{ id: "s1", gcd_id: 1, title: "Caller" }];
  const original = console.error;
  console.error = () => {};
  try {
    const covers = await resolveSeriesCardCovers(supabase, rows, {
      resolve: async (_db, given) => new Map(given.map((row) => [row.id, { storage_path: `${row.title}.jpg` }])),
    });
    assert.equal(covers.get("s1").storage_path, "Caller.jpg");
  } finally {
    console.error = original;
  }
  assert.equal(supabase.calls.some(([name]) => name === "save_series_card_covers"), false);
});
