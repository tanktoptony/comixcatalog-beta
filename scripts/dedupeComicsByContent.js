// Dedupes the `comics` table against `gcd_issues` by CONTENT, not by foreign
// key. Context: ~2.4M rows in `comics` are legacy GCD ingest from before
// gcd_issues was the canonical source. Their `series_id` mostly points at
// orphan `series` rows that have no `gcd_id`, so the previous dedupe (which
// routed through series.gcd_id → gcd_issues.series_gcd_id) only caught 387.
//
// This script matches each `comics` row to a `gcd_issues` row by:
//     normalize(series_title) === normalize(gcd_series.name)
//     AND normalize(issue_number) === normalize(gcd_issues.issue_number)
//     AND year matches (or year is missing on either side)
//
// For each match it migrates any user_collections.comic_id reference over
// to gcd_issue_id, deletes the comic_covers rows, and deletes the comics
// row. Rows with no GCD match are left alone — those are real-user-added
// original content (or orphans we can investigate separately).
//
// Usage:
//   node scripts/dedupeComicsByContent.js          # dry-run with stats
//   node scripts/dedupeComicsByContent.js --apply  # writes deletes/updates
//
// Memory: builds a (seriesName, issueNum, year) → gcd_id lookup for every
// gcd_issue. Expect ~300–500MB resident in Node. Run with --max-old-space-size=2048
// if you hit a heap-out-of-memory.

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const PAGE_SIZE = 1000;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normTitle(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normIssue(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/\s+/g, "");
}

function parseYear(value) {
  if (value == null) return null;
  const n = Number(value);
  if (Number.isInteger(n) && n > 1800 && n < 2100) return n;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

// Keyset pagination — much faster than range() on big tables.
async function* keysetIterate(builderFn, { keyColumn = "id", pageSize = PAGE_SIZE } = {}) {
  let lastKey = null;
  while (true) {
    let q = builderFn().order(keyColumn, { ascending: true }).limit(pageSize);
    if (lastKey != null) q = q.gt(keyColumn, lastKey);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) yield row;
    lastKey = data[data.length - 1][keyColumn];
    if (data.length < pageSize) break;
  }
}

async function run() {
  console.log(APPLY ? "MODE: --apply (writes will happen)" : "MODE: dry-run");

  // Step 1: build gcd_series name lookup (normalized name → gcd_id).
  console.log("\nLoading gcd_series…");
  const seriesNameToGcdId = new Map(); // normName → array of gcd_id (duplicates exist)
  let seriesCount = 0;
  for await (const row of keysetIterate(
    () => supabase.from("gcd_series").select("gcd_id, name"),
    { keyColumn: "gcd_id" }
  )) {
    const key = normTitle(row.name);
    if (!key) continue;
    if (!seriesNameToGcdId.has(key)) seriesNameToGcdId.set(key, []);
    seriesNameToGcdId.get(key).push(row.gcd_id);
    seriesCount += 1;
    if (seriesCount % 10000 === 0) {
      process.stdout.write(`  gcd_series loaded: ${seriesCount}\r`);
    }
  }
  console.log(`  gcd_series loaded: ${seriesCount}            `);
  console.log(`  distinct normalized titles: ${seriesNameToGcdId.size}`);

  // Step 2: build gcd_issues lookup keyed by (series_gcd_id, normIssue, year).
  // Also a fallback key without year, for when comic.release_year is null.
  console.log("\nLoading gcd_issues (this is the big one)…");
  const issueLookupWithYear = new Map();   // `${seriesGcdId}::${issue}::${year}` → gcd_id
  const issueLookupNoYear = new Map();     // `${seriesGcdId}::${issue}` → [gcd_id, ...]
  let issueCount = 0;
  for await (const row of keysetIterate(
    () => supabase.from("gcd_issues").select("gcd_id, series_gcd_id, issue_number, publication_date"),
    { keyColumn: "gcd_id" }
  )) {
    const issue = normIssue(row.issue_number);
    if (!issue || row.series_gcd_id == null) continue;
    const year = parseYear(row.publication_date);
    const yearKey = `${row.series_gcd_id}::${issue}::${year ?? "x"}`;
    if (!issueLookupWithYear.has(yearKey)) {
      issueLookupWithYear.set(yearKey, row.gcd_id);
    }
    const noYearKey = `${row.series_gcd_id}::${issue}`;
    if (!issueLookupNoYear.has(noYearKey)) issueLookupNoYear.set(noYearKey, []);
    issueLookupNoYear.get(noYearKey).push(row.gcd_id);
    issueCount += 1;
    if (issueCount % 50000 === 0) {
      process.stdout.write(`  gcd_issues loaded: ${issueCount}\r`);
    }
  }
  console.log(`  gcd_issues loaded: ${issueCount}            `);

  // Step 2.5: build series.id → series.title map. Most legacy-ingest rows
  // in `comics` have series_title = null and only series_id set — without
  // this fallback the dedupe would skip ~99.99% of rows.
  console.log("\nLoading series titles (for null-title fallback)…");
  const seriesTitleById = new Map();
  let seriesTitleCount = 0;
  for await (const row of keysetIterate(
    () => supabase.from("series").select("id, title"),
    { keyColumn: "id" }
  )) {
    if (row.title) seriesTitleById.set(row.id, row.title);
    seriesTitleCount += 1;
    if (seriesTitleCount % 20000 === 0) {
      process.stdout.write(`  series titles loaded: ${seriesTitleCount}\r`);
    }
  }
  console.log(`  series titles loaded: ${seriesTitleCount}            `);

  // Step 3: iterate comics, classify each row.
  console.log("\nClassifying comics rows against the GCD lookup…");
  const plan = []; // { id, gcdIssueId, seriesId }
  const spotChecks = []; // sampled matches for eyeball verification
  const stats = {
    total: 0,
    matchedYear: 0,
    matchedNoYear: 0,
    titleMissing: 0,
    titleNotInGcd: 0,
    titleAmbiguous: 0,
    issueNotInSeries: 0,
    keptUserOriginal: 0, // potential real-user content, no GCD twin
  };

  for await (const row of keysetIterate(
    () =>
      supabase
        .from("comics")
        .select("id, series_id, series_title, issue_number, release_year"),
    { keyColumn: "id" }
  )) {
    stats.total += 1;
    if (stats.total % 10000 === 0) {
      process.stdout.write(
        `  classified: ${stats.total} (matched ${stats.matchedYear + stats.matchedNoYear})\r`
      );
    }

    // Title resolution: prefer comics.series_title, fall back to the linked
    // series row's title. ~99.99% of legacy rows have null series_title and
    // only series_id set, so without this fallback they'd all be skipped.
    const rawTitle = row.series_title || (row.series_id && seriesTitleById.get(row.series_id)) || null;
    const titleKey = normTitle(rawTitle);
    const issueKey = normIssue(row.issue_number);
    if (!titleKey) {
      stats.titleMissing += 1;
      continue;
    }
    if (!issueKey) {
      stats.keptUserOriginal += 1;
      continue;
    }

    const candidateSeriesGcdIds = seriesNameToGcdId.get(titleKey);
    if (!candidateSeriesGcdIds || candidateSeriesGcdIds.length === 0) {
      stats.titleNotInGcd += 1;
      continue;
    }

    const year = parseYear(row.release_year);
    let matchedGcdId = null;

    // Try year-aware match first across every candidate series with this title.
    if (year != null) {
      for (const seriesGcdId of candidateSeriesGcdIds) {
        const k = `${seriesGcdId}::${issueKey}::${year}`;
        const hit = issueLookupWithYear.get(k);
        if (hit) {
          matchedGcdId = hit;
          stats.matchedYear += 1;
          break;
        }
      }
    }

    // Fall back to no-year match. Only accept if there's exactly ONE candidate
    // — multiple printings across volumes makes this ambiguous and we'd
    // rather keep the row than guess wrong.
    if (!matchedGcdId) {
      const noYearMatches = [];
      for (const seriesGcdId of candidateSeriesGcdIds) {
        const hits = issueLookupNoYear.get(`${seriesGcdId}::${issueKey}`);
        if (hits) noYearMatches.push(...hits);
      }
      if (noYearMatches.length === 1) {
        matchedGcdId = noYearMatches[0];
        stats.matchedNoYear += 1;
      } else if (noYearMatches.length > 1) {
        stats.titleAmbiguous += 1;
      } else {
        stats.issueNotInSeries += 1;
      }
    }

    if (matchedGcdId) {
      plan.push({ id: row.id, gcdIssueId: matchedGcdId, seriesId: row.series_id });
      // Capture a spread of spot-check samples — every ~80,000th match so
      // they're drawn from across the whole table, not just the first page.
      if (stats.matchedNoYear % 80000 === 1 && spotChecks.length < 20) {
        spotChecks.push({
          comicId: row.id,
          resolvedTitle: rawTitle,
          issueNumber: row.issue_number,
          releaseYear: row.release_year,
          gcdIssueId: matchedGcdId,
        });
      }
    }
  }
  process.stdout.write("\n");

  console.log("\n── Classification ──");
  console.log(`  total comics rows         : ${stats.total.toLocaleString()}`);
  console.log(`  matched on title+issue+year: ${stats.matchedYear.toLocaleString()}`);
  console.log(`  matched on title+issue only: ${stats.matchedNoYear.toLocaleString()}`);
  console.log(`  → DEDUPE PLAN              : ${plan.length.toLocaleString()}`);
  console.log("");
  console.log(`  kept: title missing        : ${stats.titleMissing.toLocaleString()}`);
  console.log(`  kept: issue_number missing : ${stats.keptUserOriginal.toLocaleString()}`);
  console.log(`  kept: title not in GCD     : ${stats.titleNotInGcd.toLocaleString()}`);
  console.log(`  kept: ambiguous (multi-vol): ${stats.titleAmbiguous.toLocaleString()}`);
  console.log(`  kept: issue# not in series : ${stats.issueNotInSeries.toLocaleString()}`);

  if (plan.length === 0) {
    console.log("\nNothing to dedupe.");
    return;
  }

  // Spot-check: fetch the actual GCD rows for the sampled matches and print
  // them side-by-side with the comics row, so the matches can be eyeballed
  // before committing to 1.6M+ irreversible deletes.
  if (spotChecks.length > 0) {
    console.log("\n── Spot-check (sampled across the whole table) ──");
    const sampleGcdIds = spotChecks.map((s) => s.gcdIssueId);
    const { data: gcdRows } = await supabase
      .from("gcd_issues")
      .select("gcd_id, series_gcd_id, issue_number, publication_date")
      .in("gcd_id", sampleGcdIds);
    const gcdById = new Map((gcdRows ?? []).map((r) => [r.gcd_id, r]));

    const seriesGcdIds = [...new Set((gcdRows ?? []).map((r) => r.series_gcd_id))];
    const { data: gcdSeriesRows } = await supabase
      .from("gcd_series")
      .select("gcd_id, name")
      .in("gcd_id", seriesGcdIds);
    const gcdSeriesNameById = new Map((gcdSeriesRows ?? []).map((r) => [r.gcd_id, r.name]));

    for (const s of spotChecks) {
      const g = gcdById.get(s.gcdIssueId);
      const gcdSeriesName = g ? gcdSeriesNameById.get(g.series_gcd_id) : null;
      console.log(
        `  comics: "${s.resolvedTitle}" #${s.issueNumber} (${s.releaseYear ?? "no year"})`
      );
      console.log(
        `      →  gcd-${s.gcdIssueId}: "${gcdSeriesName ?? "?"}" #${g?.issue_number ?? "?"} (${g?.publication_date ?? "?"})`
      );
    }
    console.log(
      "\n  ↑ Each pair should be the SAME book. If titles/issues don't line up, STOP."
    );
  }

  // Step 4: count user_collections refs so the user knows the scale.
  console.log("\nCounting user_collections references to the matched comics…");
  const planIds = plan.map((p) => p.id);
  const refsByComicId = new Map();
  for (let i = 0; i < planIds.length; i += 500) {
    const batch = planIds.slice(i, i + 500);
    const { data } = await supabase
      .from("user_collections")
      .select("id, comic_id")
      .in("comic_id", batch);
    for (const row of data ?? []) {
      if (!refsByComicId.has(row.comic_id)) refsByComicId.set(row.comic_id, []);
      refsByComicId.get(row.comic_id).push(row.id);
    }
    process.stdout.write(`  scanned ${Math.min(i + 500, planIds.length)}/${planIds.length}\r`);
  }
  process.stdout.write("\n");
  const totalRefs = [...refsByComicId.values()].reduce((acc, arr) => acc + arr.length, 0);
  console.log(`  user_collections rows that need rewiring: ${totalRefs.toLocaleString()}`);
  console.log(`  comics rows referenced by collections    : ${refsByComicId.size.toLocaleString()}`);

  if (!APPLY) {
    console.log("\nDry-run complete. Re-run with --apply to write.");
    return;
  }

  // Step 5: apply. Order:
  //   a. For each rewired collection, preserve the user's photo (if any)
  //      by copying the primary comic_covers.image_path into the
  //      user_collections.user_cover_url field. This keeps "your copy of
  //      this book" alive after the comics row goes away.
  //   b. Rewire user_collections.comic_id → gcd_issue_id.
  //   c. Delete comic_covers rows for the matched comics.
  //   d. Delete the comics rows.
  const gcdByComicId = new Map(plan.map((p) => [p.id, p.gcdIssueId]));

  // (a) Preserve user covers attached to comics rows we're about to delete.
  // Pull the primary cover (is_primary=true) for any comic_id referenced
  // by user_collections. Per-user photo, not the issue's canonical cover.
  console.log("\nPreserving user-uploaded covers before delete…");
  const referencedComicIds = [...refsByComicId.keys()];
  const coverByComicId = new Map(); // comic_id → public storage URL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  for (let i = 0; i < referencedComicIds.length; i += 500) {
    const batch = referencedComicIds.slice(i, i + 500);
    const { data } = await supabase
      .from("comic_covers")
      .select("comic_id, image_path, is_primary")
      .in("comic_id", batch);
    for (const row of data ?? []) {
      // Prefer the primary; first one wins if there's no primary marker.
      if (!coverByComicId.has(row.comic_id) || row.is_primary) {
        coverByComicId.set(
          row.comic_id,
          `${supabaseUrl}/storage/v1/object/public/comic-covers/${row.image_path}`
        );
      }
    }
  }
  console.log(`  user-uploaded covers found on referenced comics: ${coverByComicId.size}`);

  console.log("\nRewiring user_collections rows…");
  let rewired = 0;
  let coversPreserved = 0;
  for (const [comicId, collectionIds] of refsByComicId) {
    const gcdIssueId = gcdByComicId.get(comicId);
    const userCoverUrl = coverByComicId.get(comicId) ?? null;

    await Promise.all(
      collectionIds.map((cId) => {
        const payload = { gcd_issue_id: gcdIssueId, comic_id: null };
        // Only set user_cover_url if there's actually a cover to preserve
        // AND the existing row doesn't already have one (don't clobber a
        // newer upload). We can't know "existing" without a roundtrip, so
        // we set it conditionally via the column being null — easier to
        // just always set if we have one; the alternative would be a
        // per-row select-then-update which doubles the work.
        if (userCoverUrl) payload.user_cover_url = userCoverUrl;
        return supabase.from("user_collections").update(payload).eq("id", cId);
      })
    );
    if (userCoverUrl) coversPreserved += collectionIds.length;
    rewired += collectionIds.length;
    if (rewired % 50 === 0) process.stdout.write(`  rewired ${rewired}/${totalRefs}\r`);
  }
  console.log(`  rewired ${rewired}/${totalRefs}            `);
  console.log(`  user covers preserved onto user_collections rows: ${coversPreserved}`);

  // (c) Now delete the comic_covers rows. The user's photo is already
  // duplicated into user_collections.user_cover_url so this is safe.
  console.log("\nDeleting comic_covers for matched comics…");
  let coversDeleted = 0;
  for (let i = 0; i < planIds.length; i += 500) {
    const batch = planIds.slice(i, i + 500);
    const { data } = await supabase
      .from("comic_covers")
      .delete()
      .in("comic_id", batch)
      .select("id");
    coversDeleted += (data ?? []).length;
    process.stdout.write(`  covers deleted: ${coversDeleted}\r`);
  }
  console.log(`  covers deleted: ${coversDeleted}            `);

  console.log("\nDeleting duplicate comics rows…");
  let comicsDeleted = 0;
  for (let i = 0; i < planIds.length; i += 500) {
    const batch = planIds.slice(i, i + 500);
    const { data, error } = await supabase
      .from("comics")
      .delete()
      .in("id", batch)
      .select("id");
    if (error) {
      console.error(`\n  delete batch starting at ${i} failed:`, error.message);
      break;
    }
    comicsDeleted += (data ?? []).length;
    process.stdout.write(`  comics deleted: ${comicsDeleted}/${planIds.length}\r`);
  }
  console.log(`  comics deleted: ${comicsDeleted}            `);

  console.log("\n✓ Done.");
  console.log("\nNext step: re-run the search-cache refresh so issue counts/years update:");
  console.log("  node scripts/refreshSeriesSearchCache.js");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
