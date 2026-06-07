// One-shot audit: find hybrid duplicates for a given user_id.
// Same logic as the new /library "Library health" panel — groups owned rows
// by normalized (series_title, issue_number) and flags any group with at
// least one local-comic row AND one gcd_issue_id row.

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", quiet: true });

const ADMIN_ID = "9ec650a2-8870-4175-82da-99d72cab9efc";
const userId = process.argv[2] || ADMIN_ID;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normTitle(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function normIssue(s) {
  return String(s || "").trim().toLowerCase();
}

async function main() {
  console.log(`\nAuditing user_id = ${userId}\n`);

  const { data: collection, error } = await supabase
    .from("user_collections")
    .select("id, status, comic_id, gcd_issue_id, created_at")
    .eq("user_id", userId)
    .eq("status", "owned");

  if (error) {
    console.error("Query failed:", error);
    process.exit(1);
  }

  console.log(`Owned rows: ${collection.length}\n`);

  // Hydrate metadata for both row types.
  const localIds = [...new Set(collection.map((c) => c.comic_id).filter(Boolean))];
  const gcdIds = [
    ...new Set(
      collection
        .map((c) => c.gcd_issue_id)
        .filter((v) => v != null)
        .map(Number)
        .filter((n) => !Number.isNaN(n))
    ),
  ];

  console.log(`  Local comic rows: ${localIds.length}`);
  console.log(`  GCD-linked rows : ${gcdIds.length}\n`);

  const localById = {};
  if (localIds.length) {
    const { data } = await supabase
      .from("comics")
      .select("id, series_title, issue_number")
      .in("id", localIds);
    for (const r of data ?? []) localById[r.id] = r;
  }

  const gcdById = {};
  if (gcdIds.length) {
    const { data: issues } = await supabase
      .from("gcd_issues")
      .select("gcd_id, series_gcd_id, issue_number")
      .in("gcd_id", gcdIds);
    const seriesGcdIds = [...new Set((issues ?? []).map((i) => i.series_gcd_id).filter(Boolean))];
    const seriesByGcdId = {};
    if (seriesGcdIds.length) {
      const { data: seriesRows } = await supabase
        .from("series")
        .select("gcd_id, title")
        .in("gcd_id", seriesGcdIds);
      for (const s of seriesRows ?? []) seriesByGcdId[String(s.gcd_id)] = s;
    }
    for (const issue of issues ?? []) {
      const s = seriesByGcdId[String(issue.series_gcd_id)];
      gcdById[issue.gcd_id] = {
        series_title: s?.title ?? null,
        issue_number: issue.issue_number,
      };
    }
  }

  // Group.
  const groups = new Map();
  let unhydrated = 0;
  for (const item of collection) {
    let meta = null;
    if (item.comic_id && localById[item.comic_id]) {
      meta = localById[item.comic_id];
    } else if (item.gcd_issue_id && gcdById[item.gcd_issue_id]) {
      meta = gcdById[item.gcd_issue_id];
    }
    if (!meta) { unhydrated += 1; continue; }
    const t = normTitle(meta.series_title);
    const n = normIssue(meta.issue_number);
    if (!t || !n) continue;
    const gkey = `${t}::${n}`;
    if (!groups.has(gkey)) groups.set(gkey, []);
    groups.get(gkey).push({ item, meta });
  }

  if (unhydrated > 0) {
    console.log(`  ⚠ ${unhydrated} rows could not be hydrated (orphan refs?)\n`);
  }

  const hybrids = [];
  const sameSourceDupes = [];
  for (const [, rows] of groups.entries()) {
    if (rows.length < 2) continue;
    const localCount = rows.filter((r) => r.item.gcd_issue_id == null).length;
    const gcdCount = rows.filter((r) => r.item.gcd_issue_id != null).length;
    const sample = rows[0].meta;
    const entry = {
      title: sample.series_title,
      issue: sample.issue_number,
      localCount,
      gcdCount,
      total: rows.length,
    };
    if (localCount > 0 && gcdCount > 0) hybrids.push(entry);
    else sameSourceDupes.push(entry);
  }

  console.log("══════ HYBRID DUPES (panel renders these) ══════");
  if (hybrids.length === 0) {
    console.log("  (none — your collection is clean on this dimension)\n");
  } else {
    hybrids.sort((a, b) => b.total - a.total);
    for (const h of hybrids) {
      console.log(`  ${h.title} #${h.issue}  →  ${h.localCount} local + ${h.gcdCount} catalog`);
    }
    console.log(`\n  Total hybrid issues: ${hybrids.length}`);
    console.log(`  Extra rows that could be merged away: ${hybrids.reduce((s, h) => s + h.total - 1, 0)}\n`);
  }

  console.log("══════ SAME-SOURCE DUPES (should be impossible) ══════");
  if (sameSourceDupes.length === 0) {
    console.log("  (none — dedup is working)\n");
  } else {
    for (const d of sameSourceDupes) {
      console.log(`  ⚠ ${d.title} #${d.issue}  →  ${d.localCount} local + ${d.gcdCount} catalog (${d.total} rows)`);
    }
    console.log("\n  These imply a dedup bug — should be investigated.\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
