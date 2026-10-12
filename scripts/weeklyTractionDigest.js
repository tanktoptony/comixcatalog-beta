import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { resendBatch } from "../src/lib/newsletter.js";
import { TEST_ACCOUNT_USERNAMES } from "../src/lib/traction.js";

export function digestHtml(report) {
  const latest = report.cohorts.at(-2) || {};
  const sources = report.sources.slice(0, 5).map((row) => `<li>${row.source}: ${row.signups}</li>`).join("");
  const stalls = report.stalls.length
    ? report.stalls.map((row) => `<li>${row.username} (${String(row.signup_date).slice(0, 10)}, ${row.source})</li>`).join("")
    : "<li>None</li>";
  return `<h1>Weekly traction</h1><p>Last week: <strong>${latest.signups || 0}</strong> signups, <strong>${latest.first_book_pct || 0}%</strong> reached 1 comic, and <strong>${latest.collection_25_pct || 0}%</strong> reached 25 comics.</p><p>North star: <strong>${report.north_star} / 100</strong></p><h2>Top sources</h2><ul>${sources || "<li>None</li>"}</ul><h2>Stalled new members</h2><ul>${stalls}</ul>`;
}

async function main() {
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) if (!process.env[name]) throw new Error(`${name} is not set`);
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.rpc("traction_report", { p_excluded_usernames: TEST_ACCOUNT_USERNAMES });
  if (error) throw error;
  const html = digestHtml(data);
  if (process.argv.includes("--dry-run")) { console.log(html); return; }
  if (!process.env.REPORTS_NOTIFY_EMAIL) throw new Error("REPORTS_NOTIFY_EMAIL is not set");
  await resendBatch([{ to: process.env.REPORTS_NOTIFY_EMAIL, subject: "ComixCatalog weekly traction", html }]);
  console.log(`Sent weekly traction digest to ${process.env.REPORTS_NOTIFY_EMAIL}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error); process.exitCode = 1; });
