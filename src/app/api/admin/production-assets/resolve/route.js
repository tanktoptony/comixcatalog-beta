// POST /api/admin/production-assets/resolve
//
// Body: { text: "Uncanny X-Men #141\nHouse of X #1 ..." }
//
// Turns a pasted list of books into catalog issues and the covers the site
// shows for them. Internal tool for video production; ADMIN_ID only.
//
// Matching reuses the rules the CSV importer and /api/catalog/lookup already
// proved (src/lib/csvImport/matchRow.js): normalized titles, matchIssue for
// "1" vs "001", and a refusal to guess between volumes. The cover for each
// candidate comes from the issue page's own handler (lookupIssue), so this
// tool and /issue/<id> can never disagree.
//
// Two things this adds, both surfaced in the result rather than applied
// silently:
//
//   - Alternate-title fallback. GCD splits the 1963 run into "The X-Men"
//     (#1-141) and "The Uncanny X-Men" (#142+), so "Uncanny X-Men #129"
//     finds no Uncanny volume carrying #129. When the requested title finds
//     no carrier, volumes whose title is a trailing part of it ("X-Men" in
//     "Uncanny X-Men") are tried next. A match found this way is marked
//     confidence "inferred" with a note naming the catalog title.
//
//   - Year hints. An explicit year is tried as the series start year, then as
//     the issue's own year, then +/-1 on the start year. A year inherited from
//     an earlier line (see parseRequestLines) is a soft hint: if no carrier
//     fits it, it is dropped with a note instead of failing the line.

import { NextResponse } from "next/server";
import { matchIssue, issueKey } from "@/lib/csvImport/matchRow";
import { isCollectedEdition } from "@/lib/seriesFormat";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";
import { parseYear } from "@/lib/years";
import { parseRequestLines, titleKey } from "@/lib/productionAssets";
import { serviceClient, adminRefusal, lookupIssue, mapLimit } from "@/lib/productionAssetsServer";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_LINES = 100;
// Candidates per ambiguous line that get a cover lookup. "X-Men #15" with no
// year matches a couple dozen volumes; the list is pre-sorted so the ones
// cut off are the least likely (no ComicVine volume, fewest issues).
const MAX_CANDIDATES = 12;

const SERIES_COLS =
  "id, gcd_id, title, title_normalized, resolved_publisher_cached, year_start_cached, year_end_cached, issue_count_cached, comicvine_volume_id";

// Both spellings a stored issue_number might use for what was typed.
function issueForms(issue) {
  const { raw, reduced } = issueKey(issue);
  return [...new Set([raw, reduced].filter(Boolean))];
}

// Word-suffixes of a title, longest first, excluding the whole title:
// "Uncanny X-Men" -> ["x men"]. Short fragments ("men") are skipped; they
// would match unrelated series and are never what a rename looks like.
function suffixKeys(title) {
  const words = String(title ?? "")
    .replace(/^the\s+/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const keys = [];
  for (let i = 1; i < words.length; i += 1) {
    const key = words.slice(i).join("");
    if (key.length >= 4) keys.push(key);
  }
  return keys;
}

async function fetchSeriesPool(supabase, keys) {
  if (!keys.length) return [];
  const names = keys.flatMap((k) => [k, `the${k}`]);
  const rows = await fetchAllPages(() =>
    supabase
      .from("series")
      .select(SERIES_COLS)
      .in("title_normalized", names)
      .not("gcd_id", "is", null)
      .gt("issue_count_cached", 0)
  );
  if (!rows.length) return rows;

  // Collected editions share a title with the run they collect; a request
  // for "House of M #1" means the comic, not the trade. Unknown format (not
  // synced, or the column missing) keeps the row, same as everywhere else.
  const formats = new Map();
  const { data: fmtRows, error } = await supabase
    .from("gcd_series")
    .select("gcd_id, publishing_format, binding")
    .in("gcd_id", rows.map((r) => r.gcd_id));
  if (!error) for (const f of fmtRows ?? []) formats.set(f.gcd_id, f);
  return rows.filter((r) => !isCollectedEdition(formats.get(r.gcd_id) ?? {}));
}

// Every volume in the pool that actually carries the issue.
async function findCarriers(supabase, pool, issue) {
  if (!pool.length) return [];
  const forms = issueForms(issue);
  const ids = pool.map((s) => s.gcd_id);

  const issueRows = await fetchAllPages(
    () =>
      supabase
        .from("gcd_issues")
        .select("gcd_id, series_gcd_id, issue_number, key_date, publication_date")
        .in("series_gcd_id", ids)
        .order("series_gcd_id")
        .in("issue_number", forms),
    "gcd_id"
  );
  const bySeries = new Map();
  for (const row of issueRows) {
    if (!bySeries.has(row.series_gcd_id)) bySeries.set(row.series_gcd_id, []);
    bySeries.get(row.series_gcd_id).push(row);
  }

  const carriers = [];
  const withoutIssue = [];
  for (const series of pool) {
    const hit = matchIssue(bySeries.get(series.gcd_id) ?? [], issue);
    if (hit) {
      carriers.push({
        series,
        issueId: `gcd-${hit.gcd_id}`,
        issueNumber: hit.issue_number,
        issueYear: parseYear(hit.publication_date) ?? parseYear(hit.key_date),
      });
    } else {
      withoutIssue.push(series);
    }
  }

  // Orphan issues: a cover linked to the volume by series_gcd_id with no
  // gcd_issues row, because GCD's mirror lags actively publishing series.
  // The site addresses these as cv-<series_gcd_id>-<base>; so do we.
  if (withoutIssue.length) {
    const { data: coverRows, error: coverErr } = await supabase
      .from("canonical_covers")
      .select("series_gcd_id, issue_number, cover_date")
      .in("series_gcd_id", withoutIssue.map((s) => s.gcd_id))
      .in("issue_number", forms)
      .not("storage_path", "is", null);
    if (coverErr) throw coverErr;
    const { reduced } = issueKey(issue);
    const seen = new Set();
    for (const row of coverRows ?? []) {
      if (seen.has(row.series_gcd_id)) continue;
      seen.add(row.series_gcd_id);
      const series = withoutIssue.find((s) => s.gcd_id === row.series_gcd_id);
      carriers.push({
        series,
        issueId: `cv-${row.series_gcd_id}-${reduced}`,
        issueNumber: row.issue_number,
        issueYear: parseYear(row.cover_date),
      });
    }
  }
  return carriers;
}

// Narrow carriers by a year, trying the readings a person might mean.
function filterByYear(carriers, year) {
  const start = (c) => Number(c.series.year_start_cached);
  const exactStart = carriers.filter((c) => start(c) === year);
  if (exactStart.length) return { list: exactStart, how: "series start year" };
  const issueYear = carriers.filter((c) => c.issueYear === year);
  if (issueYear.length) return { list: issueYear, how: "issue year" };
  const near = carriers.filter((c) => Number.isFinite(start(c)) && Math.abs(start(c) - year) <= 1);
  if (near.length) return { list: near, how: "series start year +/-1" };
  return null;
}

// Most plausible first: volumes ComicVine knows, then longer runs.
function preSort(carriers) {
  return [...carriers].sort((a, b) => {
    const cv = (b.series.comicvine_volume_id ? 1 : 0) - (a.series.comicvine_volume_id ? 1 : 0);
    if (cv) return cv;
    return (b.series.issue_count_cached ?? 0) - (a.series.issue_count_cached ?? 0);
  });
}

async function describe(carrier) {
  const { series } = carrier;
  const info = await lookupIssue(carrier.issueId).catch((err) => ({ ok: false, error: err.message }));
  return {
    issueId: carrier.issueId,
    seriesId: series.id,
    seriesGcdId: series.gcd_id,
    seriesTitle: (info.ok && info.seriesTitle) || series.title,
    seriesFormat: info.ok ? info.seriesFormat : null,
    yearStart: series.year_start_cached ?? null,
    yearEnd: series.year_end_cached ?? null,
    issueCount: series.issue_count_cached ?? null,
    comicvineVolumeId: series.comicvine_volume_id ?? null,
    issueNumber: (info.ok && info.issueNumber) || carrier.issueNumber,
    year: (info.ok && info.year) || carrier.issueYear || null,
    publisher: (info.ok && info.publisher) || series.resolved_publisher_cached || null,
    cover: info.ok ? info.cover : null,
    storagePath: info.ok ? info.storagePath : null,
    lookupError: info.ok ? null : info.error,
  };
}

function volumeLabel(s) {
  const span = s.year_start_cached ? `${s.year_start_cached}${s.year_end_cached && s.year_end_cached !== s.year_start_cached ? `-${s.year_end_cached}` : ""}` : "year unknown";
  return `${s.title} (${span}, ${s.issue_count_cached ?? "?"} issues)`;
}

async function resolveOne(supabase, req) {
  const base = {
    requested: req.requested,
    parsed: { title: req.title, issue: req.issue, year: req.year, yearSource: req.yearSource },
    status: "missing",
    confidence: null,
    notes: [],
    match: null,
    candidates: [],
    totalCandidates: 0,
  };
  if (req.error) return { ...base, status: "error", notes: [req.error] };

  const stages = [
    { name: "title", keys: [titleKey(req.title)] },
    { name: "alternate title", keys: suffixKeys(req.title) },
  ];

  let fallback = null;
  let volumesWithoutIssue = [];
  for (const stage of stages) {
    const pool = await fetchSeriesPool(supabase, stage.keys);
    const carriers = await findCarriers(supabase, pool, req.issue);
    if (!carriers.length) {
      if (stage.name === "title") volumesWithoutIssue = pool;
      continue;
    }

    const notes = [];
    let list = carriers;
    let inferred = stage.name !== "title";
    if (req.year != null) {
      const f = filterByYear(carriers, req.year);
      if (f) {
        list = f.list;
        if (req.yearSource === "inherited") {
          inferred = true;
          notes.push(`Year ${req.year} carried over from an earlier line (matched as ${f.how}).`);
        }
      } else if (req.yearSource === "inherited") {
        notes.push(`Year ${req.year} carried over from an earlier line fit no volume and was ignored.`);
      } else {
        // An explicit year that no volume here fits: try the next stage,
        // but keep these in case nothing better turns up.
        fallback ??= { stage, carriers };
        continue;
      }
    }

    if (stage.name !== "title") {
      notes.push(`No "${req.title}" volume carries #${req.issue}; matched on the catalog title "${list[0].series.title}".`);
    }
    return finish(base, list, { inferred, notes });
  }

  if (fallback) {
    return finish(base, fallback.carriers, {
      inferred: true,
      forceAmbiguous: true,
      notes: [`No volume fits year ${req.year}. These volumes carry #${req.issue}; pick one or fix the year.`],
    });
  }

  if (volumesWithoutIssue.length) {
    base.notes.push(
      `Found ${volumesWithoutIssue.length} volume(s) titled "${req.title}" but none carries #${req.issue}: ` +
        volumesWithoutIssue.slice(0, 5).map(volumeLabel).join("; ") +
        (volumesWithoutIssue.length > 5 ? "; ..." : "")
    );
  } else {
    base.notes.push(`No catalog series titled "${req.title}".`);
  }
  return base;
}

async function finish(base, carriers, { inferred, notes, forceAmbiguous = false }) {
  const sorted = preSort(carriers);
  const described = await mapLimit(sorted.slice(0, MAX_CANDIDATES), 4, describe);
  // Candidates with a cover float up, but only for display order; nothing is
  // chosen for being the one with a picture.
  described.sort((a, b) => (b.cover ? 1 : 0) - (a.cover ? 1 : 0));

  if (described.length === 1 && !forceAmbiguous) {
    const match = described[0];
    const extra = [];
    if (!match.cover) extra.push("Matched, but the catalog shows no cover for this issue.");
    if (match.lookupError) extra.push(`Cover lookup failed: ${match.lookupError}`);
    return {
      ...base,
      status: "matched",
      confidence: inferred ? "inferred" : "exact",
      notes: [...notes, ...extra],
      match,
      candidates: described,
      totalCandidates: carriers.length,
    };
  }
  return {
    ...base,
    status: "ambiguous",
    confidence: null,
    notes: [
      ...notes,
      `${carriers.length} volumes carry #${base.parsed.issue}` +
        (carriers.length > described.length ? ` (showing ${described.length})` : "") +
        (base.parsed.year == null
          ? `. Pick one, or add a year to the line${described[0]?.yearStart ? `, e.g. (${described[0].yearStart})` : ""}.`
          : ". Pick one."),
    ],
    candidates: described,
    totalCandidates: carriers.length,
  };
}

export async function POST(req) {
  const refusal = await adminRefusal(req);
  if (refusal) return refusal;
  const body = await req.json().catch(() => ({}));
  const parsed = parseRequestLines(body.text);
  if (!parsed.length) {
    return NextResponse.json({ error: "Paste at least one line like: Uncanny X-Men #141" }, { status: 400 });
  }
  if (parsed.length > MAX_LINES) {
    return NextResponse.json({ error: `Too many lines (${parsed.length}); max ${MAX_LINES} per run.` }, { status: 400 });
  }

  const supabase = serviceClient();
  const results = await mapLimit(parsed, 3, async (line, index) => {
    try {
      return { index, ...(await resolveOne(supabase, line)) };
    } catch (err) {
      console.error("production-assets resolve failed for", line.requested, err);
      return {
        index,
        requested: line.requested,
        parsed: { title: line.title, issue: line.issue, year: line.year, yearSource: line.yearSource },
        status: "error",
        confidence: null,
        notes: [`Lookup error: ${err?.message ?? String(err)}`],
        match: null,
        candidates: [],
        totalCandidates: 0,
      };
    }
  });

  return NextResponse.json({ results });
}
