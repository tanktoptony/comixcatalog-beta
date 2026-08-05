import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: process.env.COMIXCATALOG_ENV_FILE || ".env.local" });

const apply = process.argv.includes("--apply");
const countOnly = process.argv.includes("--count-only");
const maxPerIssue = Number(process.argv.find((arg) => arg.startsWith("--max-variant-images-per-issue="))?.split("=")[1] || 10);
const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const comicVineKey = process.env.COMICVINE_API_KEY;
if (!supabaseUrl || !serviceKey || !comicVineKey) {
  throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and COMICVINE_API_KEY are required");
}

const supabaseHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
const cvHeaders = { Accept: "application/json", "User-Agent": "ComixCatalog/1.0" };
const report = { volumes: 0, issues: 0, variants: 0, created: 0, errors: [] };

async function supabaseGet(table, params) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: supabaseHeaders });
  if (!response.ok) throw new Error(`${table} query failed (${response.status}): ${await response.text()}`);
  return response.json();
}

async function supabasePost(table, params, body) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    method: "POST",
    headers: { ...supabaseHeaders, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([body]),
  });
  if (!response.ok) throw new Error(`${table} upsert failed (${response.status}): ${await response.text()}`);
}

async function getVolumeIds() {
  const ids = new Set();
  for (let offset = 0; ; offset += 1000) {
    const rows = await supabaseGet("canonical_covers", {
      select: "comicvine_volume_id",
      comicvine_volume_id: "not.is.null",
      order: "comicvine_volume_id.asc",
      limit: "1000",
      offset: String(offset),
    });
    for (const row of rows) ids.add(Number(row.comicvine_volume_id));
    if (rows.length < 1000) break;
  }
  return [...ids].filter(Number.isInteger);
}

async function getIssues(volumeId) {
  const issues = [];
  for (let offset = 0; ; offset += 100) {
    const url = new URL("https://comicvine.gamespot.com/api/issues/");
    url.search = new URLSearchParams({
      api_key: comicVineKey,
      format: "json",
      filter: `volume:${volumeId}`,
      sort: "issue_number:asc",
      field_list: "id,name,issue_number,image,associated_images,api_detail_url",
      limit: "100",
      offset: String(offset),
    });
    const response = await fetch(url, { headers: cvHeaders });
    if (!response.ok) throw new Error(`ComicVine volume ${volumeId} failed (${response.status})`);
    const payload = await response.json();
    issues.push(...(payload.results || []));
    if (issues.length >= Number(payload.number_of_total_results || 0) || !payload.number_of_page_results) break;
  }
  return issues;
}

async function main() {
  const volumeIds = await getVolumeIds();
  report.volumes = volumeIds.length;
  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${volumeIds.length} distinct ComicVine volumes`);
  console.log(`Estimated ComicVine issue-list requests: ${volumeIds.length} minimum (about ${(volumeIds.length / 180).toFixed(1)} hours at the existing 180-request/hour budget)`);
  if (countOnly) return;
  console.log(`Estimated ComicVine issue-list requests: ${volumeIds.length} minimum`);
  for (const volumeId of volumeIds) {
    try {
      const issues = await getIssues(volumeId);
      report.issues += issues.length;
      for (const issue of issues) {
        const primary = issue.image?.original_url || issue.image?.super_url || null;
        const variants = (issue.associated_images || []).filter((image) => image?.id != null && image?.original_url && image.original_url !== primary).slice(0, maxPerIssue);
        report.variants += variants.length;
        if (!apply || !variants.length) continue;
        const covers = await supabaseGet("canonical_covers", { select: "id,gcd_issue_id", source_issue_url: `eq.${issue.api_detail_url || `comicvine-issue-${issue.id}`}`, limit: "1" });
        if (!covers[0]) throw new Error(`no canonical cover row for issue ${issue.id}`);
        for (const [index, image] of variants.entries()) {
          const ext = path.extname(new URL(image.original_url).pathname).match(/^\.(jpg|jpeg|png|webp)$/i)?.[1] || "jpg";
          const storagePath = `comicvine/backfill/vol-${volumeId}/${issue.id}-variant-${index + 1}.${ext.toLowerCase()}`;
          const imageResponse = await fetch(image.original_url, { headers: cvHeaders });
          if (!imageResponse.ok) throw new Error(`image download failed (${imageResponse.status})`);
          const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/canonical-covers/${storagePath}`, { method: "POST", headers: { ...supabaseHeaders, "Content-Type": imageResponse.headers.get("content-type") || "image/jpeg", "x-upsert": "true" }, body: Buffer.from(await imageResponse.arrayBuffer()) });
          if (!uploadResponse.ok) throw new Error(`storage upload failed (${uploadResponse.status})`);
          await supabasePost("cover_variants", { on_conflict: "source,source_image_id" }, { canonical_cover_id: covers[0].id, gcd_issue_id: covers[0].gcd_issue_id == null ? null : Number(covers[0].gcd_issue_id), source: "comicvine", source_image_id: String(image.id), original_url: image.original_url, storage_path: storagePath, caption: image.caption ?? null, image_tags: image.image_tags ?? null, sort_order: index });
          report.created += 1;
        }
      }
    } catch (error) {
      report.errors.push({ volumeId, error: String(error.message || error) });
      console.error(`Volume ${volumeId} failed: ${error.message || error}`);
    }
  }
  console.log(JSON.stringify(report, null, 2));
  if (!apply) console.log("Dry run only; no storage or database rows were changed. Re-run with --apply after review.");
  if (report.errors.length) process.exitCode = 1;
}

main();
