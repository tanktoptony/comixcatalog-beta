const DEFAULT_HEALTH_URL = "https://www.comixcatalog.com/api/health";
const HOME_URL = "https://www.comixcatalog.com/";
const RETRY_DELAY_MS = 20_000;
const REQUEST_TIMEOUT_MS = 8_000;
const REMINDER_MS = 6 * 60 * 60 * 1_000;
export const TEST_RUN_TITLE = "Uptime check (alert test)";

function elapsed(ms) {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1_000))}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

async function timedCheck({ name, url, fetchImpl }) {
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const ms = Date.now() - startedAt;
    if (response.status !== 200) return { name, ok: false, ms, detail: `HTTP ${response.status}` };
    if (name === "health") {
      const body = await response.json();
      if (body?.ok !== true) return { name, ok: false, ms, detail: "unhealthy response" };
    }
    return { name, ok: true, ms };
  } catch (error) {
    return { name, ok: false, ms: Date.now() - startedAt, detail: error?.name === "TimeoutError" ? "timeout" : "request failed" };
  }
}

async function checkWithRetry(options, sleep) {
  const first = await timedCheck(options);
  if (first.ok) return { ...first, attempts: 1 };
  await sleep(RETRY_DELAY_MS);
  const second = await timedCheck(options);
  return { ...second, attempts: 2 };
}

async function githubRuns({ fetchImpl, repo, token, page = 1 }) {
  const url = `https://api.github.com/repos/${repo}/actions/workflows/uptime-check.yml/runs?per_page=2&page=${page}`;
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GitHub runs request failed: HTTP ${response.status}`);
  return (await response.json()).workflow_runs ?? [];
}

async function previousRuns({ fetchImpl, repo, token, currentRunId }) {
  const history = [];
  for (let page = 1; page <= 50; page += 1) {
    const runs = await githubRuns({ fetchImpl, repo, token, page });
    // Alert-path test runs are not real up/down state.
    const completed = runs.filter(
      (run) => String(run.id) !== String(currentRunId) && run.conclusion && run.display_title !== TEST_RUN_TITLE,
    );
    history.push(...completed);
    if (runs.length < 2 || history.some((run) => run.conclusion === "success")) break;
  }
  return history;
}

export function chooseNotification({ isUp, history, now }) {
  const previous = history[0] ?? null;
  const wasUp = !previous || previous.conclusion === "success";

  if (!isUp && wasUp) return { type: "down", outageMs: 0 };
  if (isUp && !wasUp) {
    const firstFailure = [...history]
      .reverse()
      .find((run, index, runs) => run.conclusion !== "success" && (index === 0 || runs[index - 1].conclusion === "success"));
    return { type: "recovered", outageMs: now - new Date(firstFailure?.created_at ?? previous.created_at).getTime() };
  }
  if (!isUp && !wasUp) {
    const lastSuccess = history.find((run) => run.conclusion === "success");
    const outageStart = lastSuccess ? new Date(lastSuccess.created_at).getTime() : new Date(history.at(-1).created_at).getTime();
    const previousAt = new Date(previous.created_at).getTime();
    if (Math.floor((now - outageStart) / REMINDER_MS) > Math.floor((previousAt - outageStart) / REMINDER_MS)) {
      return { type: "reminder", outageMs: now - outageStart };
    }
  }
  return null;
}

export function buildEmail(notification, checks) {
  const failures = checks.filter((check) => !check.ok);
  const timings = checks.map((check) => `${check.name}: ${check.ms}ms (${check.ok ? "ok" : check.detail}, ${check.attempts} attempt${check.attempts === 1 ? "" : "s"})`).join("\n");
  if (notification.type === "recovered") {
    return { subject: "ComixCatalog Recovered", text: `ComixCatalog recovered after approximately ${elapsed(notification.outageMs)}.\n\n${timings}` };
  }
  const prefix = notification.type === "reminder" ? `ComixCatalog is still down after approximately ${elapsed(notification.outageMs)}.` : "ComixCatalog is DOWN.";
  return { subject: "ComixCatalog is DOWN", text: `${prefix}\nFailing check${failures.length === 1 ? "" : "s"}: ${failures.map((check) => check.name).join(", ")}\n\n${timings}` };
}

async function sendEmail({ fetchImpl, apiKey, from, to, email }) {
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: email.subject, text: email.text }),
  });
  if (!response.ok) throw new Error(`Resend request failed: HTTP ${response.status}`);
}

export async function runUptimeCheck({
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now(),
  env = process.env,
  send = sendEmail,
} = {}) {
  for (const name of ["GITHUB_REPOSITORY", "GITHUB_TOKEN", "RESEND_API_KEY", "RESEND_FROM_EMAIL", "REPORTS_NOTIFY_EMAIL"]) {
    if (!env[name]) throw new Error(`${name} is required`);
  }
  const [health, home] = await Promise.all([
    checkWithRetry({ name: "health", url: env.UPTIME_URL || DEFAULT_HEALTH_URL, fetchImpl }, sleep),
    checkWithRetry({ name: "homepage", url: HOME_URL, fetchImpl }, sleep),
  ]);
  const checks = [health, home];
  const isUp = checks.every((check) => check.ok);
  // A UPTIME_URL override is an alert-path test: email on failure, never read or
  // shape the real up/down history.
  const testMode = Boolean(env.UPTIME_URL);
  const notification = testMode
    ? (isUp ? null : { type: "down", outageMs: 0 })
    : chooseNotification({
        isUp,
        history: await previousRuns({ fetchImpl, repo: env.GITHUB_REPOSITORY, token: env.GITHUB_TOKEN, currentRunId: env.GITHUB_RUN_ID }),
        now,
      });
  let email = null;
  if (notification) {
    email = buildEmail(notification, checks);
    if (testMode) email = { ...email, subject: `[TEST] ${email.subject}` };
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM_EMAIL, to: env.REPORTS_NOTIFY_EMAIL, email });
  }
  return { isUp, checks, notification, email };
}

export async function runCli(options = {}, runtime = process, log = console) {
  try {
    const result = await runUptimeCheck(options);
    log.log(JSON.stringify({ isUp: result.isUp, checks: result.checks, notification: result.notification }));
    if (!result.isUp) runtime.exitCode = 1;
    return result;
  } catch (error) {
    log.error(error);
    runtime.exitCode = 1;
    return null;
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href;
if (invokedDirectly) {
  await runCli();
}
