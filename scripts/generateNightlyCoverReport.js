// Nightly visual report of covers ingested in the last 24 hours.
//
// Built 2026-08-26 alongside the hourly cover-ingest.yml redesign — the
// pipeline now runs continuously, so this is the "what actually happened"
// checkpoint: a real thumbnail grid of what got attached to which series
// and issue, not just a row count. An explicit zero-covers state is the
// point, not an edge case — a silent zero-cover day going unnoticed for
// weeks is exactly the failure this whole shore-up was responding to.
//
// Usage: node scripts/generateNightlyCoverReport.js [--hours=24]
//
// Output: reports/covers-YYYY-MM-DD.html (dated snapshot) and
// reports/covers-latest.html (always the most recent one, for a stable link).

import dotenv from "dotenv";
import path from "path";
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    })
);
const HOURS = Number(args.hours ?? 24);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Same retry pattern as refreshSeriesSearchCache.js — canonical_covers is
// a big, actively-written table (hourly ingest), and a scan across the
// last 24h can occasionally hit a transient 57014 statement timeout.
// Returns `data` directly, not { data, error }.
const TRANSIENT_CODES = new Set(["57014", "53300", "PGRST116", "ETIMEDOUT"]);
async function runWithRetry(label, thunk, maxAttempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { data, error } = await thunk();
      if (!error) return data;
      const code = error.code || "";
      const msg = (error.message || "").toLowerCase();
      const transient =
        TRANSIENT_CODES.has(code) || msg.includes("statement timeout") || msg.includes("fetch failed") || msg.includes("network");
      if (!transient || attempt === maxAttempts) throw error;
      lastError = error;
    } catch (err) {
      const msg = (err?.message || "").toLowerCase();
      const transient = msg.includes("fetch failed") || msg.includes("network") || msg.includes("timeout");
      if (!transient || attempt === maxAttempts) throw err;
      lastError = err;
    }
    const backoffMs = [1000, 3000, 8000][attempt - 1] ?? 8000;
    console.log(`  ⚠ ${label} transient error (attempt ${attempt}/${maxAttempts}): ${lastError?.message ?? lastError?.code ?? "?"} — retrying in ${backoffMs}ms`);
    await new Promise((r) => setTimeout(r, backoffMs));
  }
  throw lastError;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function run() {
  const since = new Date(Date.now() - HOURS * 60 * 60 * 1000).toISOString();
  const reportDate = new Date().toISOString().slice(0, 10);

  // PostgREST silently caps any query without explicit .range() at 1000
  // rows — bitten twice already this session (refreshSeriesSearchCache.js,
  // generateCoverGapTargets.js). Paginate in 1000-row pages until a short
  // page signals the end.
  const covers = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const page = await runWithRetry(`covers page (from=${from})`, () =>
      supabase
        .from("canonical_covers")
        .select("series_title, issue_number, publisher, storage_path, created_at, cover_date")
        .gte("created_at", since)
        .not("storage_path", "is", null)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1)
    );
    covers.push(...page);
    if (page.length < PAGE) break;
  }

  // runWithRetry returns `data`, but a head:true/count:'exact' query carries
  // its result in `count`, not `data` (which is null) — retry this one
  // manually rather than stretch the helper to cover both shapes.
  let allTimeTotal = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const { count, error } = await supabase
      .from("canonical_covers")
      .select("id", { count: "exact", head: true })
      .not("storage_path", "is", null);
    if (!error) {
      allTimeTotal = count;
      break;
    }
    if (attempt === 4) {
      console.error("All-time total query failed:", error);
      process.exit(1);
    }
    const backoffMs = [1000, 3000, 8000][attempt - 1];
    console.log(`  ⚠ all-time total count transient error (attempt ${attempt}/4): ${error.message} — retrying in ${backoffMs}ms`);
    await new Promise((r) => setTimeout(r, backoffMs));
  }

  const seriesSet = new Set(covers.map((c) => c.series_title));
  console.log(`New covers in the last ${HOURS}h: ${covers.length}`);
  console.log(`Series touched: ${seriesSet.size}`);
  console.log(`All-time total: ${allTimeTotal}`);

  // Group by series so a single run's issues appear together in the grid,
  // largest runs first (most visually interesting / highest-impact first).
  const bySeriesMap = new Map();
  for (const c of covers) {
    if (!bySeriesMap.has(c.series_title)) bySeriesMap.set(c.series_title, []);
    bySeriesMap.get(c.series_title).push(c);
  }
  const bySeries = [...bySeriesMap.entries()].sort((a, b) => b[1].length - a[1].length);

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicUrl = (storagePath) =>
    `${SUPABASE_URL}/storage/v1/object/public/canonical-covers/${storagePath}`;

  // Cap full <img> tags per series group. A normal hourly-cadence night
  // adds a handful to a few hundred covers, but a catch-up day (or the
  // backlog draining) can produce 1,000+ in one report — loading that many
  // images in a single page in one shot is genuinely unreliable in a
  // browser (connection limits, stalls), and shows up as "missing" images
  // that aren't actually missing. The stat tiles and section headers still
  // reflect the true full count regardless of this cap.
  const MAX_IMAGES_PER_GROUP = 24;
  const groupsHtml = bySeries
    .map(([seriesTitle, items]) => {
      const shown = items.slice(0, MAX_IMAGES_PER_GROUP);
      const hiddenCount = items.length - shown.length;
      const cardsHtml = shown
        .map((c) => {
          const cover = c.cover_date ? String(c.cover_date).slice(0, 7) : "";
          return `
        <figure class="cover-card">
          <img src="${escapeHtml(publicUrl(c.storage_path))}" alt="${escapeHtml(seriesTitle)} #${escapeHtml(c.issue_number)}" loading="lazy" width="220" height="330" />
          <figcaption>
            <span class="issue-num">#${escapeHtml(c.issue_number)}</span>
            ${cover ? `<span class="cover-date">${escapeHtml(cover)}</span>` : ""}
          </figcaption>
        </figure>`;
        })
        .join("");
      const moreHtml = hiddenCount > 0
        ? `<div class="more-tile">+${hiddenCount} more</div>`
        : "";

      const publisher = items[0].publisher || "Unknown publisher";
      return `
      <section class="series-group">
        <h2>${escapeHtml(seriesTitle)} <span class="publisher-tag">${escapeHtml(publisher)}</span> <span class="count-tag">${items.length} issue${items.length === 1 ? "" : "s"}</span></h2>
        <div class="cover-grid">${cardsHtml}${moreHtml}</div>
      </section>`;
    })
    .join("");

  const emptyStateHtml = `
      <div class="empty-state">
        <p class="empty-headline">No new covers landed in the last ${HOURS} hours.</p>
        <p class="empty-body">That's a real signal, not a gap in the report — cover-ingest.yml runs hourly, so a full ${HOURS}-hour silence means every lane either exhausted its targets or something's actually broken. Check the workflow's recent runs on GitHub Actions.</p>
      </div>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Cover Ingest Report — ${reportDate}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root {
    --cc-bg: #090c11;
    --cc-surface: #11161d;
    --cc-surface-2: #171d26;
    --cc-line: #2b3444;
    --cc-text: #eef2f7;
    --cc-text-muted: #a4aebb;
    --cc-gold: #d8b04b;
    --cc-blue: #1f4ea8;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--cc-bg);
    color: var(--cc-text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
    padding: 32px 24px 64px;
  }
  .wrap { max-width: 1100px; margin: 0 auto; }
  header { margin-bottom: 28px; }
  .kicker {
    font-size: 0.72rem; font-weight: 700; letter-spacing: 0.09em;
    text-transform: uppercase; color: var(--cc-gold); margin: 0 0 8px;
  }
  h1 { font-size: 1.6rem; margin: 0 0 4px; }
  .subtitle { color: var(--cc-text-muted); font-size: 0.9rem; margin: 0; }

  .stat-row { display: flex; gap: 14px; margin: 24px 0 36px; flex-wrap: wrap; }
  .stat-tile {
    flex: 1 1 160px; background: var(--cc-surface); border: 1px solid var(--cc-line);
    border-radius: 12px; padding: 16px 18px;
  }
  .stat-num { font-size: 1.7rem; font-weight: 800; font-variant-numeric: tabular-nums; }
  .stat-label { font-size: 0.78rem; color: var(--cc-text-muted); margin-top: 2px; }

  .series-group { margin-bottom: 32px; }
  .series-group h2 {
    font-size: 1.05rem; margin: 0 0 12px; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
  }
  .publisher-tag, .count-tag {
    font-size: 0.72rem; font-weight: 600; color: var(--cc-text-muted);
    background: var(--cc-surface-2); border: 1px solid var(--cc-line);
    padding: 2px 8px; border-radius: 999px;
  }
  .count-tag { color: var(--cc-gold); border-color: rgba(216,176,75,0.35); }

  .cover-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 12px;
  }
  .cover-card {
    margin: 0; background: var(--cc-surface); border: 1px solid var(--cc-line);
    border-radius: 8px; overflow: hidden;
  }
  .cover-card img { width: 100%; aspect-ratio: 2/3; object-fit: cover; display: block; background: var(--cc-surface-2); }
  .cover-card figcaption {
    display: flex; justify-content: space-between; padding: 6px 8px;
    font-size: 0.72rem; color: var(--cc-text-muted);
  }
  .issue-num { color: var(--cc-text); font-weight: 700; }
  .more-tile {
    display: flex; align-items: center; justify-content: center;
    aspect-ratio: 2/3; border: 1px dashed var(--cc-line); border-radius: 8px;
    color: var(--cc-text-muted); font-size: 0.82rem; font-weight: 600;
  }

  .empty-state {
    background: var(--cc-surface); border: 1px dashed var(--cc-line);
    border-radius: 12px; padding: 32px 24px; text-align: center;
  }
  .empty-headline { font-size: 1.1rem; font-weight: 700; margin: 0 0 8px; }
  .empty-body { color: var(--cc-text-muted); font-size: 0.88rem; max-width: 520px; margin: 0 auto; line-height: 1.5; }

  footer { margin-top: 40px; color: var(--cc-text-muted); font-size: 0.78rem; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <p class="kicker">Cover ingest · nightly report</p>
      <h1>${reportDate}</h1>
      <p class="subtitle">Covers attached to the database in the last ${HOURS} hours, grouped by series.</p>
    </header>

    <div class="stat-row">
      <div class="stat-tile">
        <div class="stat-num">${covers.length}</div>
        <div class="stat-label">New covers (${HOURS}h)</div>
      </div>
      <div class="stat-tile">
        <div class="stat-num">${seriesSet.size}</div>
        <div class="stat-label">Series touched (${HOURS}h)</div>
      </div>
      <div class="stat-tile">
        <div class="stat-num">${allTimeTotal.toLocaleString()}</div>
        <div class="stat-label">All-time total covers</div>
      </div>
    </div>

    ${covers.length === 0 ? emptyStateHtml : groupsHtml}

    <footer>Generated ${new Date().toISOString()} by scripts/generateNightlyCoverReport.js</footer>
  </div>
</body>
</html>
`;

  const reportsDir = path.resolve(__dirname, "..", "reports");
  mkdirSync(reportsDir, { recursive: true });
  const datedPath = path.join(reportsDir, `covers-${reportDate}.html`);
  const latestPath = path.join(reportsDir, "covers-latest.html");
  writeFileSync(datedPath, html);
  writeFileSync(latestPath, html);
  console.log(`\nWrote ${datedPath}`);
  console.log(`Wrote ${latestPath}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
