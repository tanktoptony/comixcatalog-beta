// Audits the `comics` table for garbage rows — user-added records with no
// real title, no cover, and a placeholder issue number. Many of these came
// from old test scripts and scraping runs and now leak through `/comic/<id>`
// direct hits.
//
// A row is flagged "garbage" if ALL of the following are true:
//   - series_title is null/blank OR matches /^untitled$/i
//   - issue_number is null OR a placeholder ([nn], nn, (nn))
//   - has zero rows in comic_covers
//
// We then check which flagged rows are referenced in user_collections.
// Referenced rows are NEVER auto-deleted — they belong to a real user's
// library entry. They're listed for manual review.
//
// We avoid pulling the entire `comics` table (it's too big for Supabase's
// statement timeout). Instead we filter at SQL: only rows where EITHER the
// title is missing/Untitled OR the issue_number is null/placeholder. That
// captures everything that could possibly be garbage.
//
// Usage:
//   node scripts/auditUserComics.js          # dry-run report
//   node scripts/auditUserComics.js --apply  # delete unreferenced garbage

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const APPLY = process.argv.includes("--apply");
const PAGE_SIZE = 500;

const PLACEHOLDER_ISSUE_VALUES = ["[nn]", "nn", "(nn)"];

function isPlaceholderIssueNumber(value) {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return true;
  return PLACEHOLDER_ISSUE_VALUES.includes(s);
}

function isPlaceholderTitle(value) {
  const s = String(value ?? "").trim();
  if (!s) return true;
  return /^untitled$/i.test(s);
}

// Cursor-paginate by id (PK index) instead of using OFFSET, which gets slow
// on large tables and is what triggered the original 57014 timeout.
async function fetchCandidateGarbage() {
  const out = [];
  let cursorId = null;

  while (true) {
    let query = supabase
      .from("comics")
      .select("id, series_title, issue_number, publisher, release_year, created_at, created_by")
      // Only candidates: title is null/Untitled OR issue_number is null/placeholder.
      // Anything outside this set can't possibly be garbage by our criteria.
      .or(
        `series_title.is.null,series_title.ilike.untitled,issue_number.is.null,issue_number.in.(${PLACEHOLDER_ISSUE_VALUES.map((v) => `"${v}"`).join(",")})`
      )
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);

    if (cursorId != null) {
      query = query.gt("id", cursorId);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;

    out.push(...data);
    cursorId = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
    process.stdout.write(`\r  candidates fetched: ${out.length}`);
  }
  if (out.length > 0) process.stdout.write("\n");
  return out;
}

async function fetchCoverMap(ids) {
  const has = new Set();
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200);
    const { data, error } = await supabase
      .from("comic_covers")
      .select("comic_id")
      .in("comic_id", slice);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.comic_id) has.add(String(row.comic_id));
    }
  }
  return has;
}

async function fetchCollectionRefs(ids) {
  const refs = new Set();
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200);
    const { data, error } = await supabase
      .from("user_collections")
      .select("comic_id")
      .in("comic_id", slice);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.comic_id) refs.add(String(row.comic_id));
    }
  }
  return refs;
}

async function run() {
  console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log(APPLY ? "Mode: APPLY (will delete unreferenced garbage)" : "Mode: dry-run");

  const { count: totalComics, error: countErr } = await supabase
    .from("comics")
    .select("id", { count: "exact", head: true });
  if (countErr) {
    console.error("Total-count failed (continuing anyway):", countErr.message);
  } else {
    console.log(`Total user-added comics: ${totalComics ?? 0}`);
  }

  console.log("Fetching candidate rows (server-side filtered)…");
  const candidates = await fetchCandidateGarbage();
  console.log(`Candidates pulled:        ${candidates.length}`);

  if (candidates.length === 0) {
    console.log("No candidates — nothing to audit.");
    return;
  }

  const candidateIds = candidates.map((c) => c.id);

  console.log("Resolving comic_covers…");
  const haveCover = await fetchCoverMap(candidateIds);

  console.log("Resolving user_collections refs…");
  const collectionRefs = await fetchCollectionRefs(candidateIds);

  const garbage = [];
  for (const c of candidates) {
    const titleIsGarbage = isPlaceholderTitle(c.series_title);
    const issueIsGarbage = isPlaceholderIssueNumber(c.issue_number);
    const noCover = !haveCover.has(String(c.id));
    if (titleIsGarbage && issueIsGarbage && noCover) {
      garbage.push(c);
    }
  }

  const unreferenced = garbage.filter((c) => !collectionRefs.has(String(c.id)));
  const referenced = garbage.filter((c) => collectionRefs.has(String(c.id)));

  console.log("\n──────── Audit ────────");
  console.log(`Garbage rows (all 3 criteria):    ${garbage.length}`);
  console.log(`  └ unreferenced (safe to drop):  ${unreferenced.length}`);
  console.log(`  └ referenced by user_collections: ${referenced.length}  (will NOT be touched)`);
  console.log("───────────────────────");

  if (referenced.length > 0) {
    console.log("\nReferenced garbage (manual review needed) — first 10:");
    for (const c of referenced.slice(0, 10)) {
      console.log(`  ${c.id}  title=${JSON.stringify(c.series_title)}  issue=${JSON.stringify(c.issue_number)}  by=${c.created_by ?? "?"}`);
    }
  }

  if (unreferenced.length > 0) {
    console.log("\nUnreferenced garbage — first 10 sample:");
    for (const c of unreferenced.slice(0, 10)) {
      console.log(`  ${c.id}  title=${JSON.stringify(c.series_title)}  issue=${JSON.stringify(c.issue_number)}  by=${c.created_by ?? "?"}`);
    }
  }

  if (!APPLY) {
    console.log("\nDry-run complete. Re-run with --apply to delete the unreferenced rows.");
    return;
  }

  if (unreferenced.length === 0) {
    console.log("\nNothing to delete.");
    return;
  }

  console.log(`\nDeleting ${unreferenced.length} unreferenced garbage rows in batches…`);
  const BATCH = 200;
  let deleted = 0;
  for (let i = 0; i < unreferenced.length; i += BATCH) {
    const batchIds = unreferenced.slice(i, i + BATCH).map((c) => c.id);
    const { error } = await supabase.from("comics").delete().in("id", batchIds);
    if (error) {
      console.error(`Batch ${i} failed:`, error);
      break;
    }
    deleted += batchIds.length;
    process.stdout.write(`\r  deleted ${deleted}/${unreferenced.length}`);
  }
  console.log(`\nDone. Removed ${deleted} unreferenced rows.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
