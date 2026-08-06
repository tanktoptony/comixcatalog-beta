// Planner and guarded migration for removing legacy `comics` rows that already
// have a direct GCD issue identity. Dry-run is the default.
//
// A row is eligible only when every independently checkable invariant holds:
//   - comics.gcd_id resolves to gcd_issues.gcd_id
//   - normalized issue numbers agree
//   - comics.series_id resolves to series.id
//   - series.gcd_id agrees with gcd_issues.series_gcd_id
//   - comics.created_by is null (never delete an attributed contribution)
//
// It also inventories collection references and cover rows attached to the
// eligible set. Apply mode aborts unless the full scan is exception-free and
// the operator confirms the exact eligible count.
//
// Usage:
//   node --max-old-space-size=2048 scripts/planComicsGcdDedupe.js
//   node --max-old-space-size=2048 scripts/planComicsGcdDedupe.js --apply --confirm=755161


import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const PAGE_SIZE = 400;
const SAMPLE_LIMIT = 20;
const APPLY = process.argv.includes("--apply");
const confirmArg = process.argv.find((arg) => arg.startsWith("--confirm="));
const CONFIRMED_COUNT = confirmArg ? Number(confirmArg.split("=")[1]) : null;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normIssue(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/\s+/g, "");
}

async function fetchAllById(table, columns, configure = (query) => query) {
  const rows = [];
  let cursor = null;

  while (true) {
    let query = configure(
      supabase.from(table).select(columns).order("id", { ascending: true }).limit(PAGE_SIZE)
    );
    if (cursor != null) query = query.gt("id", cursor);

    const { data, error } = await query;
    if (error) throw new Error(`${table} scan failed: ${error.message}`);
    if (!data?.length) break;

    rows.push(...data);
    cursor = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchMapByValues(table, keyColumn, columns, values) {
  const uniqueValues = [...new Set(values.filter((value) => value != null))];
  if (uniqueValues.length === 0) return new Map();

  const out = new Map();
  for (let i = 0; i < uniqueValues.length; i += PAGE_SIZE) {
    const batch = uniqueValues.slice(i, i + PAGE_SIZE);
    const { data, error } = await supabase.from(table).select(columns).in(keyColumn, batch);
    if (error) throw new Error(`${table} lookup failed: ${error.message}`);
    for (const row of data ?? []) out.set(String(row[keyColumn]), row);
  }
  return out;
}

function addSample(samples, row, reason, details = {}) {
  if (samples.length >= SAMPLE_LIMIT) return;
  samples.push({
    comic_id: row.id,
    gcd_id: row.gcd_id,
    issue_number: row.issue_number,
    series_id: row.series_id,
    reason,
    ...details,
  });
}

async function run() {
  console.log(APPLY ? "MODE: APPLY GCD-ID dedupe" : "MODE: read-only GCD-ID dedupe plan");

  console.log("\nLoading collection references...");
  const collectionRows = await fetchAllById(
    "user_collections",
    "id, comic_id, gcd_issue_id, user_cover_url",
    (query) => query.not("comic_id", "is", null)
  );
  const collectionsByComicId = new Map();
  for (const row of collectionRows) {
    const key = String(row.comic_id);
    if (!collectionsByComicId.has(key)) collectionsByComicId.set(key, []);
    collectionsByComicId.get(key).push(row);
  }
  console.log(`  collection rows with comic_id: ${collectionRows.length.toLocaleString()}`);

  console.log("\nValidating GCD-linked comics...");
  const eligibleByComicId = new Map();
  const eligibleSamples = [];
  const rejectedSamples = [];
  const stats = {
    scanned: 0,
    eligible: 0,
    attributed: 0,
    missingGcdIssue: 0,
    issueMismatch: 0,
    missingLocalSeries: 0,
    seriesMismatch: 0,
    collectionRefs: 0,
    collectionComics: 0,
  };

  let cursor = null;
  while (true) {
    let query = supabase
      .from("comics")
      .select("id, gcd_id, series_id, issue_number, created_by, created_at")
      .not("gcd_id", "is", null)
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    if (cursor != null) query = query.gt("id", cursor);

    const { data: comics, error } = await query;
    if (error) throw new Error(`comics scan failed: ${error.message}`);
    if (!comics?.length) break;

    const [issuesById, seriesById] = await Promise.all([
      fetchMapByValues(
        "gcd_issues",
        "gcd_id",
        "gcd_id, series_gcd_id, issue_number, publication_date",
        comics.map((row) => row.gcd_id)
      ),
      fetchMapByValues(
        "series",
        "id",
        "id, gcd_id, title",
        comics.map((row) => row.series_id)
      ),
    ]);

    for (const comic of comics) {
      stats.scanned += 1;
      if (comic.created_by != null) {
        stats.attributed += 1;
        addSample(rejectedSamples, comic, "created_by is set");
        continue;
      }

      const issue = issuesById.get(String(comic.gcd_id));
      if (!issue) {
        stats.missingGcdIssue += 1;
        addSample(rejectedSamples, comic, "gcd issue missing");
        continue;
      }
      if (normIssue(comic.issue_number) !== normIssue(issue.issue_number)) {
        stats.issueMismatch += 1;
        addSample(rejectedSamples, comic, "issue number mismatch", {
          gcd_issue_number: issue.issue_number,
        });
        continue;
      }

      const series = seriesById.get(String(comic.series_id));
      if (!series) {
        stats.missingLocalSeries += 1;
        addSample(rejectedSamples, comic, "local series missing");
        continue;
      }
      if (Number(series.gcd_id) !== Number(issue.series_gcd_id)) {
        stats.seriesMismatch += 1;
        addSample(rejectedSamples, comic, "series GCD bridge mismatch", {
          local_series_gcd_id: series.gcd_id,
          issue_series_gcd_id: issue.series_gcd_id,
        });
        continue;
      }

      const planRow = {
        comicId: comic.id,
        gcdIssueId: issue.gcd_id,
        seriesTitle: series.title,
        issueNumber: comic.issue_number,
        publicationDate: issue.publication_date,
      };
      eligibleByComicId.set(String(comic.id), planRow);
      stats.eligible += 1;
      if (eligibleSamples.length < SAMPLE_LIMIT) eligibleSamples.push(planRow);

      const refs = collectionsByComicId.get(String(comic.id)) ?? [];
      if (refs.length > 0) {
        stats.collectionComics += 1;
        stats.collectionRefs += refs.length;
      }
    }

    cursor = comics[comics.length - 1].id;
    if (stats.scanned % 10000 < PAGE_SIZE) {
      process.stdout.write(
        `  scanned ${stats.scanned.toLocaleString()}; eligible ${stats.eligible.toLocaleString()}\r`
      );
    }
    if (comics.length < PAGE_SIZE) break;
  }
  process.stdout.write("\n");

  console.log("\nInventorying covers attached to eligible rows...");
  const coverRows = await fetchAllById(
    "comic_covers",
    "id, comic_id, image_path, is_primary, is_official, uploaded_by"
  );
  let eligibleCoverRows = 0;
  let eligibleComicsWithCovers = 0;
  let eligibleUserUploadedCovers = 0;
  const coveredEligibleIds = new Set();
  const coverSamples = [];
  for (const cover of coverRows) {
    if (!eligibleByComicId.has(String(cover.comic_id))) continue;
    eligibleCoverRows += 1;
    coveredEligibleIds.add(String(cover.comic_id));
    if (cover.uploaded_by != null || cover.is_official === false) eligibleUserUploadedCovers += 1;
    if (coverSamples.length < SAMPLE_LIMIT) coverSamples.push(cover);
  }
  eligibleComicsWithCovers = coveredEligibleIds.size;

  console.log("\n--- GCD-ID dedupe plan ---");
  console.log(`GCD-linked comics scanned:             ${stats.scanned.toLocaleString()}`);
  console.log(`Eligible after all identity checks:    ${stats.eligible.toLocaleString()}`);
  console.log(`Rejected: created_by is set:           ${stats.attributed.toLocaleString()}`);
  console.log(`Rejected: missing gcd_issues row:      ${stats.missingGcdIssue.toLocaleString()}`);
  console.log(`Rejected: issue number mismatch:       ${stats.issueMismatch.toLocaleString()}`);
  console.log(`Rejected: missing local series:        ${stats.missingLocalSeries.toLocaleString()}`);
  console.log(`Rejected: series bridge mismatch:      ${stats.seriesMismatch.toLocaleString()}`);
  console.log(`Collection rows requiring rewiring:    ${stats.collectionRefs.toLocaleString()}`);
  console.log(`Eligible comics referenced by library: ${stats.collectionComics.toLocaleString()}`);
  console.log(`Cover rows attached to eligible comics:${eligibleCoverRows.toLocaleString().padStart(13)}`);
  console.log(`Eligible comics with covers:           ${eligibleComicsWithCovers.toLocaleString()}`);
  console.log(`Potential user-uploaded cover rows:    ${eligibleUserUploadedCovers.toLocaleString()}`);

  console.log("\nEligible samples:");
  console.log(JSON.stringify(eligibleSamples, null, 2));
  console.log("\nRejected samples:");
  console.log(JSON.stringify(rejectedSamples, null, 2));
  console.log("\nEligible cover samples:");
  console.log(JSON.stringify(coverSamples, null, 2));

  if (!APPLY) {
    console.log("\nDry-run complete. No database or storage writes were attempted.");
    console.log("Apply requires --apply plus --confirm=<exact eligible count>.");
    return;
  }

  const rejected =
    stats.attributed +
    stats.missingGcdIssue +
    stats.issueMismatch +
    stats.missingLocalSeries +
    stats.seriesMismatch;
  const blockers = [];
  if (!Number.isSafeInteger(CONFIRMED_COUNT) || CONFIRMED_COUNT < 1) {
    blockers.push("missing or invalid --confirm=<exact eligible count>");
  }
  if (stats.eligible !== CONFIRMED_COUNT) {
    blockers.push(`eligible count ${stats.eligible} does not equal confirmation ${CONFIRMED_COUNT}`);
  }
  if (rejected !== 0) blockers.push(`${rejected} GCD-linked rows failed identity checks`);
  if (stats.collectionRefs !== 0) blockers.push(`${stats.collectionRefs} collection references exist`);
  if (eligibleCoverRows !== 0) blockers.push(`${eligibleCoverRows} attached cover rows exist`);

  if (blockers.length > 0) {
    console.error("\nAPPLY ABORTED:");
    for (const blocker of blockers) console.error(`  - ${blocker}`);
    process.exitCode = 2;
    return;
  }

  const ids = [...eligibleByComicId.keys()];
  let deleted = 0;
  console.log(`\nDeleting ${ids.length.toLocaleString()} fully validated legacy rows...`);
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    const batch = ids.slice(i, i + PAGE_SIZE);
    let lastError = null;
    let complete = false;

    for (let attempt = 1; attempt <= 3 && !complete; attempt += 1) {
      const { data, error } = await supabase
        .from("comics")
        .delete()
        .in("id", batch)
        .select("id");
      if (!error && (data ?? []).length === batch.length) {
        complete = true;
        break;
      }

      lastError = error ?? new Error(`delete returned ${(data ?? []).length}/${batch.length} rows`);
      const { data: remaining, error: checkError } = await supabase
        .from("comics")
        .select("id")
        .in("id", batch);
      if (checkError) throw new Error(`delete verification failed: ${checkError.message}`);
      if ((remaining ?? []).length === 0) {
        complete = true;
        break;
      }
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }

    if (!complete) {
      throw new Error(
        `delete batch ${i / PAGE_SIZE + 1} failed after retries: ${lastError?.message ?? lastError}`
      );
    }

    deleted += batch.length;
    if (deleted % 10000 < PAGE_SIZE) {
      process.stdout.write(`  deleted ${deleted.toLocaleString()}/${ids.length.toLocaleString()}\r`);
    }
  }
  process.stdout.write("\n");
  console.log(`Apply complete: ${deleted.toLocaleString()} legacy comics deleted.`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
