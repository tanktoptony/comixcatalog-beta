// fetchStoryArc.js — fetch a ComicVine story arc, upsert it + its issues,
// and best-effort-resolve each issue to a local gcd_issue_id.
//
// Usage:
//   node scripts/fetchStoryArc.js --arc=42178                  → X-Cutioner's Song
//   node scripts/fetchStoryArc.js --arc=42178 --dry-run         → no DB writes
//
// Why two resolution paths:
//   A) canonical_covers.external_issue_id (= CV issue id) is the cleanest
//      bridge — exact CV id match → exact issue. But we've only ingested
//      ~7500 series' worth of covers, so most issues won't have a row here.
//   B) Parse the CV site_detail_url slug. Format:
//        "<series-slug>-<issue-number>-<issue-title-slug>"
//      e.g. "the-uncanny-x-men-294-x-cutioners-song-part-one-th"
//      → series-slug "the-uncanny-x-men", issue # "294"
//      Normalize the series-slug and match against series.title_normalized,
//      then look up gcd_issues by (series_gcd_id, issue_number).
//
// Both paths leave gcd_issue_id NULL if no match — that's fine, the row
// still goes in so the UI can show "this issue is in the arc but we don't
// have it catalogued yet."

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });

import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    })
);

const ARC_ID = args.arc ? Number(args.arc) : null;
const DRY_RUN = Boolean(args["dry-run"]);

if (!ARC_ID || !Number.isInteger(ARC_ID)) {
  console.error("Usage: node scripts/fetchStoryArc.js --arc=<cv_arc_id> [--dry-run]");
  process.exit(2);
}

const CV_KEY = process.env.COMICVINE_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CV_HEADERS = { "User-Agent": "ComixCatalog/1.0 (story arc ingest)" };

function normTitle(value) {
  // Match `series.title_normalized` semantics: lowercase, strip non-alnum.
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCvSlug(siteUrl) {
  // Pull the slug segment from a URL like
  //   https://comicvine.gamespot.com/<slug>/4000-<id>/
  if (!siteUrl) return null;
  const m = siteUrl.match(/comicvine\.gamespot\.com\/([^/]+)\/\d+-\d+/);
  if (!m) return null;
  const slug = m[1];

  // The first purely-numeric segment (after the first one) is the issue #.
  // We start at index 1 because the issue # never sits at position 0 — there
  // is always at least one series-name segment first.
  const parts = slug.split("-");
  let issueIdx = -1;
  for (let i = 1; i < parts.length; i++) {
    if (/^\d+(?:\.\d+)?$/.test(parts[i])) {
      issueIdx = i;
      break;
    }
  }
  if (issueIdx === -1) return { slug, seriesSlug: slug, issueNumber: null };

  return {
    slug,
    seriesSlug: parts.slice(0, issueIdx).join("-"),
    issueNumber: parts[issueIdx],
  };
}

async function fetchArc(arcId) {
  const url = `https://comicvine.gamespot.com/api/story_arc/4045-${arcId}/?api_key=${CV_KEY}&format=json`;
  const res = await fetch(url, { headers: CV_HEADERS });
  const json = await res.json();
  if (json.status_code !== 1) {
    throw new Error(`CV API error (status_code=${json.status_code}): ${json.error}`);
  }
  return json.results;
}

async function run() {
  console.log(`Fetching CV story arc ${ARC_ID}…`);
  const arc = await fetchArc(ARC_ID);
  console.log(`  ${arc.name}  (publisher: ${arc.publisher?.name ?? "?"})`);
  console.log(`  ${arc.issues?.length ?? 0} issues in arc`);

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // ── Resolution prep ────────────────────────────────────────────────────
  // Pull all canonical_covers rows for these CV issue ids in one query so we
  // can resolve in-memory rather than N round-trips.
  const cvIssueIds = (arc.issues || []).map((i) => i.id);
  const ccByCvId = new Map();
  if (cvIssueIds.length > 0) {
    const { data: ccRows } = await sb
      .from("canonical_covers")
      .select("external_issue_id, series_title, issue_number")
      .in("external_issue_id", cvIssueIds.map(String));
    for (const r of ccRows ?? []) {
      ccByCvId.set(String(r.external_issue_id), r);
    }
  }

  // Pre-parse each issue's slug to know what series titles we'll need to
  // resolve, then pull the matching series rows in one query.
  const parsed = (arc.issues || []).map((i, idx) => ({
    cv_issue_id: i.id,
    cv_issue_name: i.name ?? null,
    cv_site_url: i.site_detail_url ?? null,
    sort_order: idx,
    slug: parseCvSlug(i.site_detail_url),
  }));

  const slugSeriesNormalized = [...new Set(
    parsed.map((p) => p.slug?.seriesSlug ? normTitle(p.slug.seriesSlug) : null).filter(Boolean)
  )];

  // Fetch series rows whose title_normalized matches any parsed slug exactly,
  // OR whose title_normalized STARTS WITH our slug (handles the truncated-slug
  // case where CV cut "the-uncanny-x-men-294-x-cutioners-song-part-one-th" —
  // the series part is the prefix). Limit to series with gcd_id so we can
  // chain to gcd_issues.
  const seriesByNorm = new Map(); // norm → [series rows]
  if (slugSeriesNormalized.length > 0) {
    // ilike OR-list. Use exact match to avoid pulling huge result sets.
    const orList = slugSeriesNormalized.map((n) => `title_normalized.eq.${n}`).join(",");
    const { data: ser } = await sb
      .from("series")
      .select("gcd_id, title, title_normalized, year_start_cached, year_end_cached")
      .or(orList)
      .not("gcd_id", "is", null);
    for (const s of ser ?? []) {
      const key = s.title_normalized;
      if (!seriesByNorm.has(key)) seriesByNorm.set(key, []);
      seriesByNorm.get(key).push(s);
    }
  }

  // ── Resolve each issue ─────────────────────────────────────────────────
  let viaCanonical = 0, viaSlug = 0, unmatched = 0;
  const rows = [];

  for (const p of parsed) {
    let gcd_issue_id = null;
    let series_title = null;
    let issue_number = null;

    // Path A — canonical_covers.external_issue_id direct match.
    const cc = ccByCvId.get(String(p.cv_issue_id));
    if (cc) {
      series_title = cc.series_title;
      issue_number = cc.issue_number;
      // Resolve to gcd_id by series_title + issue_number against gcd_issues.
      // We need the series's gcd_id first. Use series table to find it.
      const { data: serRow } = await sb
        .from("series")
        .select("gcd_id")
        .eq("title", cc.series_title)
        .not("gcd_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (serRow?.gcd_id) {
        const { data: gcdRow } = await sb
          .from("gcd_issues")
          .select("gcd_id")
          .eq("series_gcd_id", serRow.gcd_id)
          .eq("issue_number", cc.issue_number)
          .limit(1)
          .maybeSingle();
        if (gcdRow?.gcd_id) {
          gcd_issue_id = gcdRow.gcd_id;
          viaCanonical++;
        }
      }
    }

    // Path B — slug parse, only if path A didn't yield gcd_issue_id.
    if (gcd_issue_id == null && p.slug?.seriesSlug && p.slug?.issueNumber) {
      const seriesNorm = normTitle(p.slug.seriesSlug);
      issue_number = p.slug.issueNumber;
      const candidates = seriesByNorm.get(seriesNorm) ?? [];
      // For multi-volume titles, prefer the volume whose year range plausibly
      // contains the arc's era. We don't have the arc's year directly, so use
      // the publisher and pick the earliest-running volume as a fallback.
      let bestSeries = null;
      if (candidates.length === 1) {
        bestSeries = candidates[0];
      } else if (candidates.length > 1) {
        // Pick the one with the most plausible year span — just take the
        // earliest start year that matches. Better disambiguation is
        // possible once we have the arc's first_appeared_in_issue year.
        bestSeries = candidates.reduce((a, b) =>
          (a.year_start_cached ?? 9999) <= (b.year_start_cached ?? 9999) ? a : b
        );
      }
      if (bestSeries) {
        series_title = bestSeries.title;
        const { data: gcdRow } = await sb
          .from("gcd_issues")
          .select("gcd_id")
          .eq("series_gcd_id", bestSeries.gcd_id)
          .eq("issue_number", issue_number)
          .limit(1)
          .maybeSingle();
        if (gcdRow?.gcd_id) {
          gcd_issue_id = gcdRow.gcd_id;
          viaSlug++;
        }
      }
    }

    if (gcd_issue_id == null) unmatched++;

    rows.push({
      cv_issue_id: p.cv_issue_id,
      cv_issue_name: p.cv_issue_name,
      cv_site_url: p.cv_site_url,
      gcd_issue_id,
      series_title,
      issue_number,
      sort_order: p.sort_order,
    });
  }

  console.log(`\nResolution summary:`);
  console.log(`  via canonical_covers: ${viaCanonical}`);
  console.log(`  via slug parse:       ${viaSlug}`);
  console.log(`  unmatched:            ${unmatched}`);

  // Per-row report
  console.log(`\nPer-issue:`);
  for (const r of rows) {
    const tag = r.gcd_issue_id ? `gcd-${r.gcd_issue_id}` : "UNMATCHED";
    console.log(`  cv-${r.cv_issue_id}  [${tag}]  ${r.series_title ?? "?"}  #${r.issue_number ?? "?"}  — ${r.cv_issue_name ?? ""}`);
  }

  if (DRY_RUN) {
    console.log(`\n--dry-run — no DB writes.`);
    return;
  }

  // ── Upsert arc + issues ────────────────────────────────────────────────
  const arcUpsert = {
    cv_id: arc.id,
    name: arc.name,
    deck: arc.deck ?? null,
    description: arc.description ?? null,
    publisher_name: arc.publisher?.name ?? null,
    cv_publisher_id: arc.publisher?.id ?? null,
    image_url: arc.image?.original_url ?? arc.image?.medium_url ?? null,
    cv_count_issues: arc.count_of_isssue_appearances ?? arc.count_of_issue_appearances ?? rows.length,
    fetched_at: new Date().toISOString(),
  };

  const { data: arcRow, error: arcErr } = await sb
    .from("story_arcs")
    .upsert(arcUpsert, { onConflict: "cv_id" })
    .select("id, cv_id, name")
    .single();
  if (arcErr) throw arcErr;
  console.log(`\nUpserted arc → ${arcRow.id} (cv-${arcRow.cv_id})`);

  const issueRows = rows.map((r) => ({ story_arc_id: arcRow.id, ...r }));
  const { error: saiErr } = await sb
    .from("story_arc_issues")
    .upsert(issueRows, { onConflict: "story_arc_id,cv_issue_id" });
  if (saiErr) throw saiErr;
  console.log(`Upserted ${issueRows.length} arc-issue rows.`);

  console.log(`\nDone. Match rate: ${viaCanonical + viaSlug}/${rows.length} (${Math.round(100 * (viaCanonical + viaSlug) / rows.length)}%)`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
