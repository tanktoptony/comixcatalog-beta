// Drop done-ledger entries for targets that were recorded as finished but
// produced no covers.
//
// .ingest-done.json maps "<name>\x01<publisher>\x01<year>" to the timestamp a
// target was processed, and the ingest skips a fresh entry before spending a
// search call. Entries expire after DONE_TTL_DAYS (30), so a wrong entry is
// not permanent — but it does cost up to a month per cycle, and until
// comicvine_api_to_supabase.py's mark rule was fixed (2026-09-22) the retry
// at the end of that month failed the same way and re-marked it done. The
// result was a target that looked active in the queue forever while making
// no progress, once every 30 days.
//
// This clears those entries so the next run actually retries them, rather
// than waiting out the TTL. It only removes an entry when the series has
// zero covers, so a legitimately finished series is never disturbed.
//
// Usage:
//   node scripts/unstickDoneLedger.js --targets=gap-user-collected.json
//   node scripts/unstickDoneLedger.js --targets=gap-user-collected.json --apply
//
// Dry run by default. Scope it with --targets to a gap file rather than
// walking all ~7,600 entries; the user-collected lane is the one that
// matters most and it is 19 entries.

import fs from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { normTitle } from "../src/lib/titleMatch.js";

dotenv.config({ path: ".env.local", quiet: true });

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? true];
  })
);
const TARGETS = args.targets ? String(args.targets) : null;
const LEDGER = String(args.ledger || ".ingest-done.json");
const APPLY = Boolean(args.apply);

if (!TARGETS) {
  console.error("usage: node scripts/unstickDoneLedger.js --targets=<gap file> [--apply]");
  process.exit(2);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Same separator comicvine_api_to_supabase.py's _done_key uses.
const SEP = "";
const doneKey = (t) => `${t.name}${SEP}${t.publisher}${SEP}${t.year}`;

async function coverCountFor(target) {
  // Find the series this target refers to, then count its covers. Matching
  // on title + start year is how the gap files identify a series in the
  // first place, so it is the same identity the ingest is working with.
  const { data: rows, error } = await supabase
    .from("series")
    .select("gcd_id, title, year_start_cached")
    .ilike("title", String(target.name).replace(/[%_]/g, ""))
    .not("gcd_id", "is", null);
  if (error) throw new Error(`series lookup: ${error.code} | ${error.message}`);

  const key = normTitle(target.name);
  const matches = (rows ?? []).filter(
    (r) => normTitle(r.title) === key && (!target.year || Number(r.year_start_cached) === Number(target.year))
  );
  if (!matches.length) return { covers: 0, seriesFound: false };

  let covers = 0;
  for (const m of matches) {
    const { count, error: countError } = await supabase
      .from("canonical_covers")
      .select("id", { count: "exact", head: true })
      .eq("series_gcd_id", m.gcd_id)
      .not("storage_path", "is", null);
    if (countError) throw new Error(`cover count: ${countError.code} | ${countError.message}`);
    covers += count ?? 0;
  }
  return { covers, seriesFound: true };
}

async function main() {
  const ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const raw = JSON.parse(fs.readFileSync(TARGETS, "utf8"));
  const targets = Array.isArray(raw) ? raw : raw.targets ?? [];
  console.log(`${TARGETS}: ${targets.length} targets | ${LEDGER}: ${Object.keys(ledger).length} entries\n`);

  const toRemove = [];
  for (const t of targets) {
    const key = doneKey(t);
    if (!(key in ledger)) {
      console.log(`  keep   ${String(t.name).slice(0, 44).padEnd(46)} not in the ledger`);
      continue;
    }
    const { covers, seriesFound } = await coverCountFor(t);
    if (covers > 0) {
      console.log(`  keep   ${String(t.name).slice(0, 44).padEnd(46)} ${covers} covers — genuinely done`);
      continue;
    }
    toRemove.push(key);
    console.log(
      `  UNSTICK ${String(t.name).slice(0, 43).padEnd(45)} 0 covers` +
        (seriesFound ? "" : ", and no series row matched") +
        ` (marked done ${String(ledger[key]).slice(0, 10)})`
    );
  }

  console.log(`\n${toRemove.length} entr${toRemove.length === 1 ? "y" : "ies"} to remove.`);
  if (!APPLY) {
    console.log("[dry run] Nothing written. Re-run with --apply.");
    return;
  }
  if (!toRemove.length) return;

  for (const key of toRemove) delete ledger[key];
  // Byte-for-byte the shape comicvine_api_to_supabase.py's _save_done writes:
  //   json.dumps(dict(sorted(done.items())), ensure_ascii=False)
  // which is one line, keys sorted, Python's default ", " / ": " separators,
  // and no trailing newline.
  //
  // Writing pretty-printed JSON here instead produced a 7,680-line diff
  // against a 1-line file, so every run of this script would have collided
  // with the hourly workflow's own ledger commit. Matching the format keeps
  // the diff to the handful of keys actually removed.
  const body = Object.keys(ledger)
    .sort()
    .map((k) => `${JSON.stringify(k)}: ${JSON.stringify(ledger[k])}`)
    .join(", ");
  fs.writeFileSync(LEDGER, `{${body}}`);
  console.log(`Wrote ${LEDGER} — ${Object.keys(ledger).length} entries remain.`);
  console.log("These targets will be retried on the next ingest run.");
}

main().catch((err) => {
  console.error(`unstickDoneLedger failed: ${err?.message ?? err}`);
  process.exit(1);
});
