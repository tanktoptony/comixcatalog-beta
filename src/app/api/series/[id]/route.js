import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { fetchSeriesCoverRows, resolveCovers } from "@/lib/catalog/covers";
import { resolvePublisher } from "@/lib/publisher";
import { collectsLines, formatLabel, formatNoun, formatTag, formatTagTitle, isCollectedEdition } from "@/lib/seriesFormat";
import { CDN_CACHE_SHORT } from "@/lib/cdnCache";
import { baseIssueNumber, compareIssueNumbers } from "@/lib/coverMatch";
import { isUnnumberedIssue } from "@/lib/issueNumberLabel";
import { bestYearFor, parseYear } from "@/lib/years";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";
import { seriesLinkDisplayLines } from "@/lib/seriesLinks";
import { filterSeriesVolumes } from "@/lib/seriesPage";

// Strip variant/printing suffixes — same logic as the cache refresh.
// "1 [Newsstand]" → "1", "5/1981" → "5", "Annual 1" → null.
// See scripts/refreshSeriesSearchCache.js for the rationale.
// publication_date is null on ~65% of gcd_issues. key_date is GCD's sortable
// approximation that's populated more reliably. Fall back to it.
// Dedupe by BASE issue number so "1", "1 [Newsstand]", "1 [Variant Cover]"
// collapse to a single issue. When duplicates exist, prefer the row with the
// earliest valid date (original printing beats reprints) and prefer dated
// rows over undated. This will become "issues + variants" once the schema
// gets variant fields; today it just produces the correct issue count.
function dedupeIssuesByBase(issues) {
  const byBase = new Map();
  for (const issue of issues) {
    const base = baseIssueNumber(issue.issue_number);
    if (!base) continue;
    const existing = byBase.get(base);
    if (!existing) {
      byBase.set(base, issue);
      continue;
    }
    const existingYear = bestYearFor(existing);
    const candidateYear = bestYearFor(issue);
    if (
      candidateYear != null &&
      (existingYear == null || candidateYear < existingYear)
    ) {
      byBase.set(base, issue);
    }
  }
  return [...byBase.values()];
}

const KEY_ISSUE_ID_CHUNK = 400;
const CREATOR_ROW_CAP = 5000;
// Creators credited mostly on one-page gag fillers, which outnumber any real
// run in a series' credit counts (Henry Boltinoff: 165 Batman issues). Stopgap
// until "who made it" counts main stories only (series page part D).
const FILLER_CREATOR_SLUGS = new Set(["henry-boltinoff"]);

async function loadMemberStats(supabase, seriesGcdId) {
  if (seriesGcdId == null) return { owners: 0, copies: 0 };
  const { data, error } = await supabase.rpc("series_public_member_stats", {
    p_series_gcd_id: seriesGcdId,
  });
  if (error) throw error;
  const row = data?.[0] ?? {};
  return {
    owners: Number(row.owners) || 0,
    copies: Number(row.copies) || 0,
  };
}

async function loadSiblingVolumes(supabase, series, resolvedPublisher) {
  const { data, error } = await supabase.rpc("series_sibling_runs", {
    p_title: series.title,
    p_publisher: resolvedPublisher,
    p_current: series.id,
  });
  if (error) throw error;
  const volumes = filterSeriesVolumes(data, { id: series.id, title: series.title, publisher: resolvedPublisher });
  return { volumes, count: Number(data?.[0]?.total_count) || volumes.length };
}

async function loadSeriesLinks(supabase, currentGcdId) {
  if (currentGcdId == null) return [];
  const { data: linkRows, error: linkError } = await supabase
    .from("series_links")
    .select("from_gcd_id,to_gcd_id,kind,source,gcd_bond_type,note")
    .or(`from_gcd_id.eq.${Number(currentGcdId)},to_gcd_id.eq.${Number(currentGcdId)}`);
  if (linkError) throw linkError;
  if (!linkRows?.length) return [];

  const relatedIds = [...new Set(linkRows.flatMap((row) => [
    Number(row.from_gcd_id), Number(row.to_gcd_id),
  ]).filter((gcdId) => gcdId !== Number(currentGcdId)))];
  const { data: relatedRows, error: relatedError } = await supabase
    .from("series")
    .select("id,gcd_id,title,year_start_cached")
    .in("gcd_id", relatedIds);
  if (relatedError) throw relatedError;
  const byGcdId = new Map((relatedRows ?? []).map((row) => [Number(row.gcd_id), row]));
  const enriched = linkRows.map((row) => ({
    ...row,
    from_series: Number(row.from_gcd_id) === Number(currentGcdId)
      ? null : byGcdId.get(Number(row.from_gcd_id)),
    to_series: Number(row.to_gcd_id) === Number(currentGcdId)
      ? null : byGcdId.get(Number(row.to_gcd_id)),
  }));
  return seriesLinkDisplayLines(enriched, currentGcdId);
}

async function loadTopCreators(supabase, issues) {
  const ids = issues.map((issue) => issue.gcd_id).filter((id) => id != null);
  const rows = [];
  // Credits are chunked to keep PostgREST IN filters small and capped at
  // 5,000 total rows so unusually large series cannot create an open-ended read.
  for (let index = 0; index < ids.length && rows.length < CREATOR_ROW_CAP; index += 400) {
    const idChunk = ids.slice(index, index + 400);
    const remaining = CREATOR_ROW_CAP - rows.length;
    const page = await fetchAllPages(() => supabase
      .from("issue_creators")
      .select("gcd_issue_id, role, creators(name, slug)")
      .in("gcd_issue_id", idChunk)
      .in("role", ["writer", "penciller", "inker"]), "gcd_issue_id", { maxRows: remaining });
    rows.push(...page);
  }

  const rank = (roles) => {
    const acceptedRoles = new Set(Array.isArray(roles) ? roles : [roles]);
    const byCreator = new Map();
    for (const row of rows) {
      if (!acceptedRoles.has(row.role)) continue;
      const creator = Array.isArray(row.creators) ? row.creators[0] : row.creators;
      if (!creator?.name || !creator?.slug) continue;
      if (FILLER_CREATOR_SLUGS.has(creator.slug)) continue;
      const entry = byCreator.get(creator.slug) ?? { name: creator.name, slug: creator.slug, issueIds: new Set() };
      entry.issueIds.add(row.gcd_issue_id);
      byCreator.set(creator.slug, entry);
    }
    return [...byCreator.values()]
      .map(({ name, slug, issueIds }) => ({ name, slug, issues: issueIds.size }))
      .sort((a, b) => b.issues - a.issues || a.name.localeCompare(b.name))
      .slice(0, 5);
  };
  const creditedIssueCount = (roles) => {
    const acceptedRoles = new Set(Array.isArray(roles) ? roles : [roles]);
    return new Set(
      rows.filter((row) => acceptedRoles.has(row.role)).map((row) => row.gcd_issue_id)
    ).size;
  };
  return {
    topCreators: { writers: rank("writer"), artists: rank(["penciller", "inker"]) },
    creditedIssueCounts: {
      writers: creditedIssueCount("writer"),
      artists: creditedIssueCount(["penciller", "inker"]),
    },
  };
}

async function loadKeyIssues(supabase, issues, { seriesTitle, collectedEdition }) {
  const ids = issues.map((issue) => issue.gcd_id).filter((id) => id != null);
  if (ids.length === 0) return [];
  const chunks = [];
  for (let index = 0; index < ids.length; index += KEY_ISSUE_ID_CHUNK) {
    chunks.push(ids.slice(index, index + KEY_ISSUE_ID_CHUNK));
  }
  const results = await Promise.all(chunks.map((idChunk) => supabase
    .from("key_issues")
    .select("gcd_issue_id, reason, tier, issue_number")
    .in("gcd_issue_id", idChunk)));
  const failed = results.find((result) => result.error);
  if (failed) throw failed.error;
  const issueById = new Map(issues.map((issue) => [Number(issue.gcd_id), issue]));
  const keys = results.flatMap((result) => result.data ?? []).map((keyIssue) => {
    const issue = issueById.get(Number(keyIssue.gcd_issue_id));
    return { ...keyIssue, year: issue ? bestYearFor(issue) : null };
  });
  const datedYears = issues.map((issue) => bestYearFor(issue)).filter((year) => year != null);
  const seriesYearStart = datedYears.length ? Math.min(...datedYears) : null;
  const seriesYearEnd = datedYears.length ? Math.max(...datedYears) : null;
  let covers = new Map();
  try {
    covers = await resolveCovers(supabase, keys.map((keyIssue) => {
      const issue = issueById.get(Number(keyIssue.gcd_issue_id));
      return {
        gcd_issue_id: Number(keyIssue.gcd_issue_id),
        series_gcd_id: issue?.series_gcd_id ?? null,
        series_title: collectedEdition ? null : seriesTitle,
        issue_number: keyIssue.issue_number,
        year: keyIssue.year,
        series_year_start: seriesYearStart,
        series_year_end: seriesYearEnd,
      };
    }));
  } catch (error) {
    console.error("GET /api/series/[id] key cover resolution failed:", error);
  }
  return keys.map((keyIssue) => {
    const storagePath = covers.get(Number(keyIssue.gcd_issue_id))?.storage_path ?? null;
    return {
      ...keyIssue,
      cover: storagePath
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${storagePath}`
        : null,
    };
  }).sort((left, right) => compareIssueNumbers(left.issue_number, right.issue_number));
}

export async function GET(req, context) {
  try {
    const { id } = await context.params;

    const supabase = getServiceClient();
    let degraded = false;

    const { data: series, error: seriesError } = await supabase
      .from("series")
      .select(`
        id,
        gcd_id,
        title,
        publisher_id,
        cv_publisher,
        resolved_publisher_cached,
        year_start_cached,
        year_end_cached,
        reprint_count,
        publisher:publisher_id (
          id,
          name,
          gcd_id
        )
      `)
      .eq("id", id)
      .single();

    if (seriesError || !series) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    // Every stage below needs only the series row (or its issues), so the
    // lookups overlap instead of running one after another. Serially a
    // 1,301-issue run took 8-12 s (measured 2026-10-14).
    const seriesLinksPromise = series.gcd_id == null
      ? Promise.resolve([])
      : loadSeriesLinks(supabase, series.gcd_id).catch((error) => {
        console.error("GET /api/series/[id] series links lookup failed:", error);
        degraded = true;
        return [];
      });

    // No GCD linkage at all — a brand-new or never-catalogued real series.
    // GCD's metadata mirror is a point-in-time dump plus a weekly top-up
    // scoped to ~79 curated titles (see gcd-issue-refresh.yml); anything
    // outside that list that launched after the dump simply has no
    // gcd_series/gcd_issues row, full stop — not stale, absent. This used
    // to unconditionally return zero issues here, even when real
    // ComicVine-sourced covers already exist and are correctly title-tagged
    // (found 2026-08-27: Swamp Thing 1989, Godzilla Conquers the Multiverse,
    // Big Rig and others had a bare series row and real ingested covers but
    // showed "0 issues" because this branch never looked at canonical_covers
    // at all). Pure title-path only — there's no series_gcd_id to ID-match
    // on, so this can't reach the volume-exact guarantee the gcd_id path
    // below relies on; that's the same trade-off the title-path already
    // makes there.
    if (!series.gcd_id) {
      const seriesLinks = await seriesLinksPromise;
      let coverRows = [];
      try {
        coverRows = await fetchSeriesCoverRows(supabase, { seriesTitles: [series.title] });
      } catch (error) {
        console.error("GET /api/series/[id] gcd-less title lookup failed:", error);
        degraded = true;
      }
      const byBase = new Map();
      for (const row of coverRows) {
          if (!row.storage_path) continue;
          const base = baseIssueNumber(row.issue_number);
          if (!base) continue;
          const existing = byBase.get(base);
          const rowYear = parseYear(row.cover_date) ?? Number(row.series_year ?? 0);
          if (!existing || rowYear < existing.year) byBase.set(base, { row, year: rowYear });
      }
      const mappedIssues = [...byBase.entries()]
        .map(([base, { row }]) => ({
          id: `cvt-${encodeURIComponent(series.title ?? "")}-${base}`,
          title: null,
          issue_number: row.issue_number,
          release_year: parseYear(row.cover_date) ?? Number(row.series_year ?? null) ?? null,
          publication_date: null,
          cover: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${row.storage_path}`,
        }))
        .sort((a, b) => Number(a.issue_number) - Number(b.issue_number) || 0);

      const years = mappedIssues.map((i) => i.release_year).filter((y) => y != null);
      const cvPublisher = coverRows.find((row) => row.publisher)?.publisher ?? null;

      return NextResponse.json({
        ...(degraded ? { degraded: true } : {}),
        series: {
          id: series.id,
          title: series.title ?? "Untitled Series",
          publisher:
            series.resolved_publisher_cached ||
            series.publisher?.name ||
            cvPublisher ||
            "Unknown Publisher",
          issue_count: mappedIssues.length,
          year_start: years.length ? Math.min(...years) : null,
          year_end: years.length ? Math.max(...years) : null,
          featured_cover: mappedIssues.find((i) => i.cover)?.cover ?? null,
          reprint_count: Number(series.reprint_count) || 0,
          member_stats: { owners: 0, copies: 0 },
          sibling_volumes: [],
          sibling_volume_count: 0,
          links: seriesLinks,
          issues: mappedIssues,
        },
      }, degraded ? undefined : { headers: CDN_CACHE_SHORT });
    }

    const [issuesResult, gcdSeriesResult, gcdFormatResult] = await Promise.all([
      fetchAllPages(() => supabase
        .from("gcd_issues")
        .select(`
          gcd_id,
          series_gcd_id,
          issue_number,
          title,
          publication_date,
          key_date,
          variant_of_gcd_id
        `)
        .eq("series_gcd_id", series.gcd_id), "gcd_id")
        .then((data) => ({ data, error: null }))
        .catch((error) => ({ data: null, error })),
      // Series-level publisher per GCD. Never gcd_issues.publisher_gcd_id:
      // for most rows that is GCD's indicia publisher id, a different id
      // space from gcd_publishers (see scripts/refreshSeriesSearchCache.js).
      supabase
        .from("gcd_series")
        .select("publisher_gcd_id")
        .eq("gcd_id", series.gcd_id)
        .single(),
      // Publishing format (migration 0028), queried on its own so a missing
      // column degrades to "unknown format" rather than losing the publisher.
      supabase
        .from("gcd_series")
        .select("publishing_format, binding, format_notes, publication_type")
        .eq("gcd_id", series.gcd_id)
        .maybeSingle(),
    ]);

    const { data: issues, error: issuesError } = issuesResult;
    const seriesLevelPublisherGcdId = gcdSeriesResult.data?.publisher_gcd_id ?? null;
    const seriesFormat = gcdFormatResult.error ? null : gcdFormatResult.data;
    // Collected editions share a title with the run they collect, so the
    // title-keyed cover lookups below would hand them the monthly's art.
    // Their covers come through series_gcd_id or not at all.
    const collectedEdition = isCollectedEdition(seriesFormat ?? {});

    if (issuesError) {
      console.error("GET /api/series/[id] gcd issues failed:", issuesError);
      return NextResponse.json(
        { error: "Failed to load issues" },
        { status: 500 }
      );
    }

    const issueRows = issues ?? [];
    let keyIssues = [];
    let topCreators = { writers: [], artists: [] };
    let creatorCreditedIssues = { writers: 0, artists: 0 };
    const enrichmentPromise = Promise.all([
      loadKeyIssues(supabase, issueRows, { seriesTitle: series.title, collectedEdition }),
      loadTopCreators(supabase, issueRows),
    ]).then(([loadedKeyIssues, creatorSummary]) => {
      keyIssues = loadedKeyIssues;
      topCreators = creatorSummary.topCreators;
      creatorCreditedIssues = creatorSummary.creditedIssueCounts;
    }).catch((error) => {
      console.error("GET /api/series/[id] enrichment lookup failed:", error);
      degraded = true;
    });

    let seriesLevelPublisherName = null;
    const publisherRowsPromise = seriesLevelPublisherGcdId
      ? supabase.from("gcd_publishers").select("gcd_id, name").eq("gcd_id", seriesLevelPublisherGcdId)
      : Promise.resolve(null);

    const issueNumbers = [
      ...new Set(
        issueRows
          .map((row) => row.issue_number)
          .filter((value) => value != null)
      ),
    ];

    // Two-path canonical-cover lookup:
    //   1. ID path — match canonical_covers.series_gcd_id == series.gcd_id.
    //      Volume-exact; immune to title drift (mojibake, casing, comma vs
    //      colon — the "G.I. Joe, a Real American Hero" Marvel run vs
    //      "G.I. Joe: A Real American Hero" IDW form bit us until this).
    //   2. Title path — for canonical_covers rows the backfill couldn't tag.
    // Union the results; downstream dedupe (candidatesByIssue) handles
    // duplicates from rows that match both paths.
    const canonicalRowsPromise = issueNumbers.length > 0
      ? fetchSeriesCoverRows(supabase, {
        seriesGcdIds: [series.gcd_id],
        seriesTitles: collectedEdition ? [] : [series.title],
      }).catch((error) => {
        console.error("GET /api/series/[id] canonical cover lookup failed:", error);
        degraded = true;
        return [];
      })
      : Promise.resolve([]);

    // Series year span — used as the tolerance window for picking a canonical
    // cover. Without this, a 2022 "Robin: The Lazarus Tournament" cover ends
    // up assigned to the 1993 Robin #1 because canonical_covers only has the
    // recent run ingested.
    const seriesYears = issueRows
      .map((row) => bestYearFor(row))
      .filter((y) => y != null);
    const seriesYearMin = seriesYears.length
      ? Math.min(...seriesYears)
      : parseYear(series.year_start_cached);
    const seriesYearMax = seriesYears.length
      ? Math.max(...seriesYears)
      : parseYear(series.year_end_cached);
    const resolvedCoversPromise = resolveCovers(supabase, issueRows.map((issue) => ({
      gcd_issue_id: issue.gcd_id,
      series_gcd_id: issue.series_gcd_id,
      series_title: collectedEdition ? null : series.title,
      issue_number: issue.issue_number,
      year: bestYearFor(issue),
      series_year_start: seriesYearMin,
      series_year_end: seriesYearMax,
    }))).catch((error) => {
      console.error("GET /api/series/[id] cover resolution failed:", error);
      degraded = true;
      return new Map();
    });

    const [publisherRowsResult, canonicalRows, resolvedCovers, seriesLinks] = await Promise.all([
      publisherRowsPromise,
      canonicalRowsPromise,
      resolvedCoversPromise,
      seriesLinksPromise,
      enrichmentPromise,
    ]);

    if (publisherRowsResult) {
      const { data: gcdPublisherRows, error: gcdPublisherRowsError } = publisherRowsResult;
      if (gcdPublisherRowsError) {
        console.error("series publisher lookup failed:", gcdPublisherRowsError.code, gcdPublisherRowsError.message);
        degraded = true;
      }

      seriesLevelPublisherName = gcdPublisherRows?.[0]?.name ?? null;
    }

    const localPublisherName = series.publisher?.name ?? null;
    const cvPublisherName = series.cv_publisher ?? null;

    const years = issueRows
      .map((issue) => bestYearFor(issue))
      .filter((year) => year != null);

    const yearStart = years.length ? Math.min(...years) : null;
    const yearEnd = years.length ? Math.max(...years) : null;

    // Own covers only (ID path): a same-titled cover from another volume
    // carries that volume's publisher, e.g. IDW's Star Trek reading "DC".
    const canonicalPublisherName =
      canonicalRows.find((row) => row.series_gcd_id === series.gcd_id && row.publisher)?.publisher ?? null;

    // Prefer the precomputed cached value. It went through the audit
    // pipeline (scripts/repairSeriesPublishersWithCv.js) which applies the
    // year-aware logic — modern era trusts cv_publisher, pre-2000 prefers
    // GCD's series publisher. Re-resolving here on every request would bypass that
    // and reintroduce the bug where 1984 TMNT showed "IDW Publishing"
    // because IDW currently owns the IP. Only re-resolve as a fallback.
    const resolvedPublisher =
      series.resolved_publisher_cached ||
      resolvePublisher({
        cv: cvPublisherName ?? canonicalPublisherName,
        candidates: [
          localPublisherName,
          seriesLevelPublisherName,
        ],
        seriesTitle: series.title,
      });

    const publicStatsPromise = Promise.all([
      loadMemberStats(supabase, series.gcd_id),
      loadSiblingVolumes(supabase, series, resolvedPublisher),
    ]).catch((error) => {
      console.error("GET /api/series/[id] public stats lookup failed:", error);
      degraded = true;
      return [{ owners: 0, copies: 0 }, { volumes: [], count: 0 }];
    });

    const mappedIssuesRaw = issueRows.map((issue) => {
      const gcdYear = bestYearFor(issue);
      const best = resolvedCovers.get(issue.gcd_id) ?? null;
      const storagePath = best?.storage_path ?? null;
      const releaseYear =
        gcdYear ??
        (best ? parseYear(best.cover_date) ?? Number(best.series_year ?? null) : null) ??
        null;

      return {
        id: `gcd-${issue.gcd_id}`,
        title: issue.title ?? null,
        issue_number: issue.issue_number,
        release_year: releaseYear,
        publication_date: issue.publication_date ?? null,
        cover: storagePath
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${storagePath}`
          : null,
      };
    });

    // Orphan-cover backfill: gcd_issues is a point-in-time GCD mirror and goes
    // stale for any series still actively publishing — GCD's own data is also
    // prone to splitting one real series across several series_gcd_ids as new
    // issues get added (the "Absolute Batman" case, 2026-08-27: ComicVine had
    // all 23 real issues correctly ingested and tagged to this series_gcd_id,
    // but gcd_issues here only ever synced issue #1, so 22 real, correctly
    // linked covers were sitting in canonical_covers completely invisible on
    // the page). Only the ID-path canonicalRows are eligible — volume-exact,
    // same guarantee the cover-matching above already relies on — never the
    // looser title-path rows, which could pull in wrong-volume phantom issues
    // for a series that only ever matched by title.
    const knownBaseIssues = new Set(
      mappedIssuesRaw.map((issue) => baseIssueNumber(issue.issue_number)).filter(Boolean)
    );
    // A cover linked to one of this series' own GCD issues is that issue's
    // cover, not an orphan. Without this, an omnibus whose one "[nn]" book
    // has a linked ComicVine cover numbered "1" also listed a phantom #1.
    const listedGcdIds = new Set(issueRows.map((row) => String(row.gcd_id)));
    const orphanCoversByBase = new Map();
    if (series.gcd_id != null) {
      for (const row of canonicalRows) {
        if (row.series_gcd_id !== series.gcd_id || !row.storage_path) continue;
        if (row.gcd_issue_id != null && listedGcdIds.has(String(row.gcd_issue_id))) continue;
        const base = baseIssueNumber(row.issue_number);
        if (!base || knownBaseIssues.has(base)) continue;
        const existing = orphanCoversByBase.get(base);
        const rowYear = parseYear(row.cover_date) ?? Number(row.series_year ?? 0);
        if (!existing || rowYear < existing.year) {
          orphanCoversByBase.set(base, { row, year: rowYear });
        }
      }
    }
    const orphanIssues = [...orphanCoversByBase.entries()].map(([base, { row }]) => ({
      id: `cv-${series.gcd_id}-${base}`,
      title: null,
      issue_number: row.issue_number,
      release_year: parseYear(row.cover_date) ?? Number(row.series_year ?? null) ?? null,
      publication_date: null,
      cover: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${row.storage_path}`,
    }));

    // Trades, hardcovers, omnibuses and one-shots are usually a single "[nn]"
    // book in GCD. The number-based dedupe drops them, which left those
    // series pages empty with nothing to add to a collection (2026-10-26).
    // When nothing in the series is numbered, the unnumbered books are the
    // series; their variant rows stay out.
    const variantIds = new Set(
      issueRows.filter((row) => row.variant_of_gcd_id != null).map((row) => `gcd-${row.gcd_id}`)
    );
    const dedupedIssues = dedupeIssuesByBase([...mappedIssuesRaw, ...orphanIssues]);
    const mappedIssues = dedupedIssues.length
      ? dedupedIssues
      : mappedIssuesRaw.filter((issue) => isUnnumberedIssue(issue.issue_number) && !variantIds.has(issue.id));
    const featuredCover =
      mappedIssues.find((issue) => issue.cover)?.cover ?? null;

    const allYears = mappedIssues
      .map((issue) => issue.release_year)
      .filter((year) => year != null);
    const fullYearStart = allYears.length ? Math.min(yearStart ?? Infinity, ...allYears) : yearStart;
    const fullYearEnd = allYears.length ? Math.max(yearEnd ?? -Infinity, ...allYears) : yearEnd;
    const [memberStats, siblingRuns] = await publicStatsPromise;

    return NextResponse.json({
      degraded,
      series: {
        id: series.id,
        title: series.title ?? "Untitled Series",
        publisher: resolvedPublisher,
        issue_count: mappedIssues.length,
        year_start: fullYearStart,
        year_end: fullYearEnd,
        featured_cover: featuredCover,
        reprint_count: Number(series.reprint_count) || 0,
        format_label: formatLabel(seriesFormat ?? {}),
        format_tag: formatTag({ name: series.title, ...seriesFormat }),
        format_tag_title: formatTagTitle({ name: series.title, ...seriesFormat }),
        format_noun: formatNoun(seriesFormat ?? {}),
        collects: collectedEdition ? collectsLines(seriesFormat?.format_notes) : [],
        key_issues: keyIssues,
        top_creators: topCreators,
        creator_credited_issues: creatorCreditedIssues,
        member_stats: memberStats,
        sibling_volumes: siblingRuns.volumes,
        sibling_volume_count: siblingRuns.count,
        links: seriesLinks,
        issues: mappedIssues,
      },
    // A degraded response must not be cached at the CDN for ten minutes.
    }, degraded ? undefined : { headers: CDN_CACHE_SHORT });
  } catch (err) {
    console.error("GET /api/series/[id] crashed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
