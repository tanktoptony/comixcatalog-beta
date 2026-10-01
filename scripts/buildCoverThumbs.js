// Build the small WebP cover thumbs the grids load (see src/lib/coverThumb.js).
//
// Originals in canonical-covers average ~3.7 MB and run up to 13 MB; grids
// were drawing them into 180px tiles. Each thumb is a 400px-wide WebP at
// w400/<original storage path>.webp in the public cover-thumbs bucket, with a
// one-year cache header so browsers and the CDN keep it.
//
// Source images come from ComicVine (the URL each cover row already records),
// not from our own bucket: reading 170k originals back out of Supabase would
// itself be ~hundreds of GB of billed egress. ComicVine's scale_large copy is
// tried first (~600 KB vs multi-MB originals), then its original, then, only
// if both fail, our stored original.
//
//   node scripts/buildCoverThumbs.js --phase=featured            # dry run
//   node scripts/buildCoverThumbs.js --phase=featured --apply
//   node scripts/buildCoverThumbs.js --phase=covers --apply --limit=5000
//   node scripts/buildCoverThumbs.js --phase=variants --apply
//
// featured: every series' featured cover. Slow: looks covers up by
//           storage_path, which is not indexed. Prefer list + covers.
// covers:   all canonical_covers, by id.
// variants: all cover_variants.
// list:     storage paths from --paths=<file>, one per line (to jump specific
//           covers, e.g. the homepage carousel's, to the front of the line).
//
// Progress is appended to --state (default .cover-thumbs/done.txt,
// one storage path per line) so a rerun skips finished covers without
// re-downloading them. An upload that collides with an existing thumb counts
// as done.

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import sharp from "sharp";
import { thumbStoragePath, THUMB_WIDTH } from "../src/lib/coverThumb.js";

dotenv.config({ path: process.env.COMIXCATALOG_ENV_FILE || ".env.local" });

const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;
const apply = process.argv.includes("--apply");
const phase = arg("phase", "featured");
const limit = Number(arg("limit", "0")) || Infinity;
const concurrency = Number(arg("concurrency", "6"));
const statePath = arg("state", ".cover-thumbs/done.txt");
const pathsFile = arg("paths", null);

const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}
if (!["featured", "covers", "variants", "list"].includes(phase)) throw new Error(`unknown --phase=${phase}`);
if (phase === "list" && !pathsFile) throw new Error("--phase=list needs --paths=<file>");

const BUCKET = "cover-thumbs";
const supabaseHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A run takes hours; a statement timeout or 5xx while the database is busy
// should pause it, not end it.
async function supabaseGet(table, params) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { headers: supabaseHeaders }).catch((err) => ({ ok: false, status: 0, text: async () => String(err) }));
    if (response.ok) return response.json();
    const text = await response.text();
    if ((response.status === 0 || response.status === 429 || response.status >= 500) && attempt < 6) {
      await sleep(5000 * 2 ** attempt);
      continue;
    }
    throw new Error(`${table} query failed (${response.status}): ${text}`);
  }
}

async function ensureBucket() {
  const res = await fetch(`${supabaseUrl}/storage/v1/bucket/${BUCKET}`, { headers: supabaseHeaders });
  if (res.ok) return;
  if (!apply) {
    console.log(`bucket ${BUCKET} does not exist yet (would create)`);
    return;
  }
  const created = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...supabaseHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, allowed_mime_types: ["image/webp"] }),
  });
  if (!created.ok) throw new Error(`create bucket failed (${created.status}): ${await created.text()}`);
  console.log(`created public bucket ${BUCKET}`);
}

// { storagePath, sourceUrl } for canonical cover storage paths.
async function* withSources(paths) {
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const covers = await supabaseGet("canonical_covers", {
      select: "storage_path,original_cover_url",
      storage_path: `in.(${chunk.map((p) => `"${p.replace(/"/g, '\\"')}"`).join(",")})`,
    });
    const byPath = new Map(covers.map((c) => [c.storage_path, c.original_cover_url]));
    for (const p of chunk) yield { storagePath: p, sourceUrl: byPath.get(p) ?? null };
  }
}

// Rows of { storagePath, sourceUrl } for the phase, in pages, keyset by id.
async function* rowsForPhase() {
  if (phase === "featured") {
    let after = null;
    for (;;) {
      const params = {
        select: "id,featured_cover_path_cached",
        featured_cover_path_cached: "not.is.null",
        order: "id",
        limit: "1000",
      };
      if (after != null) params.id = `gt.${after}`;
      const series = await supabaseGet("series", params);
      if (!series.length) return;
      after = series[series.length - 1].id;
      yield* withSources([...new Set(series.map((s) => s.featured_cover_path_cached))]);
    }
  }
  if (phase === "list") {
    const paths = fs.readFileSync(pathsFile, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    yield* withSources([...new Set(paths)]);
    return;
  }
  const table = phase === "covers" ? "canonical_covers" : "cover_variants";
  const sourceColumn = phase === "covers" ? "original_cover_url" : "original_url";
  let after = null;
  for (;;) {
    const params = { select: `id,storage_path,${sourceColumn}`, storage_path: "not.is.null", order: "id", limit: "1000" };
    if (after != null) params.id = `gt.${after}`;
    const rows = await supabaseGet(table, params);
    if (!rows.length) return;
    after = rows[rows.length - 1].id;
    for (const r of rows) yield { storagePath: r.storage_path, sourceUrl: r[sourceColumn] };
  }
}

async function fetchImage(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "ComixCatalog/1.0 (cover thumbnails)" } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 100 ? buf : null;
  } catch {
    return null;
  }
}

function sourceCandidates({ storagePath, sourceUrl }) {
  const out = [];
  if (sourceUrl && sourceUrl.includes("/uploads/original/")) {
    out.push(sourceUrl.replace("/uploads/original/", "/uploads/scale_large/"));
  }
  if (sourceUrl) out.push(sourceUrl);
  out.push(`${supabaseUrl}/storage/v1/object/public/canonical-covers/${storagePath}`);
  return out;
}

async function makeThumb(row) {
  for (const url of sourceCandidates(row)) {
    const input = await fetchImage(url);
    if (!input) continue;
    try {
      const webp = await sharp(input, { failOn: "none" })
        .rotate()
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: 72, effort: 4 })
        .toBuffer();
      return { webp, from: url.includes("/storage/v1/") ? "storage" : "comicvine" };
    } catch {
      // Not a decodable image (an HTML error page with a 200, a truncated
      // file); try the next source.
    }
  }
  return null;
}

// Storage shares the project's database connection pool with the live site.
// On a 429/5xx back off and retry rather than pile on; the site matters more
// than how fast the backfill finishes.
async function upload(storagePath, webp) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${thumbStoragePath(storagePath)}`, {
      method: "POST",
      headers: {
        ...supabaseHeaders,
        "Content-Type": "image/webp",
        "cache-control": "max-age=31536000",
        "x-upsert": "false",
      },
      body: webp,
    });
    if (res.ok) return "uploaded";
    const text = await res.text();
    if (res.status === 409 || /already exists|Duplicate/i.test(text)) return "exists";
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    throw new Error(`upload ${storagePath} failed (${res.status}): ${text}`);
  }
}

const done = new Set(
  fs.existsSync(statePath) ? fs.readFileSync(statePath, "utf8").split(/\r?\n/).filter(Boolean) : []
);
fs.mkdirSync(path.dirname(statePath), { recursive: true });
const stateOut = apply ? fs.createWriteStream(statePath, { flags: "a" }) : null;

const stats = { seen: 0, skipped: 0, uploaded: 0, exists: 0, failed: 0, fromStorage: 0, bytes: 0 };
const failures = [];
const started = Date.now();

await ensureBucket();

const rows = rowsForPhase();

async function nextRow() {
  for (;;) {
    if (stats.seen >= limit) return null;
    const { value, done: end } = await rows.next();
    if (end) return null;
    if (done.has(value.storagePath)) {
      stats.skipped += 1;
      continue;
    }
    done.add(value.storagePath);
    stats.seen += 1;
    return value;
  }
}

let pulling = Promise.resolve();
function take() {
  // Serialize generator access across workers.
  const p = pulling.then(nextRow);
  pulling = p.catch(() => {});
  return p;
}

async function worker() {
  for (;;) {
    const row = await take();
    if (!row) return;
    if (!apply) continue;
    try {
      const thumb = await makeThumb(row);
      if (!thumb) {
        stats.failed += 1;
        failures.push(row.storagePath);
        continue;
      }
      const result = await upload(row.storagePath, thumb.webp);
      stats[result] += 1;
      stats.bytes += thumb.webp.length;
      if (thumb.from === "storage") stats.fromStorage += 1;
      stateOut.write(`${row.storagePath}\n`);
    } catch (err) {
      stats.failed += 1;
      failures.push(`${row.storagePath} :: ${err.message}`);
    }
    const n = stats.uploaded + stats.exists + stats.failed;
    if (n % 250 === 0) {
      const rate = n / ((Date.now() - started) / 1000);
      console.log(`${phase}: ${n} done (${stats.uploaded} new, ${stats.failed} failed), ${rate.toFixed(1)}/s`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
stateOut?.end();

const avgKb = stats.uploaded ? (stats.bytes / stats.uploaded / 1024).toFixed(1) : "n/a";
console.log(JSON.stringify({ phase, apply, ...stats, avgThumbKb: avgKb, seconds: Math.round((Date.now() - started) / 1000) }));
if (failures.length) {
  const failPath = statePath.replace(/\.txt$/, "") + `-failures-${phase}.txt`;
  fs.writeFileSync(failPath, failures.join("\n") + "\n");
  console.log(`${failures.length} failures written to ${failPath}`);
}
