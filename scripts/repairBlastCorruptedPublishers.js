// Repairs series rows caught by the cv_publisher "blast write" bug fixed in
// comicvine_api_to_supabase.py's update_series_cv_publisher(): that function
// used to PATCH `series` by `title ilike <name>`, hitting EVERY row sharing
// a literal title. GCD routinely has multiple series rows per title across
// different eras/publishers/countries (five "Vampirella" rows: 1969 Warren,
// a 1974 Mexican reprint, a German licensed edition, etc.) — ingesting any
// one ComicVine volume blasted its publisher onto all of them.
//
// First attempt at this repair tried re-resolving the flagged set from GCD
// indicia (gcd_issues/gcd_series.publisher_gcd_id -> gcd_publishers.name).
// REJECTED after a dry-run showed it would relabel 1,264 genuinely-Marvel
// rows to "Sociedad Editora América, S. A.", 929 DC rows to "Close-Up Inc.",
// etc. — our local GCD publisher-ID mirror is itself unreliable/mismatched
// at scale, a separate pre-existing data problem. Trusting it broadly would
// have corrupted well-known modern seminal titles (Daredevil, Wonder Woman,
// Iron Man) exactly the way this repair is trying to prevent.
//
// This version is deliberately conservative: it only touches a flagged row
// when the CURRENTLY-CACHED publisher is chronologically impossible for
// that row's year_start_cached — e.g. "Dynamite Entertainment" (founded
// 2004) cannot have published something that started in 1969. That test
// never fires on Marvel (1939) or DC (1934) since virtually nothing in the
// catalog predates them, so seminal modern titles are untouched by
// construction, not by hoping a guard catches them. Rows that don't clear
// this bar are left alone, even if flagged — better to leave a known-wrong
// value in a low-visibility pre-1970s reprint row than risk a wrong guess.
// Proven-anachronistic rows reset to "Unknown Publisher" (honest, not a
// fabricated replacement) and cv_publisher is cleared.
//
// EARLIEST_YEAR is deliberately loose/early per publisher (favors NOT
// flagging borderline cases) — sourced from well-known public facts, not
// from our GCD mirror, since that's the exact data source just proven
// unreliable.
//
// Usage:
//   node scripts/repairBlastCorruptedPublishers.js          # dry-run
//   node scripts/repairBlastCorruptedPublishers.js --apply  # writes updates

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const PAGE_SIZE = 1000;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Earliest plausible start year per allowlisted publisher. Deliberately
// early/conservative (a few years before actual founding where sources
// disagree) so this only ever catches unambiguous anachronisms.
const EARLIEST_YEAR = {
  "Marvel Comics": 1939,
  "DC Comics": 1934,
  "Image Comics": 1992,
  "Dark Horse Comics": 1986,
  "IDW Publishing": 1999,
  "BOOM! Studios": 2004,
  "Valiant Comics": 1989,
  "Dynamite Entertainment": 2004,
  "Archie Comics": 1939,
  "Top Cow Comics": 1992,
  "Vertigo": 1992,
  "Mirage Studios": 1984,
  "WildStorm": 1992,
  "Oni Press": 1997,
  "Caliber Comics": 1989,
  "Eclipse Comics": 1977,
  "First Comics": 1983,
  "AfterShock Comics": 2015,
  "Ahoy Comics": 2018,
  "Black Mask Studios": 2012,
  "AWA Studios": 2020,
  "Now Comics": 1985,
  "Fantagraphics": 1976,
  "Avatar Press": 1996,
  "Titan Comics": 1981,
  "Antarctic Press": 1984,
  "Zenescope Entertainment": 2005,
  "VIZ Media": 1986,
  "Archaia": 2002,
  "Rebellion": 2000,
  "Aspen Comics": 2003,
  "Vault Comics": 2016,
  "Skybound": 2010,
  "Mad Cave Studios": 2017,
  "Heavy Metal": 1977,
  "Action Lab Entertainment": 2011,
  "Devil's Due": 2002,
  "Dell Comics": 1929,
  "Gold Key": 1962,
  "Charlton Comics": 1946,
  "Harvey Comics": 1939,
  "EC Comics": 1944,
  "Fawcett Comics": 1939,
  "Atlas Comics": 1951,
  "Topps Comics": 1992,
};

async function paginate(builderFn) {
  const out = [];
  let from = 0;
  while (true) {
    const { data, error } = await builderFn().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

async function run() {
  console.log(APPLY ? "MODE: --apply (writes will happen)" : "MODE: dry-run");
  console.log("Loading series with cv_publisher set…");

  const rows = await paginate(() =>
    supabase
      .from("series")
      .select("id, gcd_id, title, year_start_cached, cv_publisher, resolved_publisher_cached")
      .not("cv_publisher", "is", null)
  );
  console.log(`  ${rows.length} rows loaded`);

  const byTitle = new Map();
  for (const r of rows) {
    if (!byTitle.has(r.title)) byTitle.set(r.title, []);
    byTitle.get(r.title).push(r);
  }

  // Flagged: title groups with >1 row, ALL sharing the identical
  // cv_publisher — the fingerprint of the title-wide blast write.
  const flagged = [];
  for (const [, group] of byTitle) {
    if (group.length <= 1) continue;
    const distinctCv = new Set(group.map((r) => r.cv_publisher));
    if (distinctCv.size === 1) flagged.push(...group);
  }
  console.log(`Flagged rows (blast-bug candidates): ${flagged.length}`);

  const plan = [];
  for (const series of flagged) {
    const pub = series.resolved_publisher_cached;
    const earliest = EARLIEST_YEAR[pub];
    if (earliest == null) continue; // not a publisher we have a founding year for — leave alone
    const year = series.year_start_cached;
    if (year == null || year >= earliest) continue; // not provably anachronistic — leave alone

    plan.push({
      id: series.id,
      title: series.title,
      year,
      from: pub,
      earliestPossible: earliest,
    });
  }

  console.log(`\n${plan.length} rows are provable anachronisms (publisher didn't exist yet).`);
  console.log(`Flagged-but-not-touched (no provable anachronism): ${flagged.length - plan.length}`);

  const buckets = new Map();
  for (const p of plan) {
    buckets.set(p.from, (buckets.get(p.from) ?? 0) + 1);
  }
  console.log("\nBy currently-cached (wrong) publisher:");
  const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
  for (const [key, count] of sorted) {
    console.log(`  ${String(count).padStart(5)}  ${key} (founded ${EARLIEST_YEAR[key]})`);
  }

  const vampSample = plan.filter((p) => p.title === "Vampirella");
  console.log(`\nVampirella spot-check (${vampSample.length} rows):`);
  for (const p of vampSample) console.log(`  ${p.year}  ${p.from} (founded ${p.earliestPossible}) → Unknown Publisher`);

  console.log(`\nSample of all planned changes (first 20):`);
  for (const p of plan.slice(0, 20)) {
    console.log(`  ${p.year}  ${p.title} — ${p.from} (founded ${p.earliestPossible}) → Unknown Publisher`);
  }

  if (!APPLY) {
    console.log("\nDry-run complete. Re-run with --apply to write.");
    return;
  }

  console.log("\nApplying updates…");
  let applied = 0;
  for (let i = 0; i < plan.length; i += 200) {
    const batch = plan.slice(i, i + 200);
    await Promise.all(
      batch.map((p) =>
        supabase
          .from("series")
          .update({
            cv_publisher: null,
            resolved_publisher_cached: "Unknown Publisher",
            search_refreshed_at: new Date().toISOString(),
          })
          .eq("id", p.id)
      )
    );
    applied += batch.length;
    process.stdout.write(`  applied ${applied}/${plan.length}\r`);
  }
  console.log("");
  console.log(`Updated ${applied} rows.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
