// Each case is an error shape that actually reached production this week and
// was reported as something else.
//
// Run: npm run test:describe-error

import test from "node:test";
import assert from "node:assert/strict";

import { describeError, describeExit, unwrap } from "./describeError.js";

test("a PostgREST error keeps every field it arrived with", () => {
  // The stall check printed this as "unknown error" for the whole outage,
  // because `error.message || error.code` took message and dropped the code.
  const real = {
    code: "PGRST002",
    message: "Could not query the database for the schema cache. Retrying.",
    details: null,
    hint: null,
  };
  const text = describeError(real);
  assert.match(text, /PGRST002/);
  assert.match(text, /schema cache/);
});

test("details and hint survive, because that is where the fix usually is", () => {
  const text = describeError({
    code: "42703",
    message: "column series.nope does not exist",
    details: "some detail",
    hint: "Perhaps you meant series.note",
  });
  assert.match(text, /42703/);
  assert.match(text, /details: some detail/);
  assert.match(text, /hint: Perhaps you meant series\.note/);
});

test("a statement timeout reads as a statement timeout", () => {
  const text = describeError({ code: "57014", message: "canceling statement due to statement timeout" });
  assert.equal(text, "57014 | canceling statement due to statement timeout");
});

test("an error with no recognisable fields is printed, never called unknown", () => {
  const text = describeError({ weird: true, n: 3 });
  assert.match(text, /weird/);
  assert.doesNotMatch(text, /unknown error/);
});

test("a real Error keeps its stack", () => {
  const text = describeError(new Error("boom"));
  assert.match(text, /boom/);
});

test("null says the caller reported a failure without one", () => {
  // Silently returning "unknown error" here is how a bug in the caller gets
  // blamed on the database.
  assert.match(describeError(null), /without one/);
});

test("a killed child is described as killed, not as bad output", () => {
  // The mislink check reported this as "could not parse output".
  const text = describeExit({ status: null, signal: "SIGKILL" });
  assert.match(text, /signal SIGKILL/);
  assert.match(text, /killed from outside/);
});

test("a plain non-zero exit reports its code without the kill guess", () => {
  const text = describeExit({ status: 3, signal: null });
  assert.match(text, /exit code 3/);
  assert.doesNotMatch(text, /killed from outside/);
});

test("a child that never started says so", () => {
  const text = describeExit({ error: new Error("spawn ENOENT") });
  assert.match(text, /failed to start/);
  assert.match(text, /ENOENT/);
});

test("unwrap throws with context instead of returning null data", () => {
  // The whole point: a failed query must not be mistakable for no rows.
  assert.throws(
    () => unwrap({ data: null, error: { code: "57014", message: "timeout" } }, "series walk"),
    /series walk: 57014 \| timeout/
  );
});

test("unwrap passes clean data through untouched", () => {
  const rows = [{ id: 1 }];
  assert.equal(unwrap({ data: rows, error: null }, "series walk"), rows);
});

test("unwrap does not confuse an empty result with a failure", () => {
  assert.deepEqual(unwrap({ data: [], error: null }, "series walk"), []);
});
