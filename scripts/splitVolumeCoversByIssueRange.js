// One ComicVine volume, several GCD series records: hand each cover to the
// series that actually contains that issue number.
//
// ComicVine models a run as one volume even when the book was renamed
// mid-run. GCD splits at the rename. So a single ComicVine volume's covers
// can belong to two or three GCD series, and because canonical_covers is
// tagged with ONE series_gcd_id, the whole volume ends up attributed to
// whichever series the ingest matched first. The other series read as having
// no covers at all.
//
// Worked example this was built from (2026-09-22):
//   cv volume 4828 holds 34 covers, issues 0-33, all tagged series_gcd_id
//   4493. But GCD splits Valiant's run three ways:
//     4493  "Rai"                      1992       issues 0-8    pinned 4828
//     5067  "Rai and the Future Force" 1993-1994  issues 9-23   NOT PINNED
//     60935 "Rai"                      1994-1995  issues 24-33  pinned 4828
//   So 25 of 34 covers were on the wrong series, and a user who owns
//   "Rai and the Future Force" #10-23 saw fourteen blank rectangles.
//
// repairAllCoverSeriesLinks.js cannot fix this. It drives off pins, and a
// volume claimed by more than one series row is deliberately excluded from
// pin-driven relinking (616 volumes are in that state) because a shared pin
// is normally a bug rather than a legitimate split.
//
// The rule here is deliberately narrow: a cover moves only when EXACTLY ONE
// candidate series lists its issue number in gcd_issues, and only when the
// cover's year is consistent with that series' publication years. Anything
// ambiguous is reported and left alone. Moving a cover to the wrong book is
// worse than leaving it where it is — that is the whole lesson of the
// wrong-cover fallback that was killed sitewide in August.
//
// Usage:
//   node scripts/splitVolumeCoversByIssueRange.js --volume=4828
//   node scripts/splitVolumeCoversByIssueRange.js --volume=4828 --apply
//   node scripts/splitVolumeCoversByIssueRange.js --volume=4828 --json=plan.json
//
// Dry run by default. --apply performs the updates.

import fs from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { normTitle } from "../src/lib/titleMatch.js";

dotenv.config({ path: ".env.local", quiet: true });

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? true];
  })
);
const VOLUME = Number(args.volume);
const APPLY = Boolean(args.apply);
const JSON_OUT = args.json ? String(args.json) : null;
// A cover dated a year outside its series' run is usually a cover-date/
// on-sale-date skew, not a different book. Two years apart is a different
// book. Same pad the repair script uses on the start side.
const YEAR_PAD = 1;

if (!Number.isInteger(VOLUME)) {
  console.error("usage: node scripts/splitVolumeCoversByIssueRange.js --volume=<comicvine volume id> [--apply]");
  process.exit(2);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PAGE = 1000;

async function allPages(build, keyCol) {
  const rows = [];
  let last = null;
  for (;;) {
    let q = build().order(keyCol).limit(PAGE);
    if (last !== null) q = q.gt(keyCol, last);
    const { data, error } = await q;
    if (error) throw new Error(`${error.code ?? "?"} | ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
    last = data[data.length - 1][keyCol];
  }
  return rows;
}

// Issue numbers compare as strings after stripping variant/printing noise,
// the same normalisation the cache refresh uses. "1", "1 [Newsstand]" and
// "1A" are all issue 1; "1.5" stays 1.5.
function baseIssueNumber(value) {
  if (value == null) return null;
  const m = String(value).trim().match(/^(\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

async function main() {
  const covers = await allPages(
    () =>
      supabase
        .from("canonical_covers")
        .select("id, issue_number, series_gcd_id, series_title, series_year, cover_date, storage_path")
        .eq("comicvine_volume_id", VOLUME),
    "id"
  );
  if (!covers.length) {
    console.log(`No covers on ComicVine volume ${VOLUME}.`);
    return;
  }
  console.log(`ComicVine volume ${VOLUME}: ${covers.length} covers.`);

  // Candidate series = anything pinned to this volume, plus anything sharing
  // a normalised title with one of those (which is how the unpinned middle
  // chunk of a renamed run gets found at all).
  const pinned = await allPages(
    () =>
      supabase
        .from("series")
        .select("gcd_id, title, year_start_cached, year_end_cached, comicvine_volume_id")
        .eq("comicvine_volume_id", VOLUME),
    "gcd_id"
  );
  // Seeds: the titles this volume is already known by.
  const coverTitles = [...new Set(covers.map((c) => c.series_title).filter(Boolean))];
  const seeds = [...new Set([...pinned.map((p) => p.title), ...coverTitles].filter(Boolean))];

  // A rename means the other half of the run has a DIFFERENT title, so exact
  // title equality cannot find it — that is the failure this whole script is
  // about. "Rai" becomes "Rai and the Future Force". So accept a candidate
  // whose normalised title is the seed, or the seed followed by more words.
  //
  // The trailing space matters: "rai " excludes "raiders", which a bare
  // startsWith would happily swallow. Extra candidates are not free — every
  // one of them is another chance to make an issue number ambiguous and so
  // block a move that would otherwise be safe.
  const sameTitle = [];
  for (const seed of seeds) {
    const key = normTitle(seed);
    if (!key) continue;
    const rows = await allPages(
      () =>
        supabase
          .from("series")
          .select("gcd_id, title, year_start_cached, year_end_cached, comicvine_volume_id")
          .ilike("title", `${String(seed).replace(/[%_]/g, "")}%`)
          .not("year_start_cached", "is", null),
      "gcd_id"
    );
    for (const r of rows) {
      const k = normTitle(r.title);
      if (k === key || k.startsWith(`${key} `)) sameTitle.push(r);
    }
  }

  const candidates = [...new Map([...pinned, ...sameTitle].map((r) => [r.gcd_id, r])).values()];
  console.log(`Candidate GCD series: ${candidates.length}`);

  // Which issue numbers does each candidate actually contain?
  const issuesBySeries = new Map();
  for (const c of candidates) {
    const rows = await allPages(
      () => supabase.from("gcd_issues").select("gcd_id, issue_number").eq("series_gcd_id", c.gcd_id),
      "gcd_id"
    );
    const set = new Set(rows.map((r) => baseIssueNumber(r.issue_number)).filter(Boolean));
    issuesBySeries.set(c.gcd_id, set);
    const nums = [...set].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    console.log(
      `  ${String(c.gcd_id).padEnd(7)} ${String(c.title).slice(0, 32).padEnd(34)} ` +
        `${c.year_start_cached ?? "?"}-${c.year_end_cached ?? "?"}  pin=${c.comicvine_volume_id ?? "none"}  ` +
        `issues ${nums.length ? `${nums[0]}-${nums[nums.length - 1]} (${nums.length})` : "none"}`
    );
  }

  const yearOk = (series, cover) => {
    const y = Number(cover.series_year) || Number(String(cover.cover_date ?? "").slice(0, 4));
    if (!Number.isFinite(y)) return true; // no year on the cover — don't block on it
    const start = Number(series.year_start_cached);
    const end = Number(series.year_end_cached) || start;
    if (!Number.isFinite(start)) return true;
    return y >= start - YEAR_PAD && y <= end + YEAR_PAD;
  };

  const moves = [];
  const ambiguous = [];
  const unmatched = [];
  let alreadyRight = 0;

  for (const cover of covers) {
    const num = baseIssueNumber(cover.issue_number);
    if (!num) {
      unmatched.push({ cover, why: "cover has no numeric issue number" });
      continue;
    }
    const owners = candidates.filter((c) => issuesBySeries.get(c.gcd_id)?.has(num) && yearOk(c, cover));
    if (owners.length === 0) {
      unmatched.push({ cover, why: `no candidate series lists issue ${num} in a consistent year` });
      continue;
    }
    if (owners.length > 1) {
      ambiguous.push({ cover, why: `issue ${num} is listed by ${owners.map((o) => o.gcd_id).join(", ")}` });
      continue;
    }
    const owner = owners[0];
    if (cover.series_gcd_id === owner.gcd_id) {
      alreadyRight += 1;
      continue;
    }
    moves.push({ coverId: cover.id, issue: num, from: cover.series_gcd_id, to: owner.gcd_id, toTitle: owner.title });
  }

  console.log("");
  console.log(`Already on the right series: ${alreadyRight}`);
  console.log(`To move:                     ${moves.length}`);
  console.log(`Ambiguous (left alone):      ${ambiguous.length}`);
  console.log(`Unmatched (left alone):      ${unmatched.length}`);

  const byTarget = new Map();
  for (const m of moves) {
    if (!byTarget.has(m.to)) byTarget.set(m.to, []);
    byTarget.get(m.to).push(m);
  }
  for (const [to, list] of byTarget) {
    const nums = list.map((m) => Number(m.issue)).sort((a, b) => a - b);
    console.log(`  -> ${to} ${list[0].toTitle}: ${list.length} covers (issues ${nums[0]}-${nums[nums.length - 1]})`);
  }
  for (const a of ambiguous.slice(0, 10)) console.log(`  ambiguous: #${a.cover.issue_number} — ${a.why}`);
  for (const u of unmatched.slice(0, 10)) console.log(`  unmatched: #${u.cover.issue_number} — ${u.why}`);

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({ volume: VOLUME, moves, ambiguous, unmatched }, null, 2));
    console.log(`\nWrote ${JSON_OUT}`);
  }

  if (!APPLY) {
    console.log("\n[dry run] Nothing written. Re-run with --apply to perform these moves.");
    return;
  }
  if (!moves.length) {
    console.log("\nNothing to do.");
    return;
  }

  let done = 0;
  for (const m of moves) {
    const { error } = await supabase
      .from("canonical_covers")
      .update({ series_gcd_id: m.to })
      .eq("id", m.coverId);
    if (error) {
      console.error(`  cover ${m.coverId}: ${error.code ?? "?"} | ${error.message}`);
      continue;
    }
    done += 1;
  }
  console.log(`\nMoved ${done}/${moves.length} covers.`);

  // The cached search columns (issue_count_cached, featured_cover_path_cached)
  // are derived from these links, so every series on either side of a move is
  // now stale. Clearing search_refreshed_at is how you queue a row for
  // refreshSeriesSearchCache.js rather than recomputing it here badly.
  const touched = [...new Set(moves.flatMap((m) => [m.from, m.to]).filter((v) => v != null))];
  const { error: staleError } = await supabase
    .from("series")
    .update({ search_refreshed_at: null })
    .in("gcd_id", touched);
  if (staleError) console.error(`  failed to queue cache refresh: ${staleError.message}`);
  else console.log(`Queued ${touched.length} series for a search-cache refresh.`);
}

main().catch((err) => {
  console.error(`splitVolumeCoversByIssueRange failed: ${err?.message ?? err}`);
  process.exit(1);
});
