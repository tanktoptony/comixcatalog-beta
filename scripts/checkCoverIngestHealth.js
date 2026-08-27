// Standing health check for the cover-ingest pipeline, run as the final
// step of .github/workflows/cover-ingest.yml. Built 2026-08-25 after two
// independent classes of silent failure were found the same day:
//
//   1. The pipeline stalled at 0 new covers/day for weeks because six real
//      fix commits sat unpushed. The ingest job itself stayed green the
//      whole time — every lane step in cover-ingest.yml uses
//      continue-on-error, so a run that adds nothing still "succeeds."
//      Nobody noticed until someone happened to ask about coverage.
//   2. GCD carries many distinct series entries under an identical title
//      (foreign reprints, book-club editions, unrelated one-shots), which
//      caused ComicVine's consistent volume matches to drift onto the
//      wrong gcd_id across separate ingest runs. Took three repair passes
//      (10,800+ covers) to clean up. Nothing would catch a fresh instance
//      of this from a future ingest run without re-running that audit.
//
// This script gives the workflow a real failure mode for both: if it exits
// non-zero, GitHub's default failure notification actually tells someone,
// instead of the job quietly staying green while doing nothing (or the
// wrong thing).
//
// Usage (wired into the workflow — not meant to be run standalone often):
//   node scripts/checkCoverIngestHealth.js --mode=stall
//   node scripts/checkCoverIngestHealth.js --mode=mislink

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";

dotenv.config({ path: ".env.local" });

const args = process.argv.slice(2);
const modeArg = args.find((a) => a.startsWith("--mode="));
const mode = modeArg ? modeArg.split("=")[1] : "stall";
const lookbackArg = args.find((a) => a.startsWith("--lookback-days="));
const LOOKBACK_DAYS = lookbackArg ? Number(lookbackArg.split("=")[1]) : 8;

// Retries a transient Supabase hiccup instead of treating it as a real
// stall — the whole point of this script is to be a trustworthy failure
// signal (see the file header). It failed with an empty/transient error on
// 2026-08-27 and hard-exited, which would have looked identical to "zero
// covers in 24h" to anyone glancing at a red run without reading the log.
// A flaky safety net teaches you to ignore red, which is worse than no net
// at all. Mirrors runWithRetry() from refreshSeriesSearchCache.js, but
// count-only queries put `count` on the response object, not `data` — that
// generic helper returns `data` directly and would silently drop it (same
// gap hit building generateNightlyCoverReport.js's all-time-total query).
async function countWithRetry(supabase, since, maxAttempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { count, error } = await supabase
      .from("canonical_covers")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);
    if (!error) return count;
    lastError = error;
    if (attempt === maxAttempts) break;
    const backoffMs = [1000, 3000, 8000][attempt - 1] ?? 8000;
    console.error(
      `  ⚠ stall check transient error (attempt ${attempt}/${maxAttempts}): ` +
        `${error.message || error.code || "unknown error"} — retrying in ${backoffMs}ms`
    );
    await new Promise((r) => setTimeout(r, backoffMs));
  }
  throw lastError;
}

async function checkStall() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let count;
  try {
    count = await countWithRetry(supabase, since);
  } catch (error) {
    console.error(
      "checkCoverIngestHealth (stall): query failed after retries:",
      error.message || error.code || "unknown error"
    );
    process.exit(1);
  }

  console.log(`New canonical_covers rows in the last ${LOOKBACK_DAYS} days: ${count}`);
  if (!count || count === 0) {
    console.error(
      `\nFAIL: zero new covers in ${LOOKBACK_DAYS} days. This is the exact ` +
        "failure mode that went unnoticed for weeks in Aug 2026 — check whether " +
        "unpushed fixes are sitting in a branch again, or whether ComicVine/GCD " +
        "rate limits are being hit before any lane makes progress."
    );
    process.exit(1);
  }
  console.log("OK: ingest pipeline is producing new covers.");
}

function checkMislink() {
  console.log("Running repairAllCoverSeriesLinks.js --dry-run to check for newly mis-linked volumes...");
  const result = spawnSync("node", ["scripts/repairAllCoverSeriesLinks.js", "--dry-run"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  });

  if (result.error) {
    console.error("checkCoverIngestHealth (mislink): dry-run failed to run:", result.error.message);
    process.exit(1);
  }

  const output = result.stdout || "";
  console.log(output);
  if (result.stderr) console.error(result.stderr);

  // Parses the stable TOTAL_RESOLVED_VOLUMES line, not the human-readable
  // summary prose above it (which changed shape 2026-08-27 when the
  // pin-priority feature split "resolved" into pin-driven + overlap-driven
  // counts — this line exists specifically so that reword didn't need a
  // matching regex change here too, but did this once since it moved).
  const match = output.match(/TOTAL_RESOLVED_VOLUMES:\s*(\d+)/);
  const resolvedCount = match ? Number(match[1]) : null;

  if (resolvedCount == null) {
    console.error("FAIL: could not parse repairAllCoverSeriesLinks.js output — treating as a failure to be safe.");
    process.exit(1);
  }

  console.log(`Volumes needing a relink fix: ${resolvedCount}`);
  if (resolvedCount > 0) {
    console.error(
      `\nFAIL: ${resolvedCount} volume(s) have covers mis-tagged to the wrong ` +
        "gcd_id — the same GCD duplicate-title bug fixed across three repair " +
        "passes earlier. Run 'node scripts/repairAllCoverSeriesLinks.js' (no " +
        "--dry-run) to apply the fix."
    );
    process.exit(1);
  }
  console.log("OK: no new mis-linked volumes found.");
}

async function run() {
  if (mode === "stall") {
    await checkStall();
  } else if (mode === "mislink") {
    checkMislink();
  } else {
    console.error(`Unknown --mode=${mode}. Use "stall" or "mislink".`);
    process.exit(1);
  }
}

run();
