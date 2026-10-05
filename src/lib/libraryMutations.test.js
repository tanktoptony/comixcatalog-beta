import test from "node:test";
import assert from "node:assert/strict";
import {
  countCopies,
  nextCopyNumber,
  planAdd,
  planRemove,
  withKeyLock,
} from "./libraryMutations.js";

const empty = { inserts: [], updates: [], deletes: [] };

test("removes exactly one of three copies by row id", () => {
  const rows = ["a", "b", "c"].map((id) => ({ id, status: "owned" }));
  const plan = planRemove(rows, { scope: "copy", rowId: "b" });
  assert.deepEqual(plan.deletes, ["b"]);
  assert.deepEqual(rows.filter((row) => !plan.deletes.includes(row.id)).map((row) => row.id), ["a", "c"]);
});

test("wishlist removal leaves both copies", () => {
  const rows = [
    { id: "a", status: "owned" },
    { id: "b", status: "for_sale" },
    { id: "w", status: "wishlist" },
  ];
  assert.deepEqual(planRemove(rows, { scope: "wishlist" }).deletes, ["w"]);
  assert.equal(countCopies(rows), 2);
});

test("adding wishlist while owning inserts a separate want", () => {
  assert.deepEqual(planAdd([{ id: "a", status: "owned" }], { status: "wishlist" }), {
    inserts: [{ status: "wishlist" }], updates: [], deletes: [],
  });
});

test("adding owned with two copies is a no-op", () => {
  assert.deepEqual(planAdd([{ status: "owned" }, { status: "for_sale" }], { status: "owned" }), empty);
});

test("adding owned upgrades a lone wishlist", () => {
  assert.deepEqual(planAdd([{ id: "w", status: "wishlist" }], { status: "owned" }), {
    inserts: [], updates: [{ id: "w", patch: { status: "owned" } }], deletes: [],
  });
});

test("adding owned removes a coexisting wishlist", () => {
  assert.deepEqual(planAdd([{ id: "a", status: "owned" }, { id: "w", status: "wishlist" }], { status: "owned" }).deletes, ["w"]);
});

test("latest-copy chooses newest owned and only falls back to for-sale", () => {
  const rows = [
    { id: "old", status: "owned", created_at: "2026-01-01" },
    { id: "new", status: "owned", created_at: "2026-02-01" },
    { id: "sale", status: "for_sale", created_at: "2026-03-01" },
  ];
  assert.deepEqual(planRemove(rows, { scope: "latest-copy" }).deletes, ["new"]);
  assert.deepEqual(planRemove([rows[2]], { scope: "latest-copy" }).deletes, ["sale"]);
});

test("latest-copy breaks timestamp ties by higher id", () => {
  const rows = [
    { id: "a", status: "owned", created_at: "2026-01-01" },
    { id: "b", status: "owned", created_at: "2026-01-01" },
  ];
  assert.deepEqual(planRemove(rows, { scope: "latest-copy" }).deletes, ["b"]);
});

test("withKeyLock refuses re-entry and releases after completion", async () => {
  let release;
  const pending = withKeyLock("gcd-1", () => new Promise((resolve) => { release = resolve; }));
  let called = false;
  assert.deepEqual(await withKeyLock("gcd-1", () => { called = true; }), { ok: false, error: "busy" });
  assert.equal(called, false);
  release({ ok: true });
  await pending;
  assert.equal((await withKeyLock("gcd-1", async () => ({ ok: true }))).ok, true);
});

test("nextCopyNumber is per variant and treats missing numbers as one", () => {
  const rows = [
    { copy_number: null, variant_label: null },
    { copy_number: 3, variant_label: null },
    { copy_number: 8, variant_label: "Foil" },
  ];
  assert.equal(nextCopyNumber(rows, null), 4);
  assert.equal(nextCopyNumber(rows, "Foil"), 9);
  assert.equal(nextCopyNumber(rows, "Newsstand"), 1);
});
