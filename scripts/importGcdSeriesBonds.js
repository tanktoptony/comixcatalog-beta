// Import directional GCD series bonds into public.series_links.
// Dry-run is the default. Pass --apply to write batches of 500.

import Database from "better-sqlite3";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const INCLUDED_TYPES = new Set([
  "minor_name_numbering_continues",
  "major_name_numbering_continues",
  "publisher_numbering_continues",
  "merge_numbering_continues",
  "reboot",
]);

export function mapGcdSeriesBonds(rows, existingGcdIds) {
  return (rows ?? []).flatMap((row) => {
    const from = Number(row.origin_id);
    const to = Number(row.target_id);
    if (!INCLUDED_TYPES.has(row.bond_type) || !existingGcdIds.has(from) || !existingGcdIds.has(to)) return [];
    return [{
      from_gcd_id: from,
      to_gcd_id: to,
      kind: "continues",
      source: "gcd_bond",
      gcd_bond_type: row.bond_type,
      note: String(row.notes ?? "").trim() || null,
    }];
  });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function allCatalogSeries(supabase) {
  const rows = [];
  let last = -1;
  while (true) {
    const { data, error } = await supabase
      .from("series")
      .select("gcd_id,title")
      .not("gcd_id", "is", null)
      .gt("gcd_id", last)
      .order("gcd_id", { ascending: true })
      .limit(1000);
    if (error) throw new Error(`Could not read catalog series after GCD id ${last}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
    last = Number(data.at(-1).gcd_id);
  }
  return rows;
}

async function main() {
  dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
  const args = new Set(process.argv.slice(2));
  if (args.has("--apply") && args.has("--dry-run")) throw new Error("Choose either --apply or --dry-run");
  const apply = args.has("--apply");
  const dbArg = process.argv.slice(2).find((arg) => arg.startsWith("--gcd-db="));
  const dbPath = path.resolve(dbArg?.slice("--gcd-db=".length) || process.env.GCD_SQLITE_PATH || "../../../gcd-dump/2026-10-10.db");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const catalog = await allCatalogSeries(supabase);
  const existing = new Set(catalog.map((row) => Number(row.gcd_id)));
  const titles = new Map(catalog.map((row) => [Number(row.gcd_id), row.title]));

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const raw = db.prepare(`
    select b.origin_id, b.target_id, b.notes, t.name as bond_type
    from gcd_series_bond b
    join gcd_series_bond_type t on t.id = b.bond_type_id
    order by b.origin_id, b.target_id
  `).all();
  db.close();
  const mapped = mapGcdSeriesBonds(raw, existing);

  const counts = new Map();
  for (const row of raw) counts.set(row.bond_type, (counts.get(row.bond_type) ?? 0) + 1);
  console.log(`Mode: ${apply ? "apply" : "dry-run"}`);
  console.log(`GCD dump: ${dbPath}`);
  console.log(`Catalog series with GCD ids: ${existing.size}`);
  console.log(`GCD bonds: ${raw.length}`);
  for (const [type, count] of [...counts].sort()) {
    const included = mapped.filter((row) => row.gcd_bond_type === type).length;
    console.log(`${type}: ${count} source, ${included} eligible`);
  }
  console.log(`Eligible rows: ${mapped.length}`);
  console.log("Samples:");
  for (const row of mapped.slice(0, 10)) {
    console.log(`  ${titles.get(row.from_gcd_id)} (${row.from_gcd_id}) -> ${titles.get(row.to_gcd_id)} (${row.to_gcd_id}) [${row.gcd_bond_type}]`);
  }
  if (!apply) return;

  let written = 0;
  for (let index = 0; index < mapped.length; index += 500) {
    const batch = mapped.slice(index, index + 500);
    const { error } = await supabase.from("series_links").upsert(batch, {
      onConflict: "from_gcd_id,to_gcd_id,kind",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(`Upsert failed at row ${index}: ${error.message}`);
    written += batch.length;
    console.log(`Processed ${written}/${mapped.length}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
