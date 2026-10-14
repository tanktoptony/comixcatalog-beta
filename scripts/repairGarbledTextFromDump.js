// Repair catalog text that lost its accented characters in the 2026-03-18
// bulk import. Those rows hold U+FFFD (the "�" diamond) where the original
// had é, ñ, ö, curly quotes and so on: ~25k series titles, ~27k issue titles,
// ~2.5k cached publisher names. The GCD SQLite dump has the clean text.
//
// A value is only replaced when its ASCII characters match the dump value's
// ASCII characters exactly, so a series GCD renamed since March (or a title
// we curated by hand) is skipped and reported, never overwritten.
//
// Dry run by default. Off-peak, one bulk job at a time:
//   node --env-file=.env.local scripts/repairGarbledTextFromDump.js --dump=<path-to-gcd.db>
//   node --env-file=.env.local scripts/repairGarbledTextFromDump.js --dump=<path> --apply
// Options: --only=<target name>, --concurrency=2 (max 4), --delay-ms=100
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

export const REPLACEMENT = String.fromCharCode(0xfffd);

// The ASCII skeleton: everything the broken import kept intact.
export function asciiSkeleton(value) {
  return String(value ?? "").replace(/[^\x20-\x7e]/g, "");
}

// The clean value to write, or null with the reason it was skipped.
// acceptRenames: the column mirrors GCD's own name for this exact id, so when
// GCD renamed it since March, its current name beats our broken copy.
export function chooseRepair(current, clean, { acceptRenames = false } = {}) {
  if (clean == null || clean === "") return { value: null, reason: "not_in_dump" };
  if (clean.includes(REPLACEMENT)) return { value: null, reason: "dump_also_garbled" };
  if (clean === current) return { value: null, reason: "unchanged" };
  if (asciiSkeleton(current) !== asciiSkeleton(clean)) {
    return acceptRenames ? { value: clean, reason: "renamed_in_gcd" } : { value: null, reason: "text_differs" };
  }
  return { value: clean, reason: "fix" };
}

// Publisher names: the cached name can be the brand or the indicia publisher,
// so match a broken name against every clean name with the same ASCII
// skeleton. Only an unambiguous match is used.
export function buildNameIndex(names) {
  const index = new Map();
  for (const name of names) {
    if (!name || name.includes(REPLACEMENT) || !/[^ -~]/.test(name)) continue;
    const key = asciiSkeleton(name);
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(name);
  }
  return (current) => {
    const matches = [...(index.get(asciiSkeleton(current)) ?? [])];
    return matches.length === 1 ? matches[0] : null;
  };
}

function parseArgs(argv) {
  const args = Object.fromEntries(argv.map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : true];
  }));
  if (!args.dump) throw new Error("--dump=<path to the GCD SQLite dump> is required");
  return {
    dump: String(args.dump),
    apply: Boolean(args.apply),
    only: args.only ? String(args.only) : null,
    concurrency: Math.min(4, Math.max(1, Number(args.concurrency ?? 2))),
    delayMs: Math.max(0, Number(args["delay-ms"] ?? 100)),
  };
}

// Each target: a table/column in Supabase, its key, and how to read the clean
// value for that key from the dump.
function targets(dump) {
  const seriesName = dump.prepare("select name, sort_name, publisher_id from gcd_series where id = ?");
  const issueTitle = dump.prepare("select title from gcd_issue where id = ?");
  const publisherName = dump.prepare("select name from gcd_publisher where id = ?");
  const byPublisherSkeleton = buildNameIndex([
    ...dump.prepare("select name from gcd_publisher").all().map((row) => row.name),
    ...dump.prepare("select name from gcd_indicia_publisher").all().map((row) => row.name),
  ]);
  return [
    { name: "gcd_series.name", table: "gcd_series", key: "gcd_id", column: "name", clean: (id) => seriesName.get(id)?.name, acceptRenames: true },
    { name: "gcd_series.sort_name", table: "gcd_series", key: "gcd_id", column: "sort_name", clean: (id) => seriesName.get(id)?.sort_name, acceptRenames: true },
    { name: "series.title", table: "series", key: "gcd_id", column: "title", clean: (id) => seriesName.get(id)?.name, acceptRenames: true },
    {
      name: "series.resolved_publisher_cached", table: "series", key: "gcd_id", column: "resolved_publisher_cached",
      clean: (id, current) => {
        const publisherId = seriesName.get(id)?.publisher_id;
        const own = publisherId == null ? null : publisherName.get(publisherId)?.name;
        return own && asciiSkeleton(own) === asciiSkeleton(current) ? own : byPublisherSkeleton(current) ?? own;
      },
    },
    { name: "gcd_issues.title", table: "gcd_issues", key: "gcd_id", column: "title", clean: (id) => issueTitle.get(id)?.title, acceptRenames: true },
    { name: "gcd_publishers.name", table: "gcd_publishers", key: "gcd_id", column: "name", clean: (id, current) => publisherName.get(id)?.name ?? byPublisherSkeleton(current) },
  ];
}

async function fetchGarbled(supabase, target) {
  const rows = [];
  let after = null;
  for (;;) {
    let query = supabase.from(target.table).select(`${target.key}, ${target.column}`)
      .ilike(target.column, `%${REPLACEMENT}%`)
      .not(target.key, "is", null)
      .order(target.key, { ascending: true })
      .limit(1000);
    if (after != null) query = query.gt(target.key, after);
    const { data, error } = await query;
    if (error) throw new Error(`${target.name} after ${after}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
    after = data[data.length - 1][target.key];
  }
  return rows;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function applyFixes(supabase, target, fixes, options) {
  let next = 0;
  let written = 0;
  const failures = [];
  async function worker() {
    while (next < fixes.length) {
      const fix = fixes[next++];
      for (let attempt = 1; ; attempt++) {
        const { error } = await supabase.from(target.table)
          .update({ [target.column]: fix.value })
          .eq(target.key, fix.key);
        if (!error) { written++; break; }
        if (attempt >= 3) { failures.push({ key: fix.key, error: error.message }); break; }
        await sleep(2000 * attempt);
      }
      if (written % 1000 === 0 && written) console.log(`  ${target.name} written=${written}/${fixes.length}`);
      await sleep(options.delayMs);
    }
  }
  await Promise.all(Array.from({ length: options.concurrency }, worker));
  return { written, failures };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dump = new DatabaseSync(options.dump, { readOnly: true });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  console.log(`${options.apply ? "APPLY" : "DRY RUN"} dump=${options.dump}`);
  let failed = 0;
  for (const target of targets(dump)) {
    if (options.only && options.only !== target.name) continue;
    const rows = await fetchGarbled(supabase, target);
    const tally = {};
    const fixes = [];
    const skipped = [];
    for (const row of rows) {
      const result = chooseRepair(row[target.column], target.clean(row[target.key], row[target.column]), target);
      tally[result.reason] = (tally[result.reason] ?? 0) + 1;
      if (result.value) fixes.push({ key: row[target.key], from: row[target.column], value: result.value });
      else skipped.push({ key: row[target.key], from: row[target.column], reason: result.reason });
    }
    console.log(`${target.name}: garbled=${rows.length} ${JSON.stringify(tally)}`);
    for (const fix of fixes.slice(0, 3)) console.log(`  fix ${fix.key}: ${JSON.stringify(fix.from)} -> ${JSON.stringify(fix.value)}`);
    for (const skip of skipped.slice(0, 3)) console.log(`  skip ${skip.key} (${skip.reason}): ${JSON.stringify(skip.from)}`);
    if (!options.apply || !fixes.length) continue;
    const { written, failures } = await applyFixes(supabase, target, fixes, options);
    failed += failures.length;
    console.log(`  ${target.name}: wrote ${written}, failed ${failures.length}`);
    for (const failure of failures.slice(0, 5)) console.log(`  fail ${failure.key}: ${failure.error}`);
  }
  if (failed) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
