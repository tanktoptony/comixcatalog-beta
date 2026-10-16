// Refresh gcd_series format fields from a local GCD SQLite dump. Dry run by default.
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").trim() || null;

export function planSeriesFormatUpdates(rows, formatsByGcdId) {
  const updates = [];
  let unchanged = 0;
  let missingInDump = 0;
  for (const row of rows) {
    const source = formatsByGcdId.get(Number(row.gcd_id));
    if (!source) {
      missingInDump += 1;
      continue;
    }
    const desired = {
      publishing_format: clean(source.publishing_format),
      binding: clean(source.binding),
      format_notes: clean(source.format_notes ?? source.notes),
      publication_type: clean(source.publication_type),
    };
    const differs = Object.entries(desired).some(([key, value]) => clean(row[key]) !== value);
    if (differs) updates.push({ gcd_id: Number(row.gcd_id), ...desired });
    else unchanged += 1;
  }
  return { updates, changed: updates.length, unchanged, missingInDump };
}

function parseArgs(argv) {
  const args = Object.fromEntries(argv.map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : true];
  }));
  if (!args.dump || args.dump === true) throw new Error("--dump=<path to the GCD SQLite dump> is required");
  return { dump: String(args.dump), apply: Boolean(args.apply) };
}

function readDumpFormats(dump) {
  const rows = dump.prepare(`
    select s.id as gcd_id, s.name, s.publishing_format, s.binding, s.notes as format_notes,
      pt.name as publication_type
    from gcd_series s
    left join gcd_series_publication_type pt on pt.id = s.publication_type_id
  `).all();
  return new Map(rows.map((row) => [Number(row.gcd_id), row]));
}

async function fetchPage(supabase, after) {
  let query = supabase.from("gcd_series")
    .select("gcd_id, name, publishing_format, binding, format_notes, publication_type")
    .order("gcd_id", { ascending: true }).limit(PAGE_SIZE);
  if (after != null) query = query.gt("gcd_id", after);
  const { data, error } = await query;
  if (error) throw new Error(`gcd_series page after ${after ?? "start"}: ${error.message}`);
  return data ?? [];
}

async function writeWithRetry(supabase, update) {
  const { gcd_id: gcdId, ...fields } = update;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const { error } = await supabase.from("gcd_series")
        .update({ ...fields, format_synced_at: new Date().toISOString() })
        .eq("gcd_id", gcdId);
      if (!error) return;
      lastError = error;
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) await sleep(1000 * 2 ** (attempt - 1));
  }
  throw new Error(lastError?.message || String(lastError));
}

async function applyUpdates(supabase, updates) {
  let next = 0;
  let written = 0;
  const failures = [];
  async function worker() {
    while (next < updates.length) {
      const update = updates[next++];
      try {
        await writeWithRetry(supabase, update);
        written += 1;
        if (written % 1000 === 0) console.log(`written=${written}/${updates.length}`);
      } catch (error) {
        failures.push({ gcd_id: update.gcd_id, error: error.message });
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
    const formats = readDumpFormats(dump);
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const totals = { changed: 0, unchanged: 0, missingInDump: 0 };
    const updates = [];
    const sample = [];
    let after = null;
    for (;;) {
      const rows = await fetchPage(supabase, after);
      const plan = planSeriesFormatUpdates(rows, formats);
      totals.changed += plan.changed;
      totals.unchanged += plan.unchanged;
      totals.missingInDump += plan.missingInDump;
      updates.push(...plan.updates);
      for (const update of plan.updates) {
        if (sample.length >= 15) break;
        const before = rows.find((row) => Number(row.gcd_id) === update.gcd_id);
        sample.push({ name: before?.name, before, after: update });
      }
      if (rows.length < PAGE_SIZE) break;
      after = rows.at(-1).gcd_id;
    }
    console.log(`${options.apply ? "APPLY" : "DRY RUN"} dump=${options.dump}`);
    console.log(`changed=${totals.changed} unchanged=${totals.unchanged} missing_in_dump=${totals.missingInDump}`);
    console.log("Sample of 15 changes:");
    for (const item of sample) console.log(`  GCD ${item.after.gcd_id} ${item.name ?? ""}: ${JSON.stringify(item.before)} -> ${JSON.stringify(item.after)}`);
    const result = options.apply ? await applyUpdates(supabase, updates) : { written: 0, failures: [] };
    console.log(`Summary: changed=${totals.changed} unchanged=${totals.unchanged} missing_in_dump=${totals.missingInDump} failures=${result.failures.length}${options.apply ? ` written=${result.written}` : ""}`);
    for (const failure of result.failures.slice(0, 10)) console.error(`  fail GCD ${failure.gcd_id}: ${failure.error}`);
    if (result.failures.length) process.exitCode = 1;
  } finally {
    dump.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error); process.exitCode = 1; });
