// Refresh series.reprint_count from a local GCD SQLite dump. Dry run by default.
// Use --apply to write after reviewing the summary and top 15.
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function planReprintUpdates(rows, countsByGcdId) {
  const updates = [];
  let unchanged = 0;
  let missingInDump = 0;
  let skippedNullGcdId = 0;
  for (const row of rows) {
    if (row.gcd_id == null) {
      skippedNullGcdId += 1;
      continue;
    }
    const found = countsByGcdId.has(row.gcd_id);
    const reprintCount = found ? countsByGcdId.get(row.gcd_id) : 0;
    if (!found) missingInDump += 1;
    if ((row.reprint_count ?? 0) === reprintCount) unchanged += 1;
    else updates.push({ id: row.id, gcd_id: row.gcd_id, reprint_count: reprintCount });
  }
  return { updates, changed: updates.length, unchanged, missingInDump, skippedNullGcdId };
}

function parseArgs(argv) {
  const args = Object.fromEntries(argv.map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : true];
  }));
  if (!args.dump || args.dump === true) throw new Error("--dump=<path to the GCD SQLite dump> is required");
  return { dump: String(args.dump), apply: Boolean(args.apply) };
}

function readReprintCounts(dump) {
  const rows = dump.prepare(`
    select i.series_id, s.name as title, s.year_began as year, count(*) as reprint_count
    from gcd_reprint r
    join gcd_issue i on i.id = r.origin_issue_id
    join gcd_series s on s.id = i.series_id
    group by i.series_id
  `).all();
  return { rows, counts: new Map(rows.map((row) => [row.series_id, Number(row.reprint_count)])) };
}

async function fetchSeriesRows(supabase) {
  const rows = [];
  let after = null;
  for (;;) {
    let query = supabase.from("series").select("id, gcd_id, reprint_count")
      .order("id", { ascending: true }).limit(PAGE_SIZE);
    if (after != null) query = query.gt("id", after);
    const { data, error } = await query;
    if (error) throw new Error(`series page after ${after ?? "start"}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    after = data[data.length - 1].id;
  }
  return rows;
}

async function applyUpdates(supabase, updates) {
  let next = 0;
  let written = 0;
  const failures = [];
  async function worker() {
    while (next < updates.length) {
      const update = updates[next++];
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const { error } = await supabase.from("series")
          .update({ reprint_count: update.reprint_count }).eq("id", update.id);
        if (!error) {
          written += 1;
          if (written % 1000 === 0) console.log(`written=${written}/${updates.length}`);
          break;
        }
        if (attempt === 3) failures.push({ ...update, error: error.message });
        else await sleep(1000 * 2 ** (attempt - 1));
      }
      await sleep(100);
    }
  }
  await Promise.all([worker(), worker()]);
  return { written, failures };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dump = new DatabaseSync(options.dump, { readOnly: true });
  try {
    const { rows: countRows, counts } = readReprintCounts(dump);
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const plan = planReprintUpdates(await fetchSeriesRows(supabase), counts);
    console.log(`${options.apply ? "APPLY" : "DRY RUN"} dump=${options.dump}`);
    console.log(`counts=${counts.size} changed=${plan.changed} unchanged=${plan.unchanged} missing_in_dump=${plan.missingInDump} null_gcd_id=${plan.skippedNullGcdId}`);
    console.log("Top 15 series by reprint_count:");
    for (const row of countRows.sort((a, b) => Number(b.reprint_count) - Number(a.reprint_count)).slice(0, 15)) {
      console.log(`  ${row.reprint_count}\t${row.title} (${row.year ?? "year unknown"}) [GCD ${row.series_id}]`);
    }
    const result = options.apply ? await applyUpdates(supabase, plan.updates) : { written: 0, failures: [] };
    console.log(`Summary: changed=${plan.changed} unchanged=${plan.unchanged} missing_in_dump=${plan.missingInDump} failures=${result.failures.length}${options.apply ? ` written=${result.written}` : ""}`);
    for (const failure of result.failures.slice(0, 10)) console.error(`  fail ${failure.id}: ${failure.error}`);
    if (result.failures.length) process.exitCode = 1;
  } finally {
    dump.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
