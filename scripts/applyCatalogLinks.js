// One-shot: find confident catalog-link candidates and apply them.
//
// REWRITTEN to mirror auditCatalogLink.js + the safe collision behavior from
// /api/library/catalog-link. Two prior versions of this script drifted from
// the matcher and the apply rules, which caused real data loss (auto-
// deleting on collision). This version:
//   • duplicates the v2 matcher rules exactly as the audit script has them
//   • SKIPS on collision instead of deleting (the rule the endpoint uses)
//   • preserves the local row's comic_covers photo into user_cover_url
//
// If the matcher logic changes again, change BOTH this file and
// scripts/auditCatalogLink.js together — there is no shared module yet.
//
// Usage:  node scripts/applyCatalogLinks.js [user_id]
//         (defaults to ADMIN_ID)

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", quiet: true });

const ADMIN_ID = "9ec650a2-8870-4175-82da-99d72cab9efc";
const userId = process.argv[2] || ADMIN_ID;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─────────────────────────────────────────────────────────────────────────
// Matcher (mirror of auditCatalogLink.js)
// ─────────────────────────────────────────────────────────────────────────
import { normTitle, normIssue, parseYear, bestYearFor, titleVariants, pickFromMatches } from "../src/lib/catalogLinkMatcher.js";



// ─────────────────────────────────────────────────────────────────────────
// Build confident candidates
// ─────────────────────────────────────────────────────────────────────────
async function buildConfidentLinks() {
  const { data: localRows } = await supabase
    .from("user_collections")
    .select("id, comic_id, user_cover_url")
    .eq("user_id", userId)
    .eq("status", "owned")
    .is("gcd_issue_id", null)
    .not("comic_id", "is", null);

  if (!localRows?.length) return [];

  const comicIds = [...new Set(localRows.map((r) => r.comic_id))];
  const { data: comics } = await supabase
    .from("comics")
    .select("id, series_title, issue_number, publisher, release_year")
    .in("id", comicIds);
  const comicById = Object.fromEntries((comics ?? []).map((c) => [c.id, c]));

  const titleNormSet = new Set();
  const variantsByComicId = new Map();
  for (const c of comics) {
    const vs = titleVariants(c.series_title);
    variantsByComicId.set(c.id, vs);
    for (const v of vs) titleNormSet.add(v);
  }

  const { data: seriesRows } = await supabase
    .from("series")
    .select("id, gcd_id, title, title_normalized, year_start_cached, year_end_cached, resolved_publisher_cached")
    .in("title_normalized", [...titleNormSet])
    .not("gcd_id", "is", null);

  const seriesByNormTitle = new Map();
  for (const s of seriesRows ?? []) {
    if (!seriesByNormTitle.has(s.title_normalized)) seriesByNormTitle.set(s.title_normalized, []);
    seriesByNormTitle.get(s.title_normalized).push(s);
  }

  const allSeriesGcdIds = [];
  for (const arr of seriesByNormTitle.values()) for (const s of arr) allSeriesGcdIds.push(s.gcd_id);

  const issuesBySeriesIssue = new Map();
  if (allSeriesGcdIds.length) {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data: page } = await supabase
        .from("gcd_issues")
        .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date")
        .in("series_gcd_id", allSeriesGcdIds)
        .range(from, from + PAGE - 1);
      if (!page?.length) break;
      for (const i of page) {
        const k = `${i.series_gcd_id}::${normIssue(i.issue_number)}`;
        if (!issuesBySeriesIssue.has(k)) issuesBySeriesIssue.set(k, []);
        issuesBySeriesIssue.get(k).push(i);
      }
      if (page.length < PAGE) break;
      from += PAGE;
    }
  }

  const links = [];
  for (const row of localRows) {
    const comic = comicById[row.comic_id];
    if (!comic) continue;
    const variants = variantsByComicId.get(comic.id) ?? [];
    const iNorm = normIssue(comic.issue_number);
    const seenSeries = new Set();
    const seriesCandidates = [];
    for (const v of variants) {
      for (const s of (seriesByNormTitle.get(v) ?? [])) {
        if (seenSeries.has(s.gcd_id)) continue;
        seenSeries.add(s.gcd_id);
        seriesCandidates.push(s);
      }
    }
    const matches = [];
    for (const s of seriesCandidates) {
      const issues = issuesBySeriesIssue.get(`${s.gcd_id}::${iNorm}`) ?? [];
      for (const i of issues) matches.push({
        gcd_issue_id: Number(i.gcd_id),
        series_gcd_id: s.gcd_id,
        series_title: s.title,
        issue_number: i.issue_number,
        series_year_start: s.year_start_cached,
        issue_year: bestYearFor(i),
      });
    }
    const pickResult = pickFromMatches(matches, comic);
    const picked = pickResult.status === "confident" ? pickResult.picked : null;
    if (picked) {
      links.push({
        collection_id: row.id,
        comic_id: comic.id,
        existing_user_cover_url: row.user_cover_url,
        gcd_issue_id: picked.gcd_issue_id,
        comic,
        candidate: picked,
      });
    }
  }
  return links;
}

// ─────────────────────────────────────────────────────────────────────────
// Apply (SAFE: skip on collision, preserve photo)
// ─────────────────────────────────────────────────────────────────────────
async function applyLinks(links) {
  let linked = 0;
  let skipped = 0;
  const errors = [];

  for (const link of links) {
    // Collision check — if the user already has a different user_collections
    // row pointing at this gcd_issue_id, SKIP. The old script's auto-delete
    // behavior caused data loss when user volumes mapped to the same GCD
    // entry (Amory Wars Vol. 1 and Vol. 2 both routing to gcd-370587).
    const { data: collision } = await supabase
      .from("user_collections")
      .select("id")
      .eq("user_id", userId)
      .eq("gcd_issue_id", link.gcd_issue_id)
      .maybeSingle();

    if (collision?.id && collision.id !== link.collection_id) {
      skipped += 1;
      errors.push({ id: link.collection_id, reason: "collision", target_gcd: link.gcd_issue_id });
      console.log(`  · SKIP (collision)             ${link.comic.series_title} #${link.comic.issue_number}  →  gcd-${link.gcd_issue_id}`);
      continue;
    }

    // Photo preservation — copy primary comic_covers.image_path into
    // user_cover_url before we null comic_id so the user's photo survives.
    let personalPath = null;
    if (!link.existing_user_cover_url) {
      const { data: covers } = await supabase
        .from("comic_covers")
        .select("image_path, is_primary, created_at")
        .eq("comic_id", link.comic_id)
        .order("created_at", { ascending: true });
      const primary = covers?.find((c) => c.is_primary) ?? covers?.[0];
      personalPath = primary?.image_path ?? null;
    }

    const updatePayload = { gcd_issue_id: link.gcd_issue_id, comic_id: null };
    if (personalPath) updatePayload.user_cover_url = personalPath;

    const { error } = await supabase
      .from("user_collections")
      .update(updatePayload)
      .eq("id", link.collection_id);
    if (error) {
      errors.push({ id: link.collection_id, reason: "update_failed", message: error.message });
      skipped += 1;
      console.log(`  ✗ FAIL                         ${link.comic.series_title} #${link.comic.issue_number} — ${error.message}`);
    } else {
      console.log(`  ✓ linked${personalPath ? " (+photo)" : "         "}              ${link.comic.series_title} #${link.comic.issue_number}  →  gcd-${link.gcd_issue_id}`);
      linked += 1;
    }
  }
  return { linked, skipped, errors };
}

async function main() {
  console.log(`\nApplying confident catalog links for user_id = ${userId}\n`);

  const links = await buildConfidentLinks();
  console.log(`Confident matches: ${links.length}\n`);
  if (links.length === 0) {
    console.log("Nothing to do.\n");
    return;
  }

  const result = await applyLinks(links);

  console.log(`\n══════ RESULT ══════`);
  console.log(`  Linked : ${result.linked}`);
  console.log(`  Skipped: ${result.skipped}`);
  if (result.errors.length) {
    console.log(`\n  Errors:`);
    for (const e of result.errors) {
      console.log(`    ${e.id}  ${e.reason}: ${e.message ?? e.target_gcd ?? ""}`);
    }
  }
  console.log();
}

main().catch((e) => { console.error(e); process.exit(1); });
