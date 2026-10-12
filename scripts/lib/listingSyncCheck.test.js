import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { listingSyncHasProblems, normalizeListingSyncReport } from "./listingSyncCheck.js";

test("missing listings or unresolved failures make the check fail", () => {
  assert.equal(listingSyncHasProblems(normalizeListingSyncReport({ missing_count: 1 })), true);
  assert.equal(listingSyncHasProblems(normalizeListingSyncReport({ unresolved_failure_count: 1 })), true);
  assert.equal(listingSyncHasProblems(normalizeListingSyncReport({ missing_count: 0, unresolved_failure_count: 0 })), false);
  assert.equal(listingSyncHasProblems(normalizeListingSyncReport({ unlinked_for_sale_count: 9 })), false);
});

test("trigger exception path cannot abort the collection write", async () => {
  // PostgreSQL exception blocks are subtransactions. The outer handler must
  // return NEW, and the diagnostic insert needs its own handler because an
  // unhandled logging error would otherwise escape and abort the UPDATE.
  const sql = await readFile(new URL("../migrations/0053_listing_trigger_logging.sql", import.meta.url), "utf8");
  const handler = sql.slice(sql.indexOf("exception when others then"), sql.indexOf("create or replace function public.check_listing_sync"));
  assert.match(handler, /begin\s+insert into public\.listing_sync_failures[\s\S]+exception when others then[\s\S]+end;\s+return new;/i);
});
