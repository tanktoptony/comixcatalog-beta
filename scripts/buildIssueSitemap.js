// Nightly: works out which issue pages the sitemap lists, and stores them by
// id range in sitemap_issue_chunks. The sitemap routes only read that table,
// so nothing walks millions of rows at build time or per request.
//
// Dry run by default.
//   node --env-file=.env.local scripts/buildIssueSitemap.js [--apply] [--allow-shrink]
//
// Which pages, and why: see "Issue sitemap" in docs/ARCHITECTURE.md.

import { createClient } from "@supabase/supabase-js";
import { withRetry } from "./lib/withRetry.js";
import { CHUNK_WIDTH, chunkForId, planWrites, refusalReason, totalUrls } from "./lib/issueSitemapPlan.js";

const APPLY = process.argv.includes("--apply");
const ALLOW_SHRINK = process.argv.includes("--allow-shrink");
const PAUSE_MS = 150;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readExisting() {
  const rows = await withRetry("read chunks", () =>
    supabase.from("sitemap_issue_chunks").select("chunk, gcd_ids").order("chunk").limit(1000));
  return new Map(rows.map((row) => [row.chunk, row.gcd_ids]));
}

// Walks id ranges in order. Ids run to about 2.9M and then jump to a few
// synthetic ones near 1e9, so the next range comes from the next real id, not
// from counting up through 20,000 empty ranges.
async function computeChunks() {
  const chunks = new Map();
  let slowestMs = 0;
  let start = 0;
  for (;;) {
    const end = start + CHUNK_WIDTH;
    const startedAt = Date.now();
    const ids = await withRetry(`range ${start}`, () =>
      supabase.rpc("sitemap_issue_ids", { range_start: start, range_end: end }));
    slowestMs = Math.max(slowestMs, Date.now() - startedAt);
    if (ids?.length) chunks.set(chunkForId(start), ids);

    const next = await withRetry(`next id after ${end}`, () =>
      supabase.from("gcd_issues").select("gcd_id").gte("gcd_id", end).order("gcd_id", { ascending: true }).limit(1));
    if (!next?.length) break;
    start = chunkForId(next[0].gcd_id) * CHUNK_WIDTH;
    await sleep(PAUSE_MS);
  }
  return { chunks, slowestMs };
}

async function run() {
  const startedAt = Date.now();
  const existing = await readExisting();
  const { chunks, slowestMs } = await computeChunks();
  const existingTotal = totalUrls(existing);
  const computedTotal = totalUrls(chunks);
  const largest = Math.max(0, ...[...chunks.values()].map((ids) => ids.length));
  const { upserts, deletes } = planWrites(existing, chunks);

  console.log(`Issues to list: ${computedTotal} in ${chunks.size} files (was ${existingTotal}). Largest file ${largest}. Slowest range ${slowestMs} ms.`);
  console.log(`Files to rewrite: ${upserts.length}. Files to remove: ${deletes.length}.`);

  const refusal = refusalReason(existingTotal, computedTotal, { allowShrink: ALLOW_SHRINK });
  if (refusal) throw new Error(`Refusing to write: ${refusal}`);

  if (!APPLY) {
    console.log("Dry run. Pass --apply to write.");
    return;
  }

  for (const chunk of upserts) {
    const ids = chunks.get(chunk);
    await withRetry(`write chunk ${chunk}`, () =>
      supabase.from("sitemap_issue_chunks").upsert({
        chunk,
        gcd_ids: ids,
        url_count: ids.length,
        updated_at: new Date().toISOString(),
      }));
    await sleep(PAUSE_MS);
  }
  if (deletes.length) {
    await withRetry("remove empty chunks", () =>
      supabase.from("sitemap_issue_chunks").delete().in("chunk", deletes));
  }

  // Read it back, so a write that quietly did nothing can't pass as success.
  const stored = await withRetry("verify", () =>
    supabase.from("sitemap_issue_chunks").select("url_count").limit(1000));
  const storedTotal = stored.reduce((sum, row) => sum + row.url_count, 0);
  if (storedTotal !== computedTotal || stored.length !== chunks.size) {
    throw new Error(`Stored ${storedTotal} URLs in ${stored.length} files, expected ${computedTotal} in ${chunks.size}.`);
  }
  console.log(`Stored ${storedTotal} URLs in ${stored.length} files in ${Math.round((Date.now() - startedAt) / 1000)} s.`);
}

run().catch((error) => {
  console.error("Issue sitemap build failed:", error);
  process.exit(1);
});
