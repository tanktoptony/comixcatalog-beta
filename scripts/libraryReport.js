// libraryReport.js — full state-of-the-collection report for a given user.
//
// Built after a morning of going in circles trying to answer "is the
// collection actually in a good state?" — this tool answers in one query.
//
// What it tells you (per user):
//   • total rows, grouped by status (owned / wantlist / for_sale)
//   • catalog linkage: linked-to-GCD vs local-only, breakdown by status
//   • cover availability:
//       - personal (user_cover_url) — user uploaded a photo of their copy
//       - canonical reachable     — a canonical_covers row exists for their issue
//       - community fallback      — comic_covers row exists on the local comic
//       - none (truly coverless)
//   • slabs: count of rows with slab_company set + slab ratio
//   • value: sum(market_value) on owned rows, count of rows with auto-value
//   • run completion: top 10 series by ownership %
//   • flag list: rows that are local-only (catalog-linking candidates)
//
// Usage:  node scripts/libraryReport.js [user_id]
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

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}
function fmt(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function pct(num, den) {
  if (!den) return "  0%";
  return String(Math.round((num / den) * 100)).padStart(3) + "%";
}

async function main() {
  console.log("");
  console.log("════════════════════════════════════════════════════════════════");
  console.log(`  LIBRARY REPORT  ·  user ${userId}`);
  console.log("════════════════════════════════════════════════════════════════");

  // ── Load all rows ──────────────────────────────────────────────────────
  const { data: rows, error: rowsErr } = await supabase
    .from("user_collections")
    .select("id, status, comic_id, gcd_issue_id, user_cover_url, slab_company, grade_numeric, market_value, purchase_price")
    .eq("user_id", userId);
  if (rowsErr) { console.error(rowsErr); process.exit(1); }

  if (!rows?.length) {
    console.log("\n  No rows. Empty collection.\n");
    return;
  }

  // ── Status breakdown ───────────────────────────────────────────────────
  const owned = rows.filter((r) => r.status === "owned");
  const wantlist = rows.filter((r) => r.status === "wishlist");
  const forSale = rows.filter((r) => r.status === "for_sale");

  console.log("");
  console.log("STATUS");
  console.log(`  Total      : ${String(rows.length).padStart(5)}`);
  console.log(`  Owned      : ${String(owned.length).padStart(5)}`);
  console.log(`  Wantlist   : ${String(wantlist.length).padStart(5)}`);
  console.log(`  For Sale   : ${String(forSale.length).padStart(5)}`);

  // ── Catalog linkage ────────────────────────────────────────────────────
  const linked = rows.filter((r) => r.gcd_issue_id != null);
  const local = rows.filter((r) => r.gcd_issue_id == null && r.comic_id != null);
  const orphan = rows.filter((r) => r.gcd_issue_id == null && r.comic_id == null);

  console.log("");
  console.log("CATALOG LINKAGE");
  console.log(`  Linked to GCD       : ${String(linked.length).padStart(5)}  (${pct(linked.length, rows.length).trim()})`);
  console.log(`  Local-only          : ${String(local.length).padStart(5)}  (${pct(local.length, rows.length).trim()})`);
  if (orphan.length) console.log(`  ⚠ Orphan (no ref)  : ${String(orphan.length).padStart(5)}`);

  // ── Cover availability ─────────────────────────────────────────────────
  // For linked rows: check if canonical_covers has a row for (series_title, issue_number).
  // For local rows: check comic_covers via the comic_id.
  const gcdIds = linked.map((r) => Number(r.gcd_issue_id)).filter(Boolean);
  const localComicIds = local.map((r) => r.comic_id).filter(Boolean);

  // Hydrate GCD-linked rows
  const gcdMeta = new Map();
  if (gcdIds.length) {
    const { data: issues } = await supabase
      .from("gcd_issues")
      .select("gcd_id, series_gcd_id, issue_number")
      .in("gcd_id", gcdIds);
    const seriesGcdIds = [...new Set((issues ?? []).map((i) => i.series_gcd_id))];
    const { data: seriesRows } = await supabase
      .from("series")
      .select("gcd_id, title")
      .in("gcd_id", seriesGcdIds);
    const titleByGcdId = Object.fromEntries((seriesRows ?? []).map((s) => [String(s.gcd_id), s.title]));
    for (const i of issues ?? []) {
      gcdMeta.set(Number(i.gcd_id), {
        title: titleByGcdId[String(i.series_gcd_id)] ?? null,
        issue_number: i.issue_number,
      });
    }
  }

  // canonical_covers lookup for linked rows
  const canonicalReachable = new Set();
  if (gcdMeta.size > 0) {
    const titles = [...new Set([...gcdMeta.values()].map((m) => m.title).filter(Boolean))];
    if (titles.length) {
      const PAGE = 1000;
      let from = 0;
      const found = new Set();
      while (true) {
        const { data: covers } = await supabase
          .from("canonical_covers")
          .select("series_title, issue_number")
          .in("series_title", titles)
          .not("storage_path", "is", null)
          .range(from, from + PAGE - 1);
        if (!covers?.length) break;
        for (const c of covers) {
          found.add(`${norm(c.series_title)}::${norm(c.issue_number)}`);
        }
        if (covers.length < PAGE) break;
        from += PAGE;
      }
      for (const [gcdId, m] of gcdMeta.entries()) {
        if (found.has(`${norm(m.title)}::${norm(m.issue_number)}`)) {
          canonicalReachable.add(gcdId);
        }
      }
    }
  }

  // community covers for local rows
  const communityById = new Set();
  if (localComicIds.length) {
    const { data: covers } = await supabase
      .from("comic_covers")
      .select("comic_id")
      .in("comic_id", localComicIds);
    for (const c of covers ?? []) communityById.add(c.comic_id);
  }

  let coverPersonal = 0;
  let coverCanonical = 0;
  let coverCommunity = 0;
  let coverless = 0;

  for (const r of rows) {
    if (r.user_cover_url) { coverPersonal += 1; continue; }
    if (r.gcd_issue_id != null && canonicalReachable.has(Number(r.gcd_issue_id))) {
      coverCanonical += 1;
      continue;
    }
    if (r.comic_id != null && communityById.has(r.comic_id)) {
      coverCommunity += 1;
      continue;
    }
    coverless += 1;
  }

  console.log("");
  console.log("COVER AVAILABILITY");
  console.log(`  Your photo (user_cover_url) : ${String(coverPersonal).padStart(5)}  (${pct(coverPersonal, rows.length).trim()})`);
  console.log(`  Canonical reachable         : ${String(coverCanonical).padStart(5)}  (${pct(coverCanonical, rows.length).trim()})`);
  console.log(`  Community fallback          : ${String(coverCommunity).padStart(5)}  (${pct(coverCommunity, rows.length).trim()})`);
  console.log(`  Coverless                   : ${String(coverless).padStart(5)}  (${pct(coverless, rows.length).trim()})`);

  // ── Slabs ──────────────────────────────────────────────────────────────
  const slabbed = owned.filter((r) => r.slab_company);
  console.log("");
  console.log("SLABS");
  console.log(`  Slabbed owned       : ${String(slabbed.length).padStart(5)}  (${pct(slabbed.length, owned.length).trim()} of owned)`);
  const slabByCompany = {};
  for (const r of slabbed) {
    slabByCompany[r.slab_company] = (slabByCompany[r.slab_company] || 0) + 1;
  }
  for (const [co, c] of Object.entries(slabByCompany).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${co.padEnd(18)} : ${String(c).padStart(5)}`);
  }

  // ── Value ──────────────────────────────────────────────────────────────
  let userValueTotal = 0;
  let userValueCount = 0;
  let costBasisTotal = 0;
  let costBasisCount = 0;
  for (const r of owned) {
    const mv = Number(r.market_value);
    if (!Number.isNaN(mv) && mv > 0) { userValueTotal += mv; userValueCount += 1; }
    const pp = Number(r.purchase_price);
    if (!Number.isNaN(pp) && pp > 0) { costBasisTotal += pp; costBasisCount += 1; }
  }
  console.log("");
  console.log("VALUE");
  console.log(`  User-entered market_value   : ${userValueCount} row(s), total ${fmt(userValueTotal)}`);
  console.log(`  Purchase price recorded     : ${costBasisCount} row(s), total ${fmt(costBasisTotal)}`);
  if (userValueTotal > 0 && costBasisTotal > 0) {
    const delta = userValueTotal - costBasisTotal;
    console.log(`  Paper P&L (recorded only)   : ${fmt(delta)}  (${delta >= 0 ? "+" : ""}${Math.round((delta / costBasisTotal) * 100)}% of cost basis)`);
  }

  // ── Run completion (top series) ───────────────────────────────────────
  // Group owned rows by series (resolved from GCD where linked, comic where local).
  const seriesOwned = new Map(); // title => count
  for (const r of owned) {
    let title = null;
    if (r.gcd_issue_id != null) {
      title = gcdMeta.get(Number(r.gcd_issue_id))?.title ?? null;
    }
    if (!title && r.comic_id != null) {
      // We don't have the local comic data inline; skip for the snapshot
      // (counting these would need a separate join — Phase 2 of this script).
      continue;
    }
    if (!title) continue;
    seriesOwned.set(title, (seriesOwned.get(title) || 0) + 1);
  }

  if (seriesOwned.size > 0) {
    const top = [...seriesOwned.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log("");
    console.log("TOP SERIES OWNED (GCD-linked rows only)");
    for (const [title, count] of top) {
      console.log(`  ${count.toString().padStart(3)}  ${title}`);
    }
  }

  // ── Next-step recommendations ──────────────────────────────────────────
  console.log("");
  console.log("RECOMMENDED NEXT STEPS");
  if (local.length > 0) {
    console.log(`  • ${local.length} local-only row(s) — run /library → Catalog linking panel`);
  }
  if (coverless > 0) {
    console.log(`  • ${coverless} coverless row(s) — ingest covers for those series or upload your own photo`);
  }
  if (orphan.length > 0) {
    console.log(`  • ${orphan.length} orphan row(s) — these have neither comic_id nor gcd_issue_id, likely junk to delete`);
  }
  if (!local.length && !coverless && !orphan.length) {
    console.log(`  ✓ Library is in clean shape.`);
  }
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
