import { appendFile } from "node:fs/promises";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { listingSyncHasProblems, listingSyncSummary, normalizeListingSyncReport } from "./lib/listingSyncCheck.js";

dotenv.config({ path: ".env.local", quiet: true });
const repair = process.argv.includes("--repair");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function check(runRepair) {
  const { data, error } = await sb.rpc("check_listing_sync", { p_repair: runRepair });
  if (error) throw new Error(`check_listing_sync: ${error.message}`);
  return normalizeListingSyncReport(data);
}

if (repair) {
  const attempted = await check(true);
  console.log(`repair touched ${attempted.repairRowsTouched} collection rows`);
}
const report = await check(false);
const summary = listingSyncSummary(report);
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
if (listingSyncHasProblems(report)) process.exitCode = 1;
