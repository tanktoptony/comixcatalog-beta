// Live smoke tests — hit the REAL deployed site over HTTPS and assert on
// real behavior, not mocks. Built 2026-08-27 after a real regression slipped
// through both ESLint and a full local production build: the GCD-less-series
// fix (PR #43) correctly showed issue counts and covers, but Next/Prev
// navigation was silently broken by an encoding mismatch that only showed up
// by actually calling the deployed endpoint (PR #44 fixed it). Lint and a
// build prove the code compiles; they say nothing about whether the feature
// actually behaves once real data flows through it. These tests exist to
// catch that class of bug automatically instead of by hand, one incident at
// a time.
//
// This is deliberately separate from src/lib/coverMatch.test.js, which is
// fast, offline, and mocked — safe to run on every PR. These tests do real
// network I/O against a live deployment (production by default, or a Vercel
// preview URL via SMOKE_BASE_URL) and read real production data, so they're
// an on-demand check, not a PR gate: run with `npm run test:smoke` after a
// deploy, or point at a preview URL before merging something high-risk.
// Widen this file as new regression classes turn up — that's the point.
//
// Usage:
//   npm run test:smoke
//   SMOKE_BASE_URL=https://your-preview-url.vercel.app npm run test:smoke

import assert from "node:assert/strict";
import test from "node:test";

const BASE_URL = (process.env.SMOKE_BASE_URL || "https://www.comixcatalog.com").replace(/\/$/, "");

async function getJson(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ── Site availability ──────────────────────────────────────────────────
test("homepage loads", async () => {
  const res = await fetch(BASE_URL);
  assert.equal(res.status, 200);
});

test("search page loads", async () => {
  const res = await fetch(`${BASE_URL}/search`);
  assert.equal(res.status, 200);
});

// ── GCD-less series (fixed 2026-08-27, PR #43/#44) ────────────────────────
// Swamp Thing 1989 (DC, 2026 relaunch): a real series with no gcd_series/
// gcd_issues row at all, and real covers already ingested from ComicVine.
// This exact case showed "0 issues" before PR #43, and had null prev/next
// on every issue page before PR #44 — the two things this section asserts.
test("GCD-less series renders its real issues, not zero", async () => {
  const { status, body } = await getJson(
    "/api/series/c8a15bf6-c9c3-46db-95ae-81f1951159e2"
  );
  assert.equal(status, 200);
  assert.ok(body.series.issue_count > 0, "expected real issues, got 0");
  assert.ok(body.series.featured_cover, "expected a real cover URL");

  // The cover file itself must actually be reachable, not just referenced —
  // a broken storage path is worse than no cover, it looks like a bug
  // instead of an honest gap.
  const coverRes = await fetch(body.series.featured_cover);
  assert.equal(coverRes.status, 200, "featured cover file is not reachable");
});

test("GCD-less issue navigation (prev/next) actually works", async () => {
  // Issue #2 of a 4-issue run — must have both a prev (#1) and a next (#3).
  const { status, body } = await getJson(
    "/api/issues/cvt-Swamp%20Thing%201989-2"
  );
  assert.equal(status, 200);
  assert.ok(body.issue.cover, "expected a real cover URL");
  assert.ok(body.issue.prev_issue, "prev_issue should not be null mid-run");
  assert.equal(body.issue.prev_issue.issue_number, "1");
  assert.ok(body.issue.next_issue, "next_issue should not be null mid-run");
  assert.equal(body.issue.next_issue.issue_number, "3");
});

// ── Orphan-issue series (fixed 2026-08-27, PR #37/#38) ─────────────────────
// Absolute Batman: GCD's own metadata only ever synced issue #1 of a real
// 23-issue run; the other 22 are "orphan" covers correctly linked via
// series_gcd_id but with no gcd_issues row. Regression-guards the fix that
// surfaces them, and the id-navigation fix that made them clickable.
test("orphan-issue series shows the real full run, not GCD's stale count", async () => {
  const { status, body } = await getJson(
    "/api/series/d9b5588f-ae37-4f45-81ea-f9bebfd34f8e"
  );
  assert.equal(status, 200);
  assert.ok(
    body.series.issue_count >= 23,
    `expected >=23 issues (ComicVine's real count), got ${body.series.issue_count}`
  );
});

test("orphan issue resolves and navigates correctly", async () => {
  const { status, body } = await getJson("/api/issues/cv-226633-2");
  assert.equal(status, 200);
  assert.ok(body.issue.cover, "expected a real cover URL");
  assert.ok(body.issue.prev_issue, "prev_issue should not be null mid-run");
  assert.ok(body.issue.next_issue, "next_issue should not be null mid-run");
});
