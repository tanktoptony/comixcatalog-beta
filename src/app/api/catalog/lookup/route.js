// GET /api/catalog/lookup?title=&issue=&year=&publisher=
//
// "Do we already have this book?" — asked BEFORE anyone is allowed to add a
// new one to the public catalog.
//
// Why this exists: /contribute/add-comic used to go straight to an INSERT.
// Its only defence against duplicating a book we already had was, in the
// POST handler:
//
//   series .eq("title", title) .eq("publisher_id", publisher.id) .single()
//
// which cannot work here, for two independent reasons measured live on
// 2026-09-24:
//
//   - publisher_id is set on 112 of 208,022 series rows. The catalog carries
//     its publisher in resolved_publisher_cached; the publishers table is a
//     near-empty legacy side table with 9,453 rows including "Marvel",
//     "Marvel Comics" and "Marvel Comics Group" as three separate entries.
//     So the filter excluded essentially the entire catalog.
//
//   - .single() against a title with more than one volume returns an ERROR,
//     not a row, and the caller destructured only `data`. Ten series are
//     titled exactly "Rai". Every one of them would have been missed, and an
//     eleventh created.
//
// The matching rules are the ones already proven by the CSV importer, reused
// rather than reimplemented: normalized title, publisher as a tiebreak only,
// and an explicit refusal to guess when several volumes fit.
//
// Read-only and unauthenticated by design. It returns nothing that
// /api/search/series does not already return to anonymous visitors, and
// requiring a session would mean the duplicate check could not run until
// after someone had already filled the form in.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeKey, chooseSeries, matchIssue } from "@/lib/csvImport/matchRow";

const PAGE = 1000;

// How many volumes we are willing to check issue-by-issue. Ten series are
// called "Rai"; "The Amazing Spider-Man" and its neighbours run to dozens.
const MAX_VOLUMES_CHECKED = 25;

// title_normalized strips spaces, so it cannot tell "Rai" inside
// "Tomb RAIder" from "Rai" as an actual word. This rebuilds a spaced form
// from the original title and asks whether the query appears in it as a
// whole word sequence.
function spacedForm(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsWholeWords(title, query) {
  const t = ` ${spacedForm(title)} `;
  const q = ` ${spacedForm(query)} `;
  return q.trim().length > 0 && t.includes(q);
}

// Rank the ILIKE results by how much like a real answer they are.
//
//   0  the title normalizes to exactly what was typed
//   1  the query appears in the title as whole words
//   2  the query is only a substring somewhere inside a word
//
// Tiers 0 and 1 are kept TOGETHER. Collapsing to tier 0 alone was a real
// false negative, caught in dev before this shipped: typing "Amazing
// Spider-Man" found four minor series whose titles normalize to exactly
// that, and therefore threw away both runs actually called "The Amazing
// Spider-Man" — the 650-issue 1963 volume and the 267-issue 1999 one. The
// form would have offered to create ASM #300 as a new catalog entry.
//
// Tier 2 is a last resort, because it is where "Rai" matches "Tomb Raider".
// Coarse size bands, matching how /api/search/series already thinks about
// significance. Bands rather than the raw count so that two series of
// similar length are still separated by how well their title matched, and
// only a genuinely different order of magnitude overrides it.
function significanceBand(count) {
  const n = Number(count) || 0;
  if (n >= 200) return 4; // a decades-long run
  if (n >= 50) return 3;
  if (n >= 15) return 2;
  if (n >= 3) return 1;
  return 0; // one-shots, stubs and mis-ingested fragments
}

function relevanceTier(row, normalized, rawTitle) {
  if (row.title_normalized === normalized) return 0;
  if (containsWholeWords(row.title, rawTitle)) return 1;
  return 2;
}

// §2a: PostgREST caps an unbounded select at 1000 rows and reports success.
// A popular title can exceed that on its own, and silently losing the tail
// here means telling someone we do not have a book we do have — the exact
// failure this endpoint exists to prevent.
async function fetchAllPages(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const title = (searchParams.get("title") || "").trim();
    const issue = (searchParams.get("issue") || "").trim();
    const year = (searchParams.get("year") || "").trim();
    const publisher = (searchParams.get("publisher") || "").trim();

    const normalized = normalizeKey(title);
    if (normalized.length < 2) {
      return NextResponse.json({ status: "none", candidates: [] });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Substring rather than prefix: a collector types "future force" for
    // "Rai and the Future Force" as readily as they type the full title.
    let rows;
    try {
      rows = await fetchAllPages(() =>
        supabase
          .from("series")
          .select(
            "id, gcd_id, title, title_normalized, resolved_publisher_cached, year_start_cached, year_end_cached, issue_count_cached, featured_cover_path_cached"
          )
          .ilike("title_normalized", `%${normalized}%`)
          .not("gcd_id", "is", null)
          .gt("issue_count_cached", 0)
          .order("issue_count_cached", { ascending: false })
      );
    } catch (err) {
      console.error("GET /api/catalog/lookup series query failed:", err);
      return NextResponse.json({ status: "error", candidates: [] }, { status: 500 });
    }

    if (rows.length === 0) {
      return NextResponse.json({ status: "none", candidates: [] });
    }

    const tiered = rows.map((r) => ({ row: r, tier: relevanceTier(r, normalized, title) }));
    const strong = tiered.filter((t) => t.tier <= 1);
    const pool = (strong.length > 0 ? strong : tiered)
      .sort((a, b) => {
        // Size first, tier second. Sorting by tier first was wrong, and
        // visibly so: typing "amazing spider-man" returned six volumes and
        // BOTH of the runs anyone means were missing. The 650-issue 1963
        // run and the 267-issue 1999 run are titled "The Amazing Spider-Man",
        // which is tier 1, and six shorter series normalize to exactly
        // "amazingspiderman" and are tier 0 — including one called
        // "????????? [Amazing Spider-Man]" with no year and no publisher.
        // Strict tier order put all six ahead of both real runs, and the
        // six-row display cap then cut the real ones off entirely.
        //
        // A 650-issue run is the canonical book whatever its article. The
        // bands are coarse on purpose, so tier still separates series of
        // comparable size rather than being swamped by a raw count.
        const bySize = significanceBand(b.row.issue_count_cached) - significanceBand(a.row.issue_count_cached);
        if (bySize !== 0) return bySize;
        if (a.tier !== b.tier) return a.tier - b.tier;
        return (b.row.issue_count_cached ?? 0) - (a.row.issue_count_cached ?? 0);
      })
      .map((t) => t.row);

    const decision = chooseSeries(pool, { releaseYear: year, publisher });
    const shortlist =
      decision.status === "matched"
        ? [decision.series]
        : (decision.candidates ?? pool).slice(0, MAX_VOLUMES_CHECKED);

    // Does each shortlisted volume actually carry the issue number asked for?
    // This is the difference between "we have a series called Rai" and "we
    // have the exact book in your hand", and it is what decides whether the
    // contribute form should stand down.
    const gcdIds = shortlist.map((s) => s.gcd_id).filter((v) => v != null);
    const issuesBySeries = new Map();
    if (issue && gcdIds.length > 0) {
      try {
        const issueRows = await fetchAllPages(() =>
          supabase
            .from("gcd_issues")
            .select("gcd_id, series_gcd_id, issue_number")
            .in("series_gcd_id", gcdIds)
            .order("gcd_id")
        );
        for (const row of issueRows) {
          if (!issuesBySeries.has(row.series_gcd_id)) issuesBySeries.set(row.series_gcd_id, []);
          issuesBySeries.get(row.series_gcd_id).push(row);
        }
      } catch (err) {
        // A failed issue lookup must not turn into "we don't have it".
        // Degrade to series-level matches and say so by leaving
        // matching_issue null rather than claiming the book is absent.
        console.error("GET /api/catalog/lookup issue query failed:", err);
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const candidates = shortlist.map((s) => {
      const hit = issue ? matchIssue(issuesBySeries.get(s.gcd_id) ?? [], issue) : null;
      return {
        series_id: s.id,
        gcd_id: s.gcd_id,
        title: s.title,
        publisher: s.resolved_publisher_cached ?? null,
        year_start: s.year_start_cached ?? null,
        year_end: s.year_end_cached ?? null,
        issue_count: s.issue_count_cached ?? 0,
        series_href: `/series/${s.id}`,
        cover: s.featured_cover_path_cached
          ? `${supabaseUrl}/storage/v1/object/public/canonical-covers/${s.featured_cover_path_cached}`
          : null,
        matching_issue: hit
          ? {
              gcd_id: hit.gcd_id,
              issue_number: hit.issue_number,
              href: `/issue/gcd-${hit.gcd_id}`,
            }
          : null,
      };
    });

    // The status the form acts on. "have_issue" is the one that stops a
    // duplicate being created; the others are informational.
    const withIssue = candidates.filter((c) => c.matching_issue);
    const status = withIssue.length > 0 ? "have_issue" : "have_series";

    // Volumes that carry the issue lead, in tier order, so an exact title
    // sits above a loose one — typing "Saga" puts the real Saga ahead of
    // "Conan Saga", which also legitimately contains the word.
    //
    // We check up to 25 volumes to avoid the false negative above, but show
    // far fewer: the panel exists to answer "is my book already here", and
    // twenty-five near misses answer it worse than six do.
    const ordered = [...withIssue, ...candidates.filter((c) => !c.matching_issue)].slice(0, 6);

    return NextResponse.json({
      status,
      ambiguous: decision.status === "ambiguous",
      candidates: ordered,
    });
  } catch (err) {
    console.error("GET /api/catalog/lookup crashed:", err);
    return NextResponse.json({ status: "error", candidates: [] }, { status: 500 });
  }
}
