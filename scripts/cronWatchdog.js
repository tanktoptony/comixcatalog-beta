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
  // Mon+Thu cron (09:00 UTC), changed from Monday-only 2026-09-12 because
  // a once-a-week regen was getting fully consumed by hourly cover-ingest
  // runs in ~4 days. Grace window tightened to match: 5-day max age =
  // the ~3.5-day Mon/Thu interval + a day of slack, so a single missed
  // run gets caught by the next watchdog tick well before the following
  // scheduled day, instead of the old 8-day window (sized for weekly
  // cadence) sitting quiet through most of a dead week.
  { file: "weekly-refresh.yml", maxAgeHours: 24 * 5 },
  // Mon+Thu cron (08:00 UTC), same grace window.
  { file: "gap-probe.yml", maxAgeHours: 24 * 5 },
];

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

async function main() {
  let triggeredAny = false;

  for (const { file, maxAgeHours } of WATCHED) {
    const run = await lastSuccessfulRun(file);
    const ageHours = run
      ? (Date.now() - new Date(run.created_at).getTime()) / 3_600_000
      : Infinity;

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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
