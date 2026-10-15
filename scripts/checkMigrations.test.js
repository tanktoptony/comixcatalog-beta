import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  checkMigrationContent,
  findDuplicateMigrationErrors,
} from "./checkMigrations.js";

const fixtures = path.join(import.meta.dirname, "fixtures", "migrations");
const fixture = (name) => readFileSync(path.join(fixtures, name), "utf8");

test("duplicate migration ids fail", () => {
  const errors = findDuplicateMigrationErrors(["0099_first.sql", "0099_second.sql"]);
  assert.equal(errors.length, 1);
});

test("different ids and every historical duplicate id pass", () => {
  const errors = findDuplicateMigrationErrors([
    "0098_first.sql",
    "0099_second.sql",
    "0037_a.sql", "0037_b.sql",
    "0067_a.sql", "0067_b.sql",
    "0068_a.sql", "0068_b.sql",
  ]);
  assert.deepEqual(errors, []);
});

test("the current migration record has no unallowlisted duplicate ids", () => {
  const currentMigrations = readdirSync(path.join(import.meta.dirname, "migrations"))
    .filter((name) => name.endsWith(".sql"));
  assert.deepEqual(findDuplicateMigrationErrors(currentMigrations), []);
});

test("concurrent index fixture passes and blocking index fixture fails", () => {
  assert.deepEqual(checkMigrationContent("pass.sql", fixture("pass_concurrent_index.sql")), []);
  assert.match(checkMigrationContent("fail.sql", fixture("fail_blocking_index.sql")).join("\n"), /CONCURRENTLY/);
});

test("column type change on a small table passes and on a large table fails", () => {
  assert.deepEqual(checkMigrationContent("pass.sql", fixture("pass_small_table_type.sql")), []);
  assert.match(checkMigrationContent("fail.sql", fixture("fail_large_table_type.sql")).join("\n"), /ALTER COLUMN TYPE/);
});

test("Rollback block is required", () => {
  assert.deepEqual(checkMigrationContent("pass.sql", fixture("pass_rollback.sql")), []);
  assert.match(checkMigrationContent("fail.sql", fixture("fail_no_rollback.sql")).join("\n"), /Rollback/);
});

test("allow override with a reason permits both large-table hazards", () => {
  assert.deepEqual(checkMigrationContent("allow.sql", fixture("pass_allow_override.sql")), []);
});

test("bulk UPDATE on a large table fails", () => {
  assert.match(checkMigrationContent("fail.sql", fixture("fail_bulk_update.sql")).join("\n"), /UPDATE on large table series/);
});

test("a small-table statement after a large-table ALTER is not blamed on the large table", () => {
  assert.deepEqual(checkMigrationContent("pass.sql", fixture("pass_two_statements.sql")), []);
});

test("allow override without a reason does not bypass a hazard", () => {
  assert.match(checkMigrationContent("fail.sql", fixture("fail_allow_without_reason.sql")).join("\n"), /CONCURRENTLY/);
});
