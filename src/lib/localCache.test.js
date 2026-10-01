import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readLocal, writeLocal, clearLocalPrefix } from "./localCache.js";

function fakeStorage({ quota = Infinity } = {}) {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (String(v).length > quota) throw new Error("QuotaExceededError");
      m.set(k, String(v));
    },
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

beforeEach(() => {
  globalThis.window = { localStorage: fakeStorage() };
});

test("round-trips JSON under a versioned key", () => {
  assert.equal(writeLocal("library:u1", [{ id: 1 }]), true);
  assert.deepEqual(readLocal("library:u1"), [{ id: 1 }]);
  assert.ok([...window.localStorage._map.keys()][0].startsWith("cc:v1:"));
});

test("a miss, corrupt JSON or no window is just null", () => {
  assert.equal(readLocal("nope"), null);
  window.localStorage.setItem("cc:v1:bad", "{not json");
  assert.equal(readLocal("bad"), null);
  delete globalThis.window;
  assert.equal(readLocal("library:u1"), null);
  assert.equal(writeLocal("library:u1", []), false);
});

test("a write over quota fails quietly and drops the older copy", () => {
  globalThis.window = { localStorage: fakeStorage({ quota: 20 }) };
  assert.equal(writeLocal("k", "short"), true);
  assert.equal(writeLocal("k", "x".repeat(100)), false);
  assert.equal(readLocal("k"), null);
});

test("clearLocalPrefix removes only that prefix", () => {
  writeLocal("library:u1", [1]);
  writeLocal("hydrate:u1", {});
  writeLocal("other", 1);
  clearLocalPrefix("library:");
  assert.equal(readLocal("library:u1"), null);
  assert.deepEqual(readLocal("hydrate:u1"), {});
  assert.equal(readLocal("other"), 1);
});
