// Watchdog for GitHub Actions' unreliable `schedule:` trigger.
//
// This repo has hit the exact same failure mode four separate times now:
// a workflow's cron simply doesn't fire on some Mondays/days, with no error,
// no notification, nothing — the run just never appears in the history.
// Previously fixed per-workflow (Instagram: hourly cron + "already posted
// today" guard; cover-ingest: hourly instead of weekly), which works but
// means re-discovering + re-fixing the same root cause each time it hits a
// new workflow. This centralizes it: run frequently and cheaply, check
// whether each watched workflow's last SUCCESS is older than its expected
// cadence + a grace window, and if so, fire it via workflow_dispatch.
//
// Deliberately checks last SUCCESS, not last run — a run that fired but
// failed shouldn't block a retry from also being triggered.
//
// Usage: node scripts/cronWatchdog.js
// Requires: GITHUB_TOKEN (Actions default token, with `actions: write`
// permission granted to the calling workflow), GITHUB_REPOSITORY (set
// automatically inside GitHub Actions).

const WATCHED = [
  // Every 10 minutes, with 30 minutes of grace before the watchdog re-fires it.
  { file: "uptime-check.yml", maxAgeHours: 2 / 3 },
  // Mon+Thu cron (09:00 UTC), changed from Monday-only 2026-09-12 because
  // a once-a-week regen was getting fully consumed by hourly cover-ingest
  // runs in ~4 days. Grace window tightened to match: 5-day max age =
  // the ~3.5-day Mon/Thu interval + a day of slack, so a single missed
  // run gets caught by the next watchdog tick well before the following
  // scheduled day, instead of the old 8-day window (sized for weekly
  // cadence) sitting quiet through most of a dead week.
  { file: "weekly-refresh.yml", maxAgeHours: 24 * 5 },
  // Daily cron (08:00 UTC) since 2026-10-03. 48 hours is one missed day
  // plus slack.
  { file: "gap-probe.yml", maxAgeHours: 48 },
  // Daily cron (18:00 UTC), moved from Wednesday-only 2026-09-23. 48 hours
  // is one missed day plus slack.
  //
  // Added at the same time, and worth being honest about why it was not here
  // already: this job ran green and nearly inert for a month and nothing
  // noticed. A watchdog would not have caught that on its own - the runs did
  // fire, and they did report success - but a daily job silently ceasing to
  // fire is the failure this file exists for, and the cadence change makes
  // that failure cheaper to hit.
  { file: "gcd-issue-refresh.yml", maxAgeHours: 12 },
  { file: "gcd-publisher-sync.yml", maxAgeHours: 6 },
  // Daily. Every run was cancelled for 12 days (2026-10-23 to 11-04) because
  // all 16 series sitemap files were returning 500, and nothing noticed.
  { file: "warm-sitemaps.yml", maxAgeHours: 48 },
  // Weekly Monday analytics import, with one day of scheduling slack.
  { file: "youtube-weekly.yml", maxAgeHours: 24 * 8 },
  // Nightly list of the issue pages in the sitemap.
  { file: "issue-sitemap.yml", maxAgeHours: 48 },
  // Every 6 hours plus after each PriceCharting refresh. The homepage value
  // reads its latest row; on 2026-11-20 the schedule went 12 hours without
  // firing and the homepage trailed the library by about $140.
  { file: "snapshot-collection-value.yml", maxAgeHours: 13 },
  // Daily at 08:20 UTC. Its first scheduled run (2026-11-20) never fired.
  // A run takes about an hour, so 30 hours is one missed day plus slack.
  { file: "pricecharting-refresh.yml", maxAgeHours: 30 },
];

// Works whether this file loads as CommonJS (the watchdog job checks out only
// this file, without package.json) or as an ES module (locally).
const fs = process.getBuiltinModule("node:fs");
const DRY_RUN = process.argv.includes("--dry-run");
const repo = process.env.GITHUB_REPOSITORY; // "owner/repo"
const token = process.env.GITHUB_TOKEN;

if (!repo || !token) {
  console.error("GITHUB_REPOSITORY and GITHUB_TOKEN are required.");
  process.exit(1);
}

const API = "https://api.github.com";
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function lastSuccessfulRun(workflowFile) {
  const url = `${API}/repos/${repo}/actions/workflows/${workflowFile}/runs?status=success&per_page=1`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to list runs for ${workflowFile}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.workflow_runs?.[0] ?? null;
}

async function triggerWorkflow(workflowFile) {
  const url = `${API}/repos/${repo}/actions/workflows/${workflowFile}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ ref: "main" }),
  });
  if (!res.ok) {
    throw new Error(`Failed to dispatch ${workflowFile}: ${res.status} ${await res.text()}`);
  }
}

// Re-running a job that fails every time fixes nothing: gcd-issue-refresh
// failed every run, retries included, from 2026-11-15 to 11-23 and nobody
// heard, so a week of new issues never reached the catalog. A job with no
// success for two of its windows (at least a day) is "stuck": it is still
// re-triggered, but the watchdog run then ends red and the workflow emails
// the reports address (once a day) with the list.
const STUCK_MIN_HOURS = 24;
function isStuck(ageHours, maxAgeHours) {
  return ageHours > Math.max(2 * maxAgeHours, STUCK_MIN_HOURS);
}

async function main() {
  let triggeredAny = false;
  const stuck = [];

  for (const { file, maxAgeHours } of WATCHED) {
    const run = await lastSuccessfulRun(file);
    const ageHours = run
      ? (Date.now() - new Date(run.created_at).getTime()) / 3_600_000
      : Infinity;

    if (isStuck(ageHours, maxAgeHours)) {
      stuck.push(`${file}: no successful run for ${Number.isFinite(ageHours) ? `${Math.round(ageHours)} hours` : "ever"} (expected within ${maxAgeHours < 1 ? `${Math.round(maxAgeHours * 60)} minutes` : `${maxAgeHours} hours`})`);
    }
    if (ageHours > maxAgeHours) {
      console.log(
        `${file}: last success was ${run ? `${ageHours.toFixed(1)}h ago` : "never"} — exceeds ${maxAgeHours}h, ${DRY_RUN ? "would trigger (--dry-run)" : "triggering now"}.`
      );
      if (!DRY_RUN) await triggerWorkflow(file);
      triggeredAny = true;
    } else {
      console.log(`${file}: last success ${ageHours.toFixed(1)}h ago — within ${maxAgeHours}h, OK.`);
    }
  }

  if (!triggeredAny) {
    console.log("All watched workflows are current. Nothing to do.");
  }

  if (stuck.length) {
    fs.writeFileSync("watchdog-stuck.txt", stuck.map((line) => `${line}\n`).join(""));
    for (const line of stuck) console.log(`::error::Stuck: ${line}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
