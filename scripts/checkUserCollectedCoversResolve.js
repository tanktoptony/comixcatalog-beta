// Does every issue in every user's library actually SHOW a cover?
//
// The existing instruments answer a different question. reportUserCollected-
// CoverCoverage.js asks "does a canonical_covers row exist that matches this
// issue", and the gap lanes ask "is this series pinned to a ComicVine
// volume". Both can say yes while the page still renders an empty rectangle:
// the pin can point at the wrong volume, the title path can miss on a
// leading article, the matched row can carry a storage_path whose object was
// never uploaded. "A row exists" is not "a cover resolves".
//
// So this script does not query for rows. It calls the same endpoint the
// profile page calls and reads `display.coverUrl`, which is literally the
// string the <img> gets. If that is null, the user sees a blank. With
// --verify-images it also fetches each distinct URL, because a storage path
// pointing at a missing object looks identical to a real cover from the
// database's side.
//
// It reports a LIST, not a percentage. "97.28% covered" is not actionable;
// "these 19 issues are blank, here they are" is. A percentage also hides
// which misses are the same root cause repeated.
//
// Usage:
//   node scripts/checkUserCollectedCoversResolve.js
//   node scripts/checkUserCollectedCoversResolve.js --verify-images
//   node scripts/checkUserCollectedCoversResolve.js --user=treystyles
//   node scripts/checkUserCollectedCoversResolve.js --base=http://localhost:3000
//   ... add --json=<path> to dump the misses for another script to consume.
//
// Exit codes: 0 = every collected issue resolves a cover. 1 = at least one
// does not. Non-zero on a real miss so this can gate a workflow later.

import fs from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL } from "../src/lib/siteUrl.js";

dotenv.config({ path: ".env.local", quiet: true });

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? true];
  })
);
const BASE = String(args.base || SITE_URL).replace(/\/+$/, "");
const VERIFY_IMAGES = Boolean(args["verify-images"]);
const ONLY_USER = args.user ? String(args.user) : null;
const JSON_OUT = args.json ? String(args.json) : null;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PAGE = 1000;

// Keyset, not offset: an offset walk with no stable sort returns a different
// set each run (see handoff §2a's sibling note).
async function allRows(table, select, tweak = (q) => q, keyCol = "id") {
  const rows = [];
  let last = null;
  for (;;) {
    let q = tweak(supabase.from(table).select(select)).order(keyCol).limit(PAGE);
    if (last !== null) q = q.gt(keyCol, last);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.code ?? "?"} | ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
    last = data[data.length - 1][keyCol];
  }
  return rows;
}

// A flat list of 33 blanks is better than a percentage, but it still makes
// every miss look like the same problem. These are the four distinct causes
// seen in the first real run, and they have completely different fixes:
// one is a broken user-added row, one is a genuine hole in the catalog, one
// is a matching failure on a series we DO have covers for, and one is a
// database row pointing at a storage object that isn't there.
const CLASS = {
  UNIDENTIFIED: "user-added comic with no series title — nothing to match on",
  UNLINKED: "user-added comic never linked to a catalog issue — no cover to inherit",
  UNPINNED_SERIES: "series has no ComicVine pin, so no covers can attach to it",
  PINNED_NO_COVERS: "series is pinned to a ComicVine volume but no covers have been ingested",
  ISSUE_NOT_COVERED: "series has covers, this issue number is not among them",
  STORAGE_MISSING: "cover row exists but the storage object 404s",
  UNKNOWN: "unclassified",
};

async function classify(miss) {
  if (miss.reason === "coverUrl does not load") return CLASS.STORAGE_MISSING;

  if (!miss.gcdIssueId) {
    if (!miss.comicId) return CLASS.UNIDENTIFIED;
    // Errors are raised, not swallowed. The first cut of this selected a
    // `title` column that comics does not have; PostgREST returned 42703,
    // `data` came back null, and every one of these was silently filed as
    // "no series title" — including rows whose series_title was right
    // there. An instrument that misreports on error is worse than no
    // instrument, which is the whole reason this script exists.
    const { data, error } = await supabase
      .from("comics")
      .select("series_title")
      .eq("id", miss.comicId)
      .maybeSingle();
    if (error) throw new Error(`classify comics ${miss.comicId}: ${error.code} | ${error.message}`);
    // A user-added comic with a real title is a different problem from one
    // with no title at all: the first could be matched to a GCD issue and
    // inherit its cover, the second has nothing to match on.
    return data?.series_title ? CLASS.UNLINKED : CLASS.UNIDENTIFIED;
  }

  const { data: issue, error: issueErr } = await supabase
    .from("gcd_issues")
    .select("series_gcd_id, issue_number")
    .eq("gcd_id", miss.gcdIssueId)
    .maybeSingle();
  if (issueErr) throw new Error(`classify gcd_issues ${miss.gcdIssueId}: ${issueErr.code} | ${issueErr.message}`);
  if (!issue?.series_gcd_id) return CLASS.UNKNOWN;

  const { count: seriesCovers } = await supabase
    .from("canonical_covers")
    .select("id", { count: "exact", head: true })
    .eq("series_gcd_id", issue.series_gcd_id)
    .not("storage_path", "is", null);

  if (seriesCovers) return CLASS.ISSUE_NOT_COVERED;

  // No covers attached. Distinguish "nothing to attach them to" from
  // "attached to the wrong thing", because the fixes are different: the
  // first needs a pin, the second needs an ingest run.
  //
  // Worked example, 2026-09-22: thrice347 owns Rai and the Future Force
  // #10-23 (GCD 5067), which reads as zero covers. The covers exist — all
  // 34 of them, under GCD 4493 "Rai" / ComicVine volume 4828, because
  // Valiant renamed the book mid-run and GCD split it into two series
  // records while ComicVine kept one volume. 5067 has no pin at all, so
  // nothing can ever attach to it. That is one pin, not eight missing
  // covers, and only this breakdown makes that visible.
  const { data: seriesRow, error: seriesErr } = await supabase
    .from("series")
    .select("comicvine_volume_id")
    .eq("gcd_id", issue.series_gcd_id)
    .maybeSingle();

  if (seriesErr) throw new Error(`classify series ${issue.series_gcd_id}: ${seriesErr.code} | ${seriesErr.message}`);
  return seriesRow?.comicvine_volume_id ? CLASS.PINNED_NO_COVERS : CLASS.UNPINNED_SERIES;
}

function label(item) {
  const d = item?.display ?? {};
  const title = d.title || "(untitled)";
  const num = d.issueNumber ? ` #${d.issueNumber}` : "";
  const year = d.year ? ` (${d.year})` : "";
  return `${title}${num}${year}`;
}

async function headOk(url) {
  try {
    // HEAD first; Supabase storage answers it, and it avoids pulling the
    // image body just to learn whether it exists.
    const res = await fetch(url, { method: "HEAD" });
    if (res.status === 405) {
      const get = await fetch(url, { method: "GET" });
      return get.ok;
    }
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`Checking against ${BASE}\n`);

  const collections = await allRows(
    "user_collections",
    "id, user_id, gcd_issue_id, comic_id",
    (q) => q
  );
  const countByUser = new Map();
  for (const row of collections) {
    countByUser.set(row.user_id, (countByUser.get(row.user_id) ?? 0) + 1);
  }

  const profiles = await allRows("profiles", "id, username, is_public", (q) =>
    q.in("id", [...countByUser.keys()])
  );
  const byId = new Map(profiles.map((p) => [p.id, p]));

  const targets = [...countByUser.entries()]
    .map(([userId, owned]) => ({ userId, owned, profile: byId.get(userId) }))
    .filter((t) => (ONLY_USER ? t.profile?.username === ONLY_USER : true))
    .sort((a, b) => b.owned - a.owned);

  let checked = 0;
  let resolved = 0;
  let wishlistChecked = 0;
  let wishlistResolved = 0;
  let unreachable = 0;
  const misses = [];
  const skipped = [];

  for (const { userId, owned, profile } of targets) {
    if (!profile?.username) {
      skipped.push({ userId, owned, why: "no username — no public profile to read" });
      continue;
    }
    if (profile.is_public === false) {
      skipped.push({ userId, username: profile.username, owned, why: "profile is private" });
      continue;
    }

    const url = `${BASE}/api/public-profile?username=${encodeURIComponent(profile.username)}`;
    const res = await fetch(url, { headers: { "cache-control": "no-cache" } });
    if (!res.ok) {
      skipped.push({ userId, username: profile.username, owned, why: `profile API returned ${res.status}` });
      continue;
    }
    const json = await res.json();
    const items = Array.isArray(json?.collection) ? json.collection : [];

    // The endpoint applies the owner's privacy settings, so a short list
    // here is a visibility choice, not a missing-cover bug. Say so rather
    // than silently scoring against the smaller number.
    const hidden = owned - items.length;

    const userMisses = [];
    for (const item of items) {
      // The endpoint returns the wantlist alongside the library. "Every issue
      // in your library has its cover" is a claim about what you OWN; a
      // wishlist entry for a book nobody has catalogued yet is not the same
      // defect. Counted separately rather than folded in to flatter the
      // number — or to inflate it.
      const owned = item?.status !== "wishlist";
      if (owned) checked += 1;
      else wishlistChecked += 1;

      const cover = item?.display?.coverUrl;
      if (!cover) {
        userMisses.push({
          username: profile.username,
          owned,
          label: label(item),
          gcdIssueId: item.gcd_issue_id ?? null,
          comicId: item.comic_id ?? null,
          reason: "no coverUrl",
        });
        continue;
      }
      if (VERIFY_IMAGES && !(await headOk(cover))) {
        unreachable += 1;
        userMisses.push({
          username: profile.username,
          owned,
          label: label(item),
          gcdIssueId: item.gcd_issue_id ?? null,
          comicId: item.comic_id ?? null,
          reason: "coverUrl does not load",
          url: cover,
        });
        continue;
      }
      if (owned) resolved += 1;
      else wishlistResolved += 1;
    }

    for (const m of userMisses) m.cause = await classify(m);

    misses.push(...userMisses);
    const ownedShown = items.filter((i) => i?.status !== "wishlist").length;
    const ownedBlank = userMisses.filter((m) => m.owned).length;
    const wantBlank = userMisses.length - ownedBlank;
    console.log(
      `${profile.username.padEnd(18)} library ${String(ownedShown - ownedBlank).padStart(4)}/${String(ownedShown).padEnd(4)}` +
        (hidden > 0 ? `  (${hidden} hidden by privacy settings)` : "") +
        (ownedBlank ? `  <- ${ownedBlank} BLANK` : "") +
        (wantBlank ? `  (+${wantBlank} blank on the wantlist)` : "")
    );
    for (const m of userMisses) {
      console.log(
        `    ${m.owned ? "owned   " : "wantlist"} ${m.label}${m.gcdIssueId ? ` [gcd ${m.gcdIssueId}]` : ""}\n` +
          `             ${m.cause}`
      );
    }
  }

  console.log("");
  if (skipped.length) {
    console.log("Not checked:");
    for (const s of skipped) {
      console.log(`  ${s.username ?? s.userId} (${s.owned} owned): ${s.why}`);
    }
    console.log("");
  }

  const ownedMisses = misses.filter((m) => m.owned);
  console.log(`Libraries checked: ${targets.length - skipped.length}`);
  console.log(`  OWNED issues:    ${checked} — ${resolved} resolve a cover, ${ownedMisses.length} blank`);
  console.log(
    `  wantlist issues: ${wishlistChecked} — ${wishlistResolved} resolve a cover, ${misses.length - ownedMisses.length} blank`
  );
  if (VERIFY_IMAGES) console.log(`  URLs that exist but 404: ${unreachable}`);
  else console.log("  (run with --verify-images to also catch URLs whose storage object is missing)");

  const byCause = new Map();
  for (const m of misses) byCause.set(m.cause, (byCause.get(m.cause) ?? 0) + 1);
  if (byCause.size) {
    console.log("\nBlanks by cause:");
    for (const [cause, n] of [...byCause.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(3)}  ${cause}`);
    }
  }

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({ checkedAt: new Date().toISOString(), base: BASE, checked, resolved, misses, skipped }, null, 2));
    console.log(`\nWrote ${JSON_OUT}`);
  }

  // The gate is the library, not the wantlist. A wanted book nobody has
  // catalogued yet is a gap in the catalog, not a broken page.
  if (ownedMisses.length > 0) {
    console.log(`\nFAIL: ${ownedMisses.length} OWNED issue(s) render without a cover.`);
    process.exitCode = 1;
  } else if (checked > 0) {
    console.log("\nOK: every owned issue in every checked library resolves a cover.");
  }
}

main().catch((err) => {
  console.error(`checkUserCollectedCoversResolve failed: ${err?.message ?? err}`);
  process.exit(1);
});
