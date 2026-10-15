import test from "node:test";
import assert from "node:assert/strict";
import { runCli, runUptimeCheck } from "./uptimeCheck.js";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const REQUIRED_ENV = {
  GITHUB_REPOSITORY: "owner/repo",
  GITHUB_TOKEN: "github-token",
  GITHUB_RUN_ID: "100",
  RESEND_API_KEY: "resend-token",
  RESEND_FROM_EMAIL: "alerts@example.com",
  REPORTS_NOTIFY_EMAIL: "tony@example.com",
};

function response(status, body = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function harness({ history, health = response(200, { ok: true }), home = response(200) }) {
  const emails = [];
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.includes("api.github.com")) return response(200, { workflow_runs: history });
    if (url === "https://www.comixcatalog.com/") return home;
    return health;
  };
  return {
    emails,
    urls,
    run: (overrides = {}) => runUptimeCheck({
      fetchImpl,
      sleep: async () => {},
      now: NOW,
      env: { ...REQUIRED_ENV, ...overrides },
      send: async ({ email }) => emails.push(email),
    }),
  };
}

test("up to up stays silent", async () => {
  const app = harness({ history: [{ id: 99, conclusion: "success", created_at: "2026-10-15T11:50:00Z" }] });
  const result = await app.run();
  assert.equal(result.isUp, true);
  assert.equal(result.notification, null);
  assert.equal(app.emails.length, 0);
});

test("up to down builds and sends a DOWN email", async () => {
  const app = harness({
    history: [{ id: 99, conclusion: "success", created_at: "2026-10-15T11:50:00Z" }],
    health: response(503, { ok: false }),
  });
  const result = await app.run();
  assert.equal(result.isUp, false);
  assert.equal(result.notification.type, "down");
  assert.equal(app.emails[0].subject, "ComixCatalog is DOWN");
  assert.match(app.emails[0].text, /health: .*HTTP 503, 2 attempts/);
});

test("down to down stays silent until a six-hour boundary", async () => {
  const history = [
    { id: 99, conclusion: "failure", created_at: "2026-10-15T11:50:00Z" },
    { id: 98, conclusion: "success", created_at: "2026-10-15T06:10:00Z" },
  ];
  const app = harness({ history, health: response(503, { ok: false }) });
  assert.equal((await app.run()).notification, null);
  assert.equal(app.emails.length, 0);

  history[0].created_at = "2026-10-15T11:40:00Z";
  history[1].created_at = "2026-10-15T05:50:00Z";
  const reminder = await app.run();
  assert.equal(reminder.notification.type, "reminder");
  assert.equal(app.emails.at(-1).subject, "ComixCatalog is DOWN");
});

test("down to up sends a recovery email with outage length", async () => {
  const app = harness({ history: [
    { id: 99, conclusion: "failure", created_at: "2026-10-15T11:50:00Z" },
    { id: 98, conclusion: "failure", created_at: "2026-10-15T11:40:00Z" },
    { id: 97, conclusion: "success", created_at: "2026-10-15T11:30:00Z" },
  ] });
  const result = await app.run();
  assert.equal(result.notification.type, "recovered");
  assert.equal(app.emails[0].subject, "ComixCatalog Recovered");
  assert.match(app.emails[0].text, /approximately 20m/);
});

test("unreachable UPTIME_URL produces a non-zero exit and DOWN email without changing homepage URL", async () => {
  const app = harness({ history: [{ id: 99, conclusion: "success", created_at: "2026-10-15T11:50:00Z" }] });
  const unreachable = "http://127.0.0.1:1/api/health";
  const baseFetch = async (url) => {
    app.urls.push(url);
    if (url === unreachable) throw new TypeError("fetch failed");
    if (url.includes("api.github.com")) return response(200, { workflow_runs: [{ id: 99, conclusion: "success", created_at: "2026-10-15T11:50:00Z" }] });
    return response(200);
  };
  const emails = [];
  const runtime = { exitCode: 0 };
  const result = await runCli({
    fetchImpl: baseFetch,
    sleep: async () => {},
    now: NOW,
    env: { ...REQUIRED_ENV, UPTIME_URL: unreachable },
    send: async ({ email }) => emails.push(email),
  }, runtime, { log: () => {}, error: () => {} });
  assert.equal(result.isUp, false);
  assert.equal(runtime.exitCode, 1);
  assert.equal(emails[0].subject, "[TEST] ComixCatalog is DOWN");
  assert.equal(app.urls.filter((url) => url === unreachable).length, 2);
  assert.equal(app.urls.filter((url) => url === "https://www.comixcatalog.com/").length, 1);
});

test("an alert test run emails [TEST] and never reads history", async () => {
  const app = harness({ history: [{ id: 99, conclusion: "success", created_at: "2026-10-15T11:50:00Z" }], health: response(503, { ok: false }) });
  const result = await app.run({ UPTIME_URL: "https://www.comixcatalog.com/api/health-does-not-exist" });
  assert.equal(result.notification.type, "down");
  assert.equal(app.emails[0].subject, "[TEST] ComixCatalog is DOWN");
  assert.equal(app.urls.some((url) => url.includes("api.github.com")), false);
});

test("a failed alert test in history does not trigger a fake Recovered", async () => {
  const app = harness({
    history: [
      { id: 99, conclusion: "failure", display_title: "Uptime check (alert test)", created_at: "2026-10-15T11:55:00Z" },
      { id: 98, conclusion: "success", display_title: "Uptime check", created_at: "2026-10-15T11:50:00Z" },
    ],
  });
  const result = await app.run();
  assert.equal(result.notification, null);
  assert.equal(app.emails.length, 0);
});
