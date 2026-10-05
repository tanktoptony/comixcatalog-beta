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

// ── Absolute Batman, the full monthly run ─────────────────────────────────
// History: in Aug 2026 GCD had synced only #1, so the full run was rebuilt
// from "orphan" ComicVine covers on series d9b5588f (PR #37/#38). By Oct
// 2026 GCD had the real monthly as series 216143 (page ddcf3771) with every
// issue, the covers attribute to it, and d9b5588f turned out to be GCD
// 226633: the 2025 COLLECTED EDITION. These tests now guard the monthly.
test("Absolute Batman monthly shows its full run", async () => {
  const { status, body } = await getJson(
    "/api/series/ddcf3771-89ff-45db-92a8-f52ed3f09e05"
  );
  assert.equal(status, 200);
  assert.ok(
    body.series.issue_count >= 23,
    `expected >=23 issues, got ${body.series.issue_count}`
  );
});

test("Absolute Batman #2 resolves with a cover and navigation", async () => {
  const { status, body } = await getJson("/api/issues/gcd-2674696");
  assert.equal(status, 200);
  assert.equal(body.issue.issue_number, "2");
  assert.ok(body.issue.cover, "expected a real cover URL");
  assert.equal(body.issue.prev_issue?.issue_number, "1");
  assert.equal(body.issue.next_issue?.issue_number, "3");
});

// ── Security: WS1 (2026-10-05) ────────────────────────────────────────────
// Adding a comic needs a signed-in user, checked before the body is read.
// The body here is empty on purpose: with the check missing the route
// answers 400 ("Invalid form submission"), so this fails without writing.
test("POST /api/comics without a token is refused with 401", async () => {
  const res = await fetch(`${BASE_URL}/api/comics`, { method: "POST" });
  assert.equal(res.status, 401);
});

// The homepage feed reads with the service role, so it must filter private
// accounts itself and label each row. Every row has a username (no private
// or nameless accounts) and a verb from the known set.
test("activity feed rows are labelled and come from named accounts", async () => {
  const { status, body } = await getJson("/api/activity");
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.activity));
  for (const row of body.activity) {
    assert.ok(["added", "wishlisted", "listed"].includes(row.verb), `bad verb: ${row.verb}`);
    assert.ok(row.profiles?.username, "row from an account with no username");
    assert.equal(row.profiles.is_public, undefined, "privacy flags must not be sent");
  }
});

// Library loads are batched by the client; the route refuses oversized calls.
test("library-hydrate refuses more than 2,000 ids", async () => {
  const ids = Array.from({ length: 2001 }, (_, i) => i + 1);
  const res = await fetch(`${BASE_URL}/api/library-hydrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gcd_issue_ids: ids }),
  });
  assert.equal(res.status, 413);
});
