#!/usr/bin/env node
// How fast are the main read endpoints? Calls each one N times against a
// base URL and prints p50/p95 per endpoint as a markdown table.
//
// This is the "before" number for the slop-remediation speed work (spec WS0
// and WS7). Every speed PR re-runs it with the same CASES and shows before
// and after, so don't edit CASES casually: a changed case breaks the
// comparison. Add new cases at the end instead.
//
//   node scripts/perfBaseline.js                       # production, 20 runs
//   node scripts/perfBaseline.js --runs=10 --out=reports/perf-x.md
//   node scripts/perfBaseline.js --base=https://<preview>.vercel.app
//
// Requests are sequential, never parallel: this points at production.
// Each request carries a cache-busting query param and no-cache headers so
// the number is the route's real work, not a CDN hit. The x-vercel-cache
// header is recorded anyway, so a HIT would show up in the table.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const BASE = arg("base", "https://www.comixcatalog.com").replace(/\/$/, "");
const RUNS = Number(arg("runs", "20"));
const OUT = arg("out", null);
const TIMEOUT_MS = 60000;

const hydrateIds = JSON.parse(fs.readFileSync(path.join(here, "perf", "hydrate-ids.json"), "utf8"));

// Fixed cases, chosen 2026-10-05 from production. Comments say what each is.
const CASES = [
  // Issue pages
  { label: "issue: Absolute Batman #1 (2024, 44 printings)", path: "/api/issues/gcd-2663120" },
  { label: "issue: Amazing Spider-Man #1 (1963)", path: "/api/issues/gcd-17568" },
  { label: "issue: Amazing Spider-Man #300 (1988, newsstand twin)", path: "/api/issues/gcd-44451" },
  // Series pages
  { label: "series: Amazing Spider-Man (1963, 650 issues)", path: "/api/series/d585a799-50f5-4127-98c3-0dfe2b13c968" },
  { label: "series: 28 Days Later (2010, 6 issues)", path: "/api/series/0498641f-a941-4a38-b955-6a874609559e" },
  // Search
  { label: "search: batman", path: "/api/search/series?q=batman" },
  { label: "search: x-o", path: "/api/search/series?q=x-o" },
  { label: "search: sandman", path: "/api/search/series?q=sandman" },
  // Library load: 500 real ASM (1963) issue ids
  {
    label: "library-hydrate: 500 ids",
    path: "/api/library-hydrate",
    method: "POST",
    body: { gcd_issue_ids: hydrateIds },
  },
  // Public profile: thrice347 (largest public library, 356 rows)
  { label: "public-profile: thrice347", path: "/api/public-profile?username=thrice347" },
  // Marketplace browse
  { label: "marketplace", path: "/api/marketplace" },
];

function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}

async function timeOnce(c, run) {
  const sep = c.path.includes("?") ? "&" : "?";
  const url = `${BASE}${c.path}${sep}_pb=${Date.now()}-${run}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      method: c.method || "GET",
      headers: {
        "cache-control": "no-cache",
        pragma: "no-cache",
        ...(c.body ? { "content-type": "application/json" } : {}),
      },
      body: c.body ? JSON.stringify(c.body) : undefined,
      signal: ctrl.signal,
      redirect: "manual",
    });
    // Read the whole body: time-to-last-byte is what the page waits for.
    const text = await res.text();
    const ms = performance.now() - t0;
    return {
      ms,
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      cache: res.headers.get("x-vercel-cache") || "-",
      bytes: text.length,
    };
  } catch (err) {
    return { ms: performance.now() - t0, ok: false, status: err.name === "AbortError" ? "timeout" : "error", cache: "-", bytes: 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const started = new Date();
  const rows = [];
  for (const c of CASES) {
    const samples = [];
    for (let run = 0; run < RUNS; run++) samples.push(await timeOnce(c, run));
    const okMs = samples.filter((s) => s.ok).map((s) => s.ms).sort((a, b) => a - b);
    const errors = samples.filter((s) => !s.ok);
    rows.push({
      label: c.label,
      n: samples.length,
      p50: pct(okMs, 50),
      p95: pct(okMs, 95),
      max: okMs.length ? okMs[okMs.length - 1] : null,
      errors: errors.length,
      errorStatuses: [...new Set(errors.map((e) => e.status))].join(","),
      hits: samples.filter((s) => /HIT|STALE/i.test(s.cache)).length,
      kb: ((samples.find((s) => s.ok)?.bytes || 0) / 1024).toFixed(1),
    });
    const r = rows[rows.length - 1];
    process.stderr.write(`${r.label}: p50 ${fmt(r.p50)} p95 ${fmt(r.p95)} errors ${r.errors}\n`);
  }

  const lines = [
    `# Endpoint timings`,
    ``,
    `Base: ${BASE} · ${RUNS} sequential runs per endpoint · started ${started.toISOString()}`,
    ``,
    `Time is to the last byte of the response, measured from this machine, with the CDN bypassed. Errors are non-2xx responses or timeouts (${TIMEOUT_MS / 1000}s) and are left out of the percentiles.`,
    ``,
    `| Endpoint | n | p50 | p95 | max | errors | CDN hits | size |`,
    `|---|--:|--:|--:|--:|--:|--:|--:|`,
    ...rows.map(
      (r) =>
        `| ${r.label} | ${r.n} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.max)} | ${r.errors}${r.errorStatuses ? ` (${r.errorStatuses})` : ""} | ${r.hits} | ${r.kb} KB |`
    ),
    ``,
  ];
  const md = lines.join("\n");
  if (OUT) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, md);
    process.stderr.write(`wrote ${OUT}\n`);
  } else {
    process.stdout.write(md);
  }
}

function fmt(ms) {
  if (ms == null) return "-";
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
