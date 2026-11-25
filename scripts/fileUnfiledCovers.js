// Files stored covers that belong to no series, for series members own books
// in (Tony, 2026-11-24: new members' books show too many gaps). No ComicVine
// calls and no new storage: the images are already here. The rule and the
// reasons a volume is left alone are in scripts/lib/unfiledCovers.js.
//
// Only series where a member's book is blank on the site right now are
// considered (asked of the live library route, so it is what members see).
//
//   node scripts/fileUnfiledCovers.js                dry run (default)
//   node scripts/fileUnfiledCovers.js --apply
//   node scripts/fileUnfiledCovers.js --max-rows=1500   most covers per run
//
// Only rows whose series_gcd_id AND gcd_issue_id are both null are touched,
// and the update repeats that condition, so undoing a run is setting both back
// to null for the ids it prints.

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { blankOnSite } from "./lib/blankOnSite.js";
import { withRetry } from "./lib/withRetry.js";
import { normNumber, normTitle, planSeries } from "./lib/unfiledCovers.js";

dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");
const MAX_ROWS = Number(process.argv.find((a) => a.startsWith("--max-rows="))?.split("=")[1] ?? 1500);
if (!(MAX_ROWS > 0)) throw new Error("--max-rows must be a positive number");
const PAGE = 1000;

async function pages(label, build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const rows = await withRetry(`${label} from ${from}`, () => build().range(from, from + PAGE - 1));
    out.push(...(rows ?? []));
    if (!rows || rows.length < PAGE) return out;
  }
}

async function inChunks(label, ids, size, build) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(...(await pages(label, () => build(ids.slice(i, i + size)))));
  return out;
}

const escapeLike = (name) => name.replace(/[\\%_]/g, (c) => "\\" + c);

async function main() {
  const unfiled = (
    await pages("unfiled covers", () =>
      supabase
        .from("canonical_covers")
        .select("id, comicvine_volume_id, series_title, series_year, publisher, issue_number")
        .is("series_gcd_id", null)
        .is("gcd_issue_id", null)
        .not("storage_path", "is", null)
        .order("id")
    )
  ).filter((r) => r.comicvine_volume_id != null);
  const byVolume = new Map();
  for (const r of unfiled) {
    if (!byVolume.has(r.comicvine_volume_id)) byVolume.set(r.comicvine_volume_id, { vol: r.comicvine_volume_id, rows: [] });
    byVolume.get(r.comicvine_volume_id).rows.push(r);
  }
  const volumesByTitle = new Map();
  for (const v of byVolume.values()) {
    const key = normTitle(v.rows[0].series_title);
    if (!volumesByTitle.has(key)) volumesByTitle.set(key, []);
    volumesByTitle.get(key).push(v);
  }
  console.log(`Unfiled covers: ${unfiled.length} in ${byVolume.size} volumes`);

  const owned = await pages("collected issues", () =>
    supabase.from("user_collections").select("id, gcd_issue_id").not("gcd_issue_id", "is", null).order("id")
  );
  const issueIds = [...new Set(owned.map((r) => Number(r.gcd_issue_id)))];
  const ownedIssues = await inChunks("owned issues", issueIds, 300, (ids) =>
    supabase.from("gcd_issues").select("gcd_id, series_gcd_id").in("gcd_id", ids).order("gcd_id")
  );
  const seriesIds = [...new Set(ownedIssues.map((r) => r.series_gcd_id).filter((v) => v != null))];
  const gcdSeries = await inChunks("gcd series", seriesIds, 200, (ids) =>
    supabase.from("gcd_series").select("gcd_id, name, year_began").in("gcd_id", ids).order("gcd_id")
  );
  const titled = gcdSeries.filter((s) => volumesByTitle.has(normTitle(s.name)));
  const titledIds = new Set(titled.map((s) => Number(s.gcd_id)));
  const toCheck = ownedIssues.filter((i) => titledIds.has(Number(i.series_gcd_id)));
  const blank = await blankOnSite(toCheck.map((i) => Number(i.gcd_id)));
  const blankSeries = new Set(toCheck.filter((i) => blank.has(Number(i.gcd_id))).map((i) => Number(i.series_gcd_id)));
  const candidates = titled.filter((s) => blankSeries.has(Number(s.gcd_id)));
  console.log(`Series members own books in: ${seriesIds.length}; with an unfiled volume of the same title: ${titled.length}; of those with a blank book: ${candidates.length} (${blank.size} books)`);
  const volumeIds = [...new Set(candidates.flatMap((s) => volumesByTitle.get(normTitle(s.name)).map((v) => v.vol)))];
  const filedRows = await inChunks("filed rows of candidate volumes", volumeIds, 50, (ids) =>
    supabase.from("canonical_covers").select("id, comicvine_volume_id").in("comicvine_volume_id", ids)
      .or("series_gcd_id.not.is.null,gcd_issue_id.not.is.null").order("id"));
  for (const r of filedRows) if (byVolume.has(r.comicvine_volume_id)) byVolume.get(r.comicvine_volume_id).partlyFiled = true;

  const skips = new Map();
  const skip = (reason) => skips.set(reason, (skips.get(reason) ?? 0) + 1);
  const plans = [];
  const claimed = new Set();
  let rows = 0;
  let held = 0;
  for (const s of candidates) {
    const bare = s.name.replace(/^the /i, "");
    const named = new Map([[s.gcd_id, s]]);
    for (const name of new Set([s.name, bare, `The ${bare}`])) {
      const found = await pages("same-named series", () =>
        supabase.from("gcd_series").select("gcd_id, name, year_began").ilike("name", escapeLike(name)).order("gcd_id")
      );
      for (const r of found) named.set(r.gcd_id, r);
    }
    const near = [...named.keys()].filter((id) => Math.abs(Number(named.get(id).year_began) - Number(s.year_began)) <= 1);
    const facts = await inChunks("series facts", near, 200, (ids) =>
      supabase.from("series").select("gcd_id, resolved_publisher_cached, us_market").in("gcd_id", ids).order("gcd_id")
    );
    const fact = new Map(facts.map((f) => [Number(f.gcd_id), f]));
    const issues = await inChunks("issues", near, 20, (ids) =>
      supabase.from("gcd_issues").select("gcd_id, series_gcd_id, issue_number, variant_of_gcd_id").in("series_gcd_id", ids).order("gcd_id")
    );
    const numbers = new Map();
    for (const i of issues) {
      if (i.variant_of_gcd_id != null) continue;
      if (!numbers.has(i.series_gcd_id)) numbers.set(i.series_gcd_id, new Set());
      numbers.get(i.series_gcd_id).add(normNumber(i.issue_number));
    }
    const ownIssues = issues.filter((i) => Number(i.series_gcd_id) === Number(s.gcd_id));
    const coveredRows = await inChunks("issues with covers", ownIssues.map((i) => i.gcd_id), 200, (ids) =>
      supabase.from("canonical_covers").select("id, gcd_issue_id").in("gcd_issue_id", ids).order("id"));
    const result = planSeries({
      covered: new Set(coveredRows.map((r) => Number(r.gcd_issue_id))),
      series: { gcd_id: s.gcd_id, name: s.name, year: s.year_began, publisher: fact.get(Number(s.gcd_id))?.resolved_publisher_cached },
      issues: ownIssues,
      volumes: volumesByTitle.get(normTitle(s.name)) ?? [],
      siblings: near.map((id) => ({
        gcd_id: id,
        name: named.get(id).name,
        year: named.get(id).year_began,
        publisher: fact.get(Number(id))?.resolved_publisher_cached,
        us_market: fact.get(Number(id))?.us_market !== false,
        numbers: numbers.get(id),
      })),
    });
    if (result.skip) {
      skip(result.skip);
      continue;
    }
    // Two series must never both claim a cover.
    if (result.links.some((l) => claimed.has(l.id))) {
      skip("cover claimed twice");
      continue;
    }
    if (rows + result.links.length > MAX_ROWS) {
      held += 1;
      continue;
    }
    for (const l of result.links) claimed.add(l.id);
    rows += result.links.length;
    plans.push({ label: `${s.name} (${s.year_began})`, links: result.links });
  }

  for (const [reason, n] of [...skips].sort((a, b) => b[1] - a[1])) console.log(`  left alone, ${reason}: ${n}`);
  if (held) console.log(`  over the ${MAX_ROWS}-cover cap, next run: ${held} series`);
  console.log(`${APPLY ? "Filing" : "[dry run] would file"} ${rows} covers in ${plans.length} series`);

  let filed = 0;
  for (const p of plans) {
    let done = 0;
    if (APPLY) {
      for (const l of p.links) {
        const updated = await withRetry(`file ${l.id}`, () =>
          supabase
            .from("canonical_covers")
            .update({ series_gcd_id: l.series_gcd_id, gcd_issue_id: l.gcd_issue_id, match_confidence: "resolved" })
            .eq("id", l.id)
            .is("series_gcd_id", null)
            .is("gcd_issue_id", null)
            .select("id")
        );
        done += updated?.length ?? 0;
      }
    }
    filed += done;
    console.log(`  ${p.label}: ${APPLY ? `${done} of ` : ""}${p.links.length} cover(s), ids ${p.links.map((l) => l.id).join(" ")}`);
  }
  if (APPLY) console.log(`Filed ${filed} of ${rows}.${filed < rows ? " The rest were filed by something else first and left as they are." : ""}`);
}

main().catch((error) => {
  console.error("fileUnfiledCovers failed:", error);
  process.exit(1);
});
