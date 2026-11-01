import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";
import { chooseSeries, issueKey, issueNumberOrFilter, matchIssue, normalizeKey } from "@/lib/csvImport/matchRow";
import { narrowHolders } from "@/lib/import/import";

const ROW_CAP = 200;
const SERIES_COLUMNS = "id,gcd_id,title,title_normalized,year_start_cached,issue_count_cached,resolved_publisher_cached";

// A title is looked up with and without a leading "The": exports and the
// catalog disagree on it ("Amazing Spider-Man" vs "The Amazing Spider-Man").
function titleKeys(title) {
  const text = String(title ?? "").trim();
  const bare = text.replace(/^the\s+/i, "");
  return [...new Set([normalizeKey(text), normalizeKey(bare), normalizeKey(`The ${bare}`)])].filter(Boolean);
}

// The spellings of an issue number worth asking the database for. matchIssue
// then applies the real comparison (punctuation and leading zeros ignored).
function numberSpellings(issue) {
  const { raw, reduced } = issueKey(issue);
  const out = new Set([raw, reduced]);
  if (/^\d+$/.test(reduced)) for (const pad of ["0", "00"]) out.add(`${pad}${reduced}`);
  return [...out].filter(Boolean);
}

function candidate(series) {
  return {
    series_gcd_id: series.gcd_id, title: series.title, year_start: series.year_start_cached,
    publisher: series.resolved_publisher_cached, issue_count: series.issue_count_cached,
  };
}

function label(series, issueNumber) {
  return `${series.title}${series.year_start_cached ? ` (${series.year_start_cached})` : ""} #${issueNumber}`;
}

// Resolves export rows to catalog issues without writing anything.
//
// Rows carry series_year (from a title like "X-Men (1991)") and issue_year
// (the cover or release date column) separately. A series year names the
// volume outright. Without one, the decision is made among the volumes that
// actually have the issue number: one holder wins, otherwise the issue's
// own cover year, then the publisher, narrow it down. Only a real tie asks
// the collector to pick, and only between volumes that have the issue.
//
// Issues are fetched per title for just the numbers in the batch, never as
// whole issue lists: a title like Superman has dozens of volumes, and
// loading every list made a 200-row batch take 49 seconds.
export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to import your collection." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows) return NextResponse.json({ error: "Send rows to resolve." }, { status: 400 });
  if (rows.length > ROW_CAP) return NextResponse.json({ error: `Resolve accepts at most ${ROW_CAP} rows per request.` }, { status: 400 });

  const supabase = getServiceClient();
  try {
    const seriesByTitle = new Map();
    const wantedTitles = [...new Set(rows.filter((row) => !row.series_gcd_id).flatMap((row) => titleKeys(row.series)))];
    for (let start = 0; start < wantedTitles.length; start += 100) {
      const chunk = wantedTitles.slice(start, start + 100);
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("series").select(SERIES_COLUMNS)
          .in("title_normalized", chunk).not("gcd_id", "is", null).order("id").range(from, from + 999);
        if (error) throw new Error(`Could not read the catalog: ${error.message}`);
        for (const series of data ?? []) {
          if (!seriesByTitle.has(series.title_normalized)) seriesByTitle.set(series.title_normalized, []);
          seriesByTitle.get(series.title_normalized).push(series);
        }
        if ((data?.length ?? 0) < 1000) break;
      }
    }

    const chosenIds = [...new Set(rows.map((row) => Number(row.series_gcd_id)).filter(Number.isFinite))];
    const chosenById = new Map();
    if (chosenIds.length) {
      const { data, error } = await supabase.from("series").select(SERIES_COLUMNS).in("gcd_id", chosenIds);
      if (error) throw new Error(`Could not read chosen volumes: ${error.message}`);
      for (const series of data ?? []) chosenById.set(Number(series.gcd_id), series);
    }

    // Each row's candidate volumes, then one issue query per group of rows
    // that share the same candidates.
    const poolFor = rows.map((row) => {
      if (row.series_gcd_id) {
        const series = chosenById.get(Number(row.series_gcd_id));
        return series ? [series] : [];
      }
      return [...new Map(titleKeys(row.series).flatMap((key) => seriesByTitle.get(key) ?? [])
        .map((series) => [series.gcd_id, series])).values()];
    });
    const groups = new Map();
    rows.forEach((row, index) => {
      const ids = poolFor[index].map((series) => series.gcd_id).sort((a, b) => a - b);
      if (!ids.length) return;
      const key = ids.join(",");
      if (!groups.has(key)) groups.set(key, { ids, numbers: new Set() });
      for (const spelling of numberSpellings(row.issue)) groups.get(key).numbers.add(spelling);
    });
    const issuesBySeries = new Map();
    for (const { ids, numbers } of groups.values()) {
      const spellings = [...numbers];
      // 25 spellings per query keeps the or-filter (three conditions each,
      // GCD's legacy "40 (340)" form included) well inside URL limits.
      for (let start = 0; start < ids.length; start += 100) {
        const idChunk = ids.slice(start, start + 100);
        for (let at = 0; at < spellings.length; at += 25) {
          const filter = issueNumberOrFilter(spellings.slice(at, at + 25));
          if (!filter) continue;
          for (let from = 0; ; from += 1000) {
            const { data, error } = await supabase.from("gcd_issues").select("gcd_id,series_gcd_id,issue_number,key_date")
              .in("series_gcd_id", idChunk).or(filter).is("variant_of_gcd_id", null)
              .order("gcd_id").range(from, from + 999);
            if (error) throw new Error(`Could not read issues: ${error.message}`);
            for (const issue of data ?? []) {
              const id = Number(issue.series_gcd_id);
              if (!issuesBySeries.has(id)) issuesBySeries.set(id, []);
              issuesBySeries.get(id).push(issue);
            }
            if ((data?.length ?? 0) < 1000) break;
          }
        }
      }
    }

    const results = rows.map((row, index) => {
      const title = String(row.series ?? "").trim();
      const issueNumber = String(row.issue ?? "").trim();
      if (!title || !issueNumber) return { i: row.i, result: "not_found", reason: "Series and issue number are required." };
      const pool = poolFor[index];
      if (!pool.length) return { i: row.i, result: "not_found", reason: `We could not find “${title}” in the catalog.` };

      if (row.series_year && !row.series_gcd_id) {
        const decision = chooseSeries(pool, { releaseYear: row.series_year, publisher: row.publisher });
        if (decision.status === "matched") {
          const issue = matchIssue(issuesBySeries.get(Number(decision.series.gcd_id)), issueNumber);
          return issue
            ? { i: row.i, result: "matched", gcd_issue_id: issue.gcd_id, series_gcd_id: decision.series.gcd_id, label: label(decision.series, issueNumber) }
            : { i: row.i, result: "not_found", reason: `Found ${label(decision.series, "").slice(0, -2)}, but not issue #${issueNumber}.` };
        }
      }

      const holders = pool.map((series) => ({ series, issue: matchIssue(issuesBySeries.get(Number(series.gcd_id)), issueNumber) }))
        .filter((holder) => holder.issue);
      if (!holders.length) return { i: row.i, result: "not_found", reason: `Found “${pool[0].title},” but not issue #${issueNumber}.` };
      const narrowed = narrowHolders(holders, { issueYear: row.issue_year, publisher: row.publisher });
      if (narrowed.length === 1) {
        const [{ series, issue }] = narrowed;
        return { i: row.i, result: "matched", gcd_issue_id: issue.gcd_id, series_gcd_id: series.gcd_id, label: label(series, issueNumber) };
      }
      const choices = narrowed.map((holder) => holder.series).sort((a, b) => (a.year_start_cached ?? 9999) - (b.year_start_cached ?? 9999));
      return { i: row.i, result: "pick", reason: `${choices.length} volumes of “${title}” have issue #${issueNumber}.`, candidates: choices.map(candidate) };
    });
    return NextResponse.json({ rows: results });
  } catch (error) {
    console.error("import resolve failed", error);
    return NextResponse.json({ error: error.message || "Could not resolve this batch." }, { status: 500 });
  }
}
