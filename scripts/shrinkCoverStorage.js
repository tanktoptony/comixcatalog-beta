// Bring the canonical-covers bucket back under the Supabase plan's 100 GB.
//
// 2026-10-01: file storage was 140 GB of 100 GB (the only metric over quota;
// the project is restricted from Oct 23 if it stays over). The bucket held
// 150 GB in 199,661 files, of which 23,104 files / 19.7 GB were referenced
// by nothing, and the rest were ComicVine originals averaging ~0.75 MB with
// a long tail up to 13 MB.
//
//   node scripts/shrinkCoverStorage.js --mode=report
//   node scripts/shrinkCoverStorage.js --mode=orphans            # dry run
//   node scripts/shrinkCoverStorage.js --mode=orphans --apply
//   node scripts/shrinkCoverStorage.js --mode=shrink --min-mb=1 --limit=20   # dry run sample
//   node scripts/shrinkCoverStorage.js --mode=shrink --min-mb=1 --apply
//
// orphans: delete files in the bucket that no canonical_covers.storage_path,
//   cover_variants.storage_path or series.featured_cover_path_cached names.
//   Every cover can be re-fetched from ComicVine, but nothing here re-fetches
//   a deleted orphan: nothing points at it.
// shrink: re-save referenced files of at least --min-mb at most
//   --max-height px tall (1600 default; issue pages show ~500 px, video
//   renders ~1080 px). The source is the ComicVine original recorded on the
//   row, not our own copy, so this costs no Supabase egress. A file is only
//   replaced when the result is at least 20% smaller. Same path, same format
//   family, so every URL and thumb stays valid.
//
// Needs the public.admin_storage_objects_by_id(bucket, after_id, limit) SQL
// function (service_role only) to list objects with sizes.
//
// Progress for shrink is appended to .cover-thumbs/shrunk.txt so reruns skip
// finished files.

import fs from "node:fs";
import dotenv from "dotenv";
import sharp from "sharp";

dotenv.config({ path: process.env.COMIXCATALOG_ENV_FILE || ".env.local" });

const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;
const apply = process.argv.includes("--apply");
const mode = arg("mode", "report");
const minBytes = Math.round(Number(arg("min-mb", "1")) * 1e6);
const maxHeight = Number(arg("max-height", "1600"));
const quality = Number(arg("quality", "85"));
const limit = Number(arg("limit", "0")) || Infinity;
const concurrency = Number(arg("concurrency", "4"));
const statePath = ".cover-thumbs/shrunk.txt";

const BUCKET = "canonical-covers";
const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("SUPABASE url and SUPABASE_SERVICE_ROLE_KEY are required");
if (!["report", "orphans", "shrink"].includes(mode)) throw new Error(`unknown --mode=${mode}`);
const H = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gb = (b) => (b / 1e9).toFixed(1) + " GB";

async function withRetry(label, fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= 5) throw new Error(`${label}: ${err.message}`);
      await sleep(3000 * 2 ** attempt);
    }
  }
}

async function rest(path, init = {}) {
  const res = await fetch(`${supabaseUrl}${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${path.slice(0, 80)} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

// Every object in the bucket at or above minSize: [{ name, bytes, createdAt }].
// Pages by storage.objects.id (its primary key): paging by name sorted the
// whole table on every call and hit the 8 s statement timeout.
async function listObjects(minSize = 0) {
  const out = [];
  let after = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const res = await withRetry("list objects", () =>
      rest(`/rest/v1/rpc/admin_storage_objects_by_id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_bucket: BUCKET, p_after: after, p_limit: 1000 }),
      })
    );
    const page = await res.json();
    if (!page.length) return out;
    for (const r of page) {
      const bytes = Number(r.bytes);
      if (bytes >= minSize) out.push({ name: r.name, bytes, createdAt: Date.parse(r.created_at) });
    }
    after = page[page.length - 1].id;
    if (out.length % 20000 < 1000) process.stdout.write(`  listed ${out.length}\r`);
  }
}

// Map of storage path -> ComicVine source URL (or null) for everything the
// database references in this bucket.
async function referencedPaths() {
  const refs = new Map();
  const walk = async (table, cols, pathCol, srcCol) => {
    let after = null;
    for (;;) {
      const p = new URLSearchParams({ select: cols, [pathCol]: "not.is.null", order: "id", limit: "1000" });
      if (after != null) p.set("id", `gt.${after}`);
      const rows = await withRetry(table, async () => (await rest(`/rest/v1/${table}?${p}`)).json());
      if (!rows.length) return;
      after = rows[rows.length - 1].id;
      for (const r of rows) {
        const key = r[pathCol];
        if (!refs.has(key) || (!refs.get(key) && srcCol && r[srcCol])) refs.set(key, srcCol ? r[srcCol] ?? null : null);
      }
    }
  };
  await walk("canonical_covers", "id,storage_path,original_cover_url", "storage_path", "original_cover_url");
  await walk("cover_variants", "id,storage_path,original_url", "storage_path", "original_url");
  await walk("series", "id,featured_cover_path_cached", "featured_cover_path_cached", null);
  return refs;
}

async function report() {
  const [objects, refs] = await Promise.all([listObjects(0), referencedPaths()]);
  const total = objects.reduce((s, o) => s + o.bytes, 0);
  const orphans = objects.filter((o) => !refs.has(o.name));
  const kept = objects.filter((o) => refs.has(o.name));
  const buckets = [0.5e6, 1e6, 2e6, 4e6, 8e6];
  console.log(`bucket: ${objects.length} files, ${gb(total)}`);
  console.log(`orphans: ${orphans.length} files, ${gb(orphans.reduce((s, o) => s + o.bytes, 0))}`);
  console.log(`referenced: ${kept.length} files, ${gb(kept.reduce((s, o) => s + o.bytes, 0))}`);
  for (const b of buckets) {
    const big = kept.filter((o) => o.bytes >= b);
    console.log(`  referenced >= ${b / 1e6} MB: ${big.length} files, ${gb(big.reduce((s, o) => s + o.bytes, 0))}`);
  }
}

async function deleteOrphans() {
  const [objects, refs] = await Promise.all([listObjects(0), referencedPaths()]);
  // Safety: if the reference walk came back implausibly small (a failed or
  // truncated read), refuse rather than delete the whole bucket.
  if (refs.size < 100000) throw new Error(`only ${refs.size} referenced paths found; refusing to delete`);
  // The ingester uploads a file before inserting its row, so a brand-new
  // file can look orphaned for a moment. Leave anything under 2 hours old.
  const cutoff = Date.now() - 2 * 3600 * 1000;
  const orphans = objects.filter((o) => !refs.has(o.name) && !(o.createdAt > cutoff));
  const bytes = orphans.reduce((s, o) => s + o.bytes, 0);
  console.log(`${orphans.length} orphaned files, ${gb(bytes)} (of ${objects.length} files)`);
  fs.mkdirSync(".cover-thumbs", { recursive: true });
  fs.writeFileSync(".cover-thumbs/orphans.txt", orphans.map((o) => `${o.bytes}\t${o.name}`).join("\n") + "\n");
  console.log("list written to .cover-thumbs/orphans.txt");
  if (!apply) return;
  let removed = 0;
  for (let i = 0; i < orphans.length; i += 500) {
    const prefixes = orphans.slice(i, i + 500).map((o) => o.name);
    await withRetry("delete batch", () =>
      rest(`/storage/v1/object/${BUCKET}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes }),
      })
    );
    removed += prefixes.length;
    console.log(`  deleted ${removed} / ${orphans.length}`);
  }
}

function encoderFor(name) {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "png") return { type: "image/png", run: (s) => s.png({ compressionLevel: 9, palette: true, quality }) };
  if (ext === "webp") return { type: "image/webp", run: (s) => s.webp({ quality }) };
  if (ext === "gif") return null;
  return { type: "image/jpeg", run: (s) => s.jpeg({ quality, mozjpeg: true }) };
}

async function fetchBytes(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "ComixCatalog/1.0 (cover storage)" } });
    if (!res.ok) return null;
    const b = Buffer.from(await res.arrayBuffer());
    return b.length > 1000 ? b : null;
  } catch {
    return null;
  }
}

async function shrink() {
  const [objects, refs] = await Promise.all([listObjects(minBytes), referencedPaths()]);
  const done = new Set(fs.existsSync(statePath) ? fs.readFileSync(statePath, "utf8").split(/\r?\n/).filter(Boolean) : []);
  const todo = objects.filter((o) => refs.has(o.name) && !done.has(o.name)).slice(0, limit === Infinity ? undefined : limit);
  console.log(`${todo.length} referenced files >= ${minBytes / 1e6} MB to process (${gb(todo.reduce((s, o) => s + o.bytes, 0))})`);
  fs.mkdirSync(".cover-thumbs", { recursive: true });
  const state = apply ? fs.createWriteStream(statePath, { flags: "a" }) : null;
  const stats = { replaced: 0, skippedNoGain: 0, noSource: 0, failed: 0, before: 0, after: 0 };
  let next = 0;
  const started = Date.now();

  async function one(o) {
    const enc = encoderFor(o.name);
    const src = refs.get(o.name);
    if (!enc || !src) {
      stats.noSource += 1;
      return;
    }
    const input = await fetchBytes(src);
    if (!input) {
      stats.noSource += 1;
      return;
    }
    const out = await enc.run(sharp(input, { failOn: "none" }).rotate().resize({ height: maxHeight, withoutEnlargement: true })).toBuffer();
    if (out.length > o.bytes * 0.8) {
      stats.skippedNoGain += 1;
      state?.write(`${o.name}\n`);
      return;
    }
    stats.before += o.bytes;
    stats.after += out.length;
    if (apply) {
      await withRetry("upload", () =>
        rest(`/storage/v1/object/${BUCKET}/${o.name}`, {
          method: "POST",
          headers: { "Content-Type": enc.type, "cache-control": "max-age=2592000", "x-upsert": "true" },
          body: out,
        })
      );
      state.write(`${o.name}\n`);
    }
    stats.replaced += 1;
  }

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < todo.length) {
        const o = todo[next++];
        try {
          await one(o);
        } catch (err) {
          stats.failed += 1;
          if (stats.failed <= 10) console.log(`  failed ${o.name}: ${err.message}`);
        }
        const n = next;
        if (n % 500 === 0) {
          const rate = n / ((Date.now() - started) / 1000);
          console.log(`  ${n}/${todo.length}, saved ${gb(stats.before - stats.after)} so far, ${rate.toFixed(1)}/s`);
        }
      }
    })
  );
  state?.end();
  console.log(JSON.stringify({ apply, ...stats, saved: gb(stats.before - stats.after) }));
}

if (mode === "report") await report();
else if (mode === "orphans") await deleteOrphans();
else await shrink();
