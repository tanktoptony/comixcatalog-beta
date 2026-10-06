import assert from "node:assert/strict";
import test from "node:test";
import { fetchAllByKeyset } from "./fetchAllPages.js";

function fakeBuilder(pages, calls, errorAt = -1) {
  let page = 0;
  return () => {
    const current = page++;
    const call = [];
    calls.push(call);
    const query = {
      order(column, options) {
        call.push(["order", column, options]);
        return this;
      },
      limit(count) {
        call.push(["limit", count]);
        return this;
      },
      gt(column, value) {
        call.push(["gt", column, value]);
        return this;
      },
      then(resolve) {
        return Promise.resolve(current === errorAt
          ? { data: null, error: new Error("query failed") }
          : { data: pages[current] ?? [], error: null }).then(resolve);
      },
    };
    return query;
  };
}

test("fetchAllByKeyset chains pages from the last unique key and returns every row", async () => {
  const pages = [
    Array.from({ length: 1000 }, (_, index) => ({ key: index + 1 })),
    Array.from({ length: 1000 }, (_, index) => ({ key: index + 1001 })),
    [{ key: 2001 }, { key: 2002 }],
  ];
  const calls = [];

  const rows = await fetchAllByKeyset(fakeBuilder(pages, calls), "key");

  assert.deepEqual(rows, pages.flat());
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0], [
    ["order", "key", { ascending: true }],
    ["limit", 1000],
  ]);
  assert.deepEqual(calls[1].at(-1), ["gt", "key", 1000]);
  assert.deepEqual(calls[2].at(-1), ["gt", "key", 2000]);
});

test("fetchAllByKeyset stops after a short first page", async () => {
  const calls = [];
  const rows = await fetchAllByKeyset(fakeBuilder([[{ id: 1 }]], calls));

  assert.deepEqual(rows, [{ id: 1 }]);
  assert.equal(calls.length, 1);
});

test("fetchAllByKeyset throws query errors", async () => {
  const expected = new Error("query failed");
  const build = () => ({
    order() { return this; },
    limit() { return this; },
    then(resolve) { return Promise.resolve({ data: null, error: expected }).then(resolve); },
  });

  await assert.rejects(fetchAllByKeyset(build), expected);
});
