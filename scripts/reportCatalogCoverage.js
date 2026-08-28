// Real cover-coverage report, replacing ad-hoc one-off queries. See
// scripts/lib/coverageMetrics.js (the actual computation, shared with the
// nightly report) for why the allowlisted-corpus number is the one to
// track and the other two aren't.
//
// Usage: node scripts/reportCatalogCoverage.js

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { computeCoverageMetrics } from "./lib/coverageMetrics.js";

dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const m = await computeCoverageMetrics(supabase);

  console.log("── Raw (not actionable, denominator includes foreign/ephemera) ──");
  console.log(`Total gcd_issues: ${m.totalIssuesRaw}`);
  console.log(`Total canonical_covers: ${m.totalCoversRaw}`);
  console.log(`Raw coverage: ${m.rawCoveragePct.toFixed(2)}%`);

  console.log("\n── Allowlisted corpus (the real target) ──");
  console.log(`Allowlisted publishers: ${m.allowlistedPublisherCount}`);
  console.log(`Allowlisted series: ${m.allowlistedSeriesCount}`);
  console.log(`Allowlisted issues (variant-deduped): ${m.totalAllowlistedIssues}`);
  console.log(`Covered issues: ${m.coveredIssues}`);
  console.log(`Coverage: ${m.allowlistedCoveragePct.toFixed(2)}%`);
  console.log(`Series with >=1 cover: ${m.seriesWithCoverCount} of ${m.allowlistedSeriesCount}`);
  console.log(`Series with zero covers: ${m.seriesZeroCoverCount}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
