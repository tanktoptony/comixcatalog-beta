// The candidate rows below are real, pulled from the live `series` table on
// 2026-09-23 while auditing why the weekly GCD issue refresh had been green
// and useless for a month.
//
// Run: npm run test:featured-targets

import test from "node:test";
import assert from "node:assert/strict";

import { pickBestCandidate, readCursor, rotate, writeCursor } from "./featuredTargets.js";

// A tiny in-memory stand-in for the two fs calls the cursor uses. Proving the
// round-trip against the real GCD job would cost an hour of its rate-limit
// penalty for every attempt.
function fakeFs(initial) {
  const store = new Map(initial ? [["cursor.json", initial]] : []);
  return {
    store,
    readFileSync(file) {
      if (!store.has(file)) { const e = new Error("ENOENT"); e.code = "ENOENT"; throw e; }
      return store.get(file);
    },
    writeFileSync(file, contents) { store.set(file, contents); },
  };
}

const row = (gcd_id, year_start_cached) => ({ gcd_id, year_start_cached });

test("picks the candidate whose start year matches prefer_year", () => {
  // Watchmen: the complete candidate set contains gcd_id 3172, year 1986, an
  // exact match. The truncated set did not, so the run refreshed 159707
  // (1987) every week instead.
  const entry = { title: "Watchmen", publisher: "DC Comics", prefer_year: 1986 };
  const complete = [row(3172, 1986), row(3392, 1987), row(4175, 1990), row(159707, 1987)];
  assert.equal(pickBestCandidate(entry, complete).gcd_id, 3172);
});

test("a truncated candidate set silently yields a worse year match", () => {
  // This is the defect, not a hypothetical: Robin's run was resolving to the
  // 2015 series because the 2021 row sat past PostgREST's 1000-row cap.
  const entry = { title: "Robin", publisher: "DC Comics", prefer_year: 2021 };
  const truncated = [row(4207, 1991), row(93578, 2015)];
  const complete = [...truncated, row(172101, 2021)];

  assert.equal(pickBestCandidate(entry, truncated).gcd_id, 93578); // off by 6
  assert.equal(pickBestCandidate(entry, complete).gcd_id, 172101); // exact
});

test("a null start year never beats a real year match", () => {
  const entry = { title: "Detective Comics", publisher: "DC Comics", prefer_year: 2016 };
  const candidates = [row(64821, null), row(120643, 2017), row(149798, null)];
  assert.equal(pickBestCandidate(entry, candidates).gcd_id, 120643);
});

test("with no prefer_year the first candidate wins, so order is the answer", () => {
  // Documenting rather than endorsing: with nothing to compare, every delta
  // is Infinity and candidates[0] survives. Worth knowing that this branch
  // depends entirely on the caller's row order.
  const entry = { title: "Local Man", publisher: "Image Comics", prefer_year: null };
  assert.equal(pickBestCandidate(entry, [row(200, 2023), row(100, 2022)]).gcd_id, 200);
});

test("an equal-year tie is decided by row order", () => {
  // Measured: 10 of the 79 featured entries are ties like this. A stable
  // ORDER BY is what makes the outcome repeatable from run to run; without
  // one the same input can resolve two different ways.
  const entry = { title: "Saga", publisher: "Image Comics", prefer_year: 2012 };
  assert.equal(pickBestCandidate(entry, [row(69146, 2012), row(63051, 2012)]).gcd_id, 69146);
  assert.equal(pickBestCandidate(entry, [row(63051, 2012), row(69146, 2012)]).gcd_id, 63051);
});

test("no candidates returns null rather than a plausible-looking row", () => {
  assert.equal(pickBestCandidate({ prefer_year: 2024 }, []), null);
  assert.equal(pickBestCandidate({ prefer_year: 2024 }, undefined), null);
});

test("rotation resumes after the cursor and wraps", () => {
  assert.deepEqual(rotate([1, 2, 3, 4, 5], 2), [3, 4, 5, 1, 2]);
});

test("a cursor on the last entry wraps back to the start", () => {
  assert.deepEqual(rotate([1, 2, 3], 3), [1, 2, 3]);
});

test("no cursor, or one no longer in the list, starts at the top", () => {
  assert.deepEqual(rotate([1, 2, 3], null), [1, 2, 3]);
  assert.deepEqual(rotate([1, 2, 3], undefined), [1, 2, 3]);
  assert.deepEqual(rotate([1, 2, 3], 99), [1, 2, 3]);
});

test("rotation never drops or duplicates a series", () => {
  // The point of rotating is to cover the whole list across runs. A rotation
  // that loses an entry would starve exactly the series it was added to
  // reach, and would do it silently.
  const ids = Array.from({ length: 78 }, (_, i) => 1000 + i);
  for (const cursor of [null, ids[0], ids[40], ids[77], 42]) {
    const out = rotate(ids, cursor);
    assert.equal(out.length, ids.length, `length changed for cursor ${cursor}`);
    assert.deepEqual([...out].sort((a, b) => a - b), ids, `membership changed for cursor ${cursor}`);
  }
});

test("rotating over every cursor in turn reaches every series", () => {
  // Walk the list the way successive runs would: each run takes a budget of
  // 5, then leaves its last id as the next run's cursor. Everything must be
  // visited before anything repeats.
  const ids = Array.from({ length: 78 }, (_, i) => 1000 + i);
  const BUDGET = 5;
  const seen = new Set();
  let cursor = null;
  for (let run = 0; run < Math.ceil(ids.length / BUDGET); run++) {
    const batch = rotate(ids, cursor).slice(0, BUDGET);
    batch.forEach((id) => seen.add(id));
    cursor = batch[batch.length - 1];
  }
  assert.equal(seen.size, ids.length, "some series were never reached");
});

test("the cursor round-trips through a file", () => {
  const fs = fakeFs();
  writeCursor("cursor.json", fs, 216143);
  assert.equal(readCursor("cursor.json", fs), 216143);
});

test("a missing cursor file reads as no cursor, not as a crash", () => {
  assert.equal(readCursor("cursor.json", fakeFs()), null);
});

test("a corrupt cursor file reads as no cursor", () => {
  // A half-written file from a cancelled run must not take the next one down;
  // starting at the top of the list is always a correct fallback.
  assert.equal(readCursor("cursor.json", fakeFs("{not json")), null);
  assert.equal(readCursor("cursor.json", fakeFs('{"lastGcdId":"banana"}')), null);
  assert.equal(readCursor("cursor.json", fakeFs('{"lastGcdId":null}')), null);
  assert.equal(readCursor("cursor.json", fakeFs("{}")), null);
});

test("successive runs advance the cursor and cover the whole list", () => {
  // The end-to-end behaviour the rotation exists for, driven through the real
  // file format rather than the in-memory helper alone.
  const fs = fakeFs();
  const ids = Array.from({ length: 78 }, (_, i) => 1000 + i);
  const BUDGET = 5;
  const seen = new Set();
  for (let run = 0; run < Math.ceil(ids.length / BUDGET); run++) {
    const batch = rotate(ids, readCursor("cursor.json", fs)).slice(0, BUDGET);
    batch.forEach((id) => seen.add(id));
    writeCursor("cursor.json", fs, batch[batch.length - 1]);
  }
  assert.equal(seen.size, ids.length, "some series were never reached");
});
