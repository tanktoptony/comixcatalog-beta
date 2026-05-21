// Read-only schema introspection for our Supabase gcd_* tables.
//
// Answers:
//   1. What columns actually exist on gcd_issues? (Maybe there's a cover_id
//      or image_path column the briefing doesn't mention.)
//   2. What other gcd_* tables exist in the public schema beyond the three
//      we know about (gcd_series, gcd_issues, gcd_publishers)?
//   3. Sample row from each so we see real shape.
//
// Why: before we plan a GCD cover bulk-ingest, we need to know whether the
// data is already half-ingested somewhere we forgot.
//
// Usage: node scripts/diagnoseGcdSchema.js

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// PostgREST exposes information_schema via the `pg_meta`/RPC path normally,
// but the simplest cross-version trick is: select * limit 1, then read the
// keys off the returned row. Works for any table the service role can see.
async function sampleColumns(table) {
  const { data, error } = await supabase.from(table).select("*").limit(1);
  if (error) return { table, error: error.message, columns: null, sample: null };
  const sample = data?.[0] ?? null;
  const columns = sample ? Object.keys(sample) : [];
  return { table, error: null, columns, sample };
}

async function countRows(table) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) return null;
  return count;
}

// Tables we want to probe. The first three are documented in CLAUDE.md.
// The rest are speculative — we're checking if they exist (= 200 with rows
// or 200 with empty data) or 404 / 42P01 (relation does not exist).
const PROBE_TABLES = [
  // Known
  "gcd_series",
  "gcd_issues",
  "gcd_publishers",
  // Likely / hopeful
  "gcd_covers",
  "gcd_cover",
  "gcd_images",
  "gcd_image",
  "gcd_story",
  "gcd_stories",
  "gcd_indicia_publisher",
  "gcd_brand",
  "gcd_brands",
  "gcd_creators",
  "gcd_creator",
];

async function run() {
  console.log("══════ KNOWN TABLES — column shape ══════\n");

  for (const table of ["gcd_series", "gcd_issues", "gcd_publishers"]) {
    const { columns, error, sample } = await sampleColumns(table);
    const count = await countRows(table);
    if (error) {
      console.log(`${table}  ERROR: ${error}\n`);
      continue;
    }
    console.log(`${table}  (${count?.toLocaleString() ?? "?"} rows)`);
    console.log(`  columns: ${columns.join(", ")}`);
    if (sample) {
      const trimmed = Object.fromEntries(
        Object.entries(sample).map(([k, v]) => [
          k,
          typeof v === "string" && v.length > 60 ? v.slice(0, 60) + "…" : v,
        ])
      );
      console.log(`  sample : ${JSON.stringify(trimmed)}`);
    }
    console.log();
  }

  console.log("══════ PROBE — other gcd_* tables that might exist ══════\n");

  const speculative = PROBE_TABLES.filter(
    (t) => !["gcd_series", "gcd_issues", "gcd_publishers"].includes(t)
  );

  const probes = await Promise.all(
    speculative.map(async (t) => ({ t, result: await sampleColumns(t) }))
  );

  const found = probes.filter((p) => !p.result.error);
  const missing = probes.filter((p) => p.result.error);

  if (found.length === 0) {
    console.log("  None of the speculative gcd_* tables exist in Supabase.");
  } else {
    for (const { t, result } of found) {
      const count = await countRows(t);
      console.log(`✓ ${t}  (${count?.toLocaleString() ?? "?"} rows)`);
      console.log(`    columns: ${result.columns.join(", ")}`);
      if (result.sample) {
        const trimmed = Object.fromEntries(
          Object.entries(result.sample).map(([k, v]) => [
            k,
            typeof v === "string" && v.length > 60 ? v.slice(0, 60) + "…" : v,
          ])
        );
        console.log(`    sample : ${JSON.stringify(trimmed)}`);
      }
      console.log();
    }
  }

  console.log("Probed-but-absent:");
  for (const { t, result } of missing) {
    // Error message is typically "relation \"public.gcd_xxx\" does not exist"
    // or PGRST205. Just confirm absence; full error noise is unhelpful.
    console.log(`  ✗ ${t}`);
  }

  console.log("\n══════ canonical_covers source distribution ══════\n");
  const { data: srcRows, error: srcError } = await supabase
    .from("canonical_covers")
    .select("source")
    .limit(10000);
  if (srcError) {
    console.log(`  ERROR: ${srcError.message}`);
  } else {
    const sourceCounts = new Map();
    for (const r of srcRows ?? []) {
      const key = r.source ?? "(null)";
      sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
    }
    for (const [src, count] of [...sourceCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(src).padEnd(20)} ${count.toLocaleString()}`);
    }
    console.log(`  (sample of up to 10,000 rows)`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
