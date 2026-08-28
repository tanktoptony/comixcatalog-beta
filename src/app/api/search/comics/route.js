import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { US_PUBLISHER_ALLOWLIST } from "@/lib/publisher";

function normalizeSearch(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeForScoring(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\b(the|a|an)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeIssueNumber(value) {
  return String(value ?? "").trim().toLowerCase();
}

function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

const COVER_YEAR_DIFF_THRESHOLD = 2;

function pickBestCoverPath(rows, targetYear) {
  if (!rows?.length) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const r of rows) {
    if (!r.storage_path) continue;
    const y = parseYear(r.cover_date);
    if (y == null || targetYear == null) {
      if (!best) best = r;
      continue;
    }
    const diff = Math.abs(y - targetYear);
    if (diff > COVER_YEAR_DIFF_THRESHOLD) continue;
    if (diff < bestDiff) {
      best = r;
      bestDiff = diff;
    }
  }
  return best?.storage_path ?? null;
}

function scoreSeriesTitle(title, normalizedQ) {
  const t = normalizeForScoring(title);
  if (!t || !normalizedQ) return 0;
  if (t === normalizedQ) return 1000;
  if (t.startsWith(normalizedQ)) {
    return 600 - Math.min(300, t.length - normalizedQ.length);
  }
  if (t.includes(normalizedQ)) {
    return 250 - Math.min(200, t.length - normalizedQ.length);
  }
  return 10;
}

function extractIssueNumberFromQuery(q) {
  const trimmed = String(q ?? "").trim();
  const match = trimmed.match(/(?:^|[\s#])(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const num = Number(match[1]);
  if (Number.isInteger(num) && num >= 1900 && num <= 2099) {
    return null;
  }
  return match[1];
}

function stripTrailingIssueNumber(q) {
  const trimmed = String(q ?? "").trim();
  const match = trimmed.match(/([\s#])(\d+(?:\.\d+)?)$/);
  if (!match) return trimmed;
  const num = Number(match[2]);
  if (Number.isInteger(num) && num >= 1900 && num <= 2099) {
    return trimmed;
  }
  return trimmed.slice(0, match.index).trim();
}

function scoreIssueNumberMatch(issueNumber, queriedIssueNumber) {
  if (!queriedIssueNumber) return 0;
  const normalized = normalizeIssueNumber(issueNumber);
  if (!normalized) return 0;
  if (normalized === queriedIssueNumber) return 500;
  const numericQ = Number(queriedIssueNumber);
  if (!Number.isNaN(numericQ) && normalized === String(numericQ)) return 500;
  return 0;
}

function dedupeById(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = String(row?.id ?? "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function isPlaceholderIssueNumber(value) {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return true;
  return s === "[nn]" || s === "nn" || s === "(nn)";
}

// Same fix as /api/search/series (see scripts/migrations/0023_series_search_relevance.sql
// for the full incident writeup): title_normalized has no index, so this
// used to be a full sequential scan every search, ordered by issue_count_cached
// BEFORE relevance was considered — a real series backing the exact issue
// someone searched for could rank outside the old top-30 cutoff on a
// heavily-collided title and never surface. Falls back to the old ILIKE
// query if the migration hasn't been run yet.
async function fetchSeriesCandidates(supabase, normalizedQ) {
  const { data, error } = await supabase.rpc("search_series_by_relevance", {
    normalized_term: normalizedQ,
    allowed_publishers: US_PUBLISHER_ALLOWLIST,
    result_limit: 150,
  });
  if (!error) return data ?? [];

  console.error(
    "search_series_by_relevance RPC unavailable, falling back to ILIKE search — " +
      "run scripts/migrations/0023_series_search_relevance.sql to fix this:",
    error.message
  );
  const { data: fallbackRows, error: fallbackError } = await supabase
    .from("series")
    .select("gcd_id, title, resolved_publisher_cached, issue_count_cached")
    .ilike("title_normalized", `%${normalizedQ}%`)
    .not("gcd_id", "is", null)
    .gt("issue_count_cached", 0)
    .in("resolved_publisher_cached", US_PUBLISHER_ALLOWLIST)
    .order("issue_count_cached", { ascending: false })
    .limit(30);
  if (fallbackError) throw fallbackError;
  return fallbackRows ?? [];
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const queriedIssueNumber = extractIssueNumberFromQuery(q);
    const strippedQuery = stripTrailingIssueNumber(q);
    const titleQuery = queriedIssueNumber && strippedQuery ? strippedQuery : q;
    const normalizedQ = normalizeSearch(titleQuery);
    const normalizedQForScoring = normalizeForScoring(titleQuery);
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || 36), 36));
    const offset = Math.max(0, Number(searchParams.get("offset") || 0));

    if (!q || !normalizedQ) {
      return NextResponse.json({ comics: [] });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // User-comics search and series-candidate search are independent —
    // run them concurrently instead of back-to-back (found while chasing
    // the "slow, staggered" search complaint 2026-08-28; this route did
    // up to 5 sequential round trips per request before this pass).
    const [userComicsResult, seriesCandidates] = await Promise.all([
      offset === 0
        ? supabase
            .from("comics")
            .select(`
              id,
              series_title,
              publisher,
              issue_number,
              release_year,
              variant_name,
              created_by,
              comic_covers (
                image_path,
                is_primary
              )
            `)
            .ilike("series_title", `%${titleQuery}%`)
            .order("created_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
      fetchSeriesCandidates(supabase, normalizedQ).catch((err) => {
        console.error("series search for comics failed:", err);
        return [];
      }),
    ]);

    const userRows = (userComicsResult.data ?? []).map((comic) => ({
      id: comic.id,
      series_title: comic.series_title ?? null,
      publisher: comic.publisher ?? null,
      issue_number: comic.issue_number,
      release_year: comic.release_year,
      variant_name: comic.variant_name,
      created_by: comic.created_by ?? null,
      cover_path:
        comic.comic_covers?.find((c) => c.is_primary)?.image_path ?? null,
      __source: "user",
    }));

    const scoredSeries = seriesCandidates
      .map((s) => ({
        ...s,
        __score: scoreSeriesTitle(s.title, normalizedQForScoring),
      }))
      .sort((a, b) => b.__score - a.__score);

    const strongSeries = scoredSeries.filter((s) => s.__score > 10);
    const seriesPool = (strongSeries.length > 0 ? strongSeries : scoredSeries).slice(
      0,
      20
    );
    const seriesGcdIds = [
      ...new Set(seriesPool.map((s) => s.gcd_id).filter(Boolean)),
    ];

    const seriesLookup = Object.fromEntries(
      seriesPool.map((s) => [
        String(s.gcd_id),
        {
          title: s.title ?? null,
          publisher: s.resolved_publisher_cached ?? "Unknown Publisher",
        },
      ])
    );

    let gcdRows = [];
    if (seriesGcdIds.length > 0) {
      const baseFetchLimit = Math.min(120, offset + limit + 40);
      const { data: baseGcdIssues, error: gcdError } = await supabase
        .from("gcd_issues")
        .select("gcd_id, series_gcd_id, issue_number, title, publication_date")
        .in("series_gcd_id", seriesGcdIds)
        .order("gcd_id", { ascending: true })
        .limit(baseFetchLimit);

      if (gcdError) {
        console.error("gcd issue search failed:", gcdError);
      } else {
        let gcdIssues = baseGcdIssues ?? [];

        if (queriedIssueNumber) {
          const { data: matchingIssueRows, error: matchingIssueError } =
            await supabase
              .from("gcd_issues")
              .select("gcd_id, series_gcd_id, issue_number, title, publication_date")
              .in("series_gcd_id", seriesGcdIds)
              .eq("issue_number", queriedIssueNumber)
              .limit(100);

          if (matchingIssueError) {
            console.error(
              "gcd issue-number targeted fetch failed:",
              matchingIssueError
            );
          } else if (matchingIssueRows?.length) {
            const seen = new Set(gcdIssues.map((r) => r.gcd_id));
            for (const row of matchingIssueRows) {
              if (!seen.has(row.gcd_id)) {
                gcdIssues.push(row);
                seen.add(row.gcd_id);
              }
            }
          }
        }

        gcdRows = gcdIssues
          .filter((issue) => !isPlaceholderIssueNumber(issue.issue_number))
          .map((issue) => {
            const seriesInfo = seriesLookup[String(issue.series_gcd_id)] ?? {};
            return {
              id: `gcd-${issue.gcd_id}`,
              series_title: seriesInfo.title ?? issue.title ?? null,
              publisher: seriesInfo.publisher ?? "Unknown Publisher",
              issue_number: issue.issue_number,
              release_year: parseYear(issue.publication_date),
              variant_name: null,
              created_by: null,
              __source: "gcd",
            };
          });
      }
    }

    const ranked = dedupeById([...userRows, ...gcdRows])
      .map((row) => ({
        ...row,
        __score:
          scoreSeriesTitle(row.series_title, normalizedQForScoring) +
          scoreIssueNumberMatch(row.issue_number, queriedIssueNumber) +
          (row.__source === "user" ? 50 : 0),
      }))
      .sort((a, b) => b.__score - a.__score);

    // Printing-variant dedup. GCD models each printing of the same comic as
    // its own gcd_series row (direct edition, newsstand, 2nd print, foreign
    // distribution). Result: searching "spider-man 35" returns 8 identical
    // tiles for what's effectively one comic. Collapse on
    // (normalized title, issue#, year, normalized publisher) and keep the
    // highest-scoring representative. The total survives via variant_count
    // for transparency. User-added rows are NEVER collapsed — they're each
    // a real distinct copy in someone's collection.
    const normPub = (s) =>
      String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const variantGroups = new Map();
    const collapsed = [];
    for (const row of ranked) {
      if (row.__source !== "gcd") {
        collapsed.push(row);
        continue;
      }
      const key = [
        normalizeSearch(row.series_title),
        normalizeIssueNumber(row.issue_number),
        row.release_year ?? "",
        normPub(row.publisher),
      ].join("::");
      if (!variantGroups.has(key)) {
        variantGroups.set(key, { row, count: 1 });
        collapsed.push(row);
      } else {
        variantGroups.get(key).count += 1;
      }
    }
    // Stamp variant_count on the representative row for any group with >1 variant
    for (const row of collapsed) {
      if (row.__source !== "gcd") continue;
      const key = [
        normalizeSearch(row.series_title),
        normalizeIssueNumber(row.issue_number),
        row.release_year ?? "",
        normPub(row.publisher),
      ].join("::");
      const grp = variantGroups.get(key);
      if (grp && grp.count > 1) row.variant_count = grp.count;
    }

    const pageSlice = collapsed.slice(offset, offset + limit);

    const gcdSlice = pageSlice.filter((row) => row.__source === "gcd");
    const sliceSeriesTitles = [
      ...new Set(gcdSlice.map((r) => r.series_title).filter(Boolean)),
    ];
    const sliceIssueNumbers = [
      ...new Set(gcdSlice.map((r) => r.issue_number).filter((v) => v != null)),
    ];

    const canonicalCandidatesByKey = {};
    if (sliceSeriesTitles.length > 0 && sliceIssueNumbers.length > 0) {
      const { data: canonicalRows, error: canonicalError } = await supabase
        .from("canonical_covers")
        .select("series_title, issue_number, storage_path, cover_date")
        .in("series_title", sliceSeriesTitles)
        .in("issue_number", sliceIssueNumbers);

      if (canonicalError) {
        console.error("canonical cover lookup failed:", canonicalError);
      } else {
        for (const row of canonicalRows ?? []) {
          if (!row.storage_path) continue;
          const key = `${normalizeSearch(row.series_title)}::${normalizeIssueNumber(row.issue_number)}`;
          if (!canonicalCandidatesByKey[key]) canonicalCandidatesByKey[key] = [];
          canonicalCandidatesByKey[key].push(row);
        }
      }
    }

    const comics = pageSlice.map(({ __score, ...row }) => {
      // Keep __source on the response. Stripping it made the frontend default
      // every result to "user" (Header.js / SearchPageClient.js both do
      // `row.__source || "user"`), so canonical gcd issues were mislabeled
      // "User Added". Now "gcd" rows correctly carry their source.
      if (row.__source !== "gcd") return row;
      const key = `${normalizeSearch(row.series_title)}::${normalizeIssueNumber(row.issue_number)}`;
      const storagePath = pickBestCoverPath(canonicalCandidatesByKey[key], row.release_year);
      return {
        ...row,
        cover_path: storagePath
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${storagePath}`
          : null,
      };
    });

    return NextResponse.json({ comics });
  } catch (err) {
    console.error("GET /api/search/comics crashed:", err);
    return NextResponse.json({ comics: [] });
  }
}
