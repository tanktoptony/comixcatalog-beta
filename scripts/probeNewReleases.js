// probeNewReleases.js
//
// Pull recent ComicVine /issues releases, group by volume, and append any
// volumes we don't already have canonical coverage for to gap-manual.json.
// Run weekly via GHA (or manually) to keep new-release coverage current
// without waiting for a user to add the book first.
//
// Usage:
//   node scripts/probeNewReleases.js              # last 14 days, dry run
//   node scripts/probeNewReleases.js --days=30    # custom window
//   node scripts/probeNewReleases.js --apply      # write to gap-manual.json
//
// Strategy:
//   1. Hit ComicVine /issues filtered by store_date >= today - N days.
//      Limit to publishers we care about (US major + select indie).
//   2. Group issues by volume_id, dedupe.
//   3. For each volume, check if canonical_covers already has coverage
//      (any row with comicvine_volume_id matching, OR series_gcd_id linked).
//   4. Append uncovered volumes to gap-manual.json — same shape the ingester
//      already consumes. On the next GHA cycle they get processed.

import 'dotenv/config';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const daysArg = process.argv.find(a => a.startsWith('--days='));
const DAYS = daysArg ? Number(daysArg.split('=')[1]) : 14;

const CV_KEY = process.env.COMICVINE_API_KEY;
if (!CV_KEY) {
  console.error('COMICVINE_API_KEY missing');
  process.exit(1);
}

// Publisher allowlist — match the ones already curated in featuredSeries +
// the gap-width generator. Anything else gets skipped (avoids noise from
// foreign-language reprints and obscure indies).
const ALLOWED_PUBLISHERS = new Set([
  'Marvel', 'Marvel Comics',
  'DC Comics',
  'Image', 'Image Comics',
  'IDW Publishing', 'IDW',
  'Dark Horse Comics', 'Dark Horse',
  'BOOM! Studios', 'Boom! Studios',
  'Dynamite Entertainment', 'Dynamite',
  'Valiant Comics', 'Valiant',
  'Oni Press',
  'AfterShock Comics',
  'Vault Comics',
  'Mad Cave Studios',
  'AWA Studios',
  'Skybound',
  'Black Mask Studios',
]);

const GAP_MANUAL_PATH = path.resolve('gap-manual.json');

async function cvFetch(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'ComixCatalog/1.0',
      'Accept': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`CV HTTP ${res.status} ${url}`);
  return res.json();
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function fetchRecentIssues(sinceDate) {
  // ComicVine /issues supports filter=store_date:since|today format.
  // We page 100 at a time, max 5 pages = 500 issues. Adjust if needed.
  const today = new Date().toISOString().slice(0, 10);
  const all = [];
  for (let offset = 0; offset < 500; offset += 100) {
    const url = `https://comicvine.gamespot.com/api/issues/?api_key=${CV_KEY}&format=json&limit=100&offset=${offset}&filter=store_date:${sinceDate}|${today}&field_list=id,issue_number,store_date,cover_date,volume`;
    const data = await cvFetch(url);
    const results = data?.results || [];
    all.push(...results);
    if (results.length < 100) break;
    await new Promise(r => setTimeout(r, 1100)); // CV 1 req/sec
  }
  return all;
}

async function fetchVolumeMeta(volumeId) {
  const url = `https://comicvine.gamespot.com/api/volume/4050-${volumeId}/?api_key=${CV_KEY}&format=json&field_list=id,name,publisher,start_year,count_of_issues`;
  const data = await cvFetch(url);
  return data?.results || null;
}

// Match series.title_normalized semantics exactly (see scripts/fetchStoryArc.js
// normTitle()) — lowercase, strip everything but a-z0-9.
function normTitle(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Covers can only ever show up on a series page that exists. probeNewReleases
// finds ComicVine releases and cover-ingest uploads their images, but neither
// step has ever created the `series` row those covers need — a brand-new
// title (an annual, a one-shot, a genuinely new ongoing) that isn't already
// in the GCD-dump-derived `series` table just gets orphaned covers with
// nowhere to display. Checked both exact and normalized title so this only
// fires on a TRUE miss, not an ambiguous multi-volume title (e.g. "Gambit"
// has 17 series rows already — that's a different, already-handled problem,
// not a missing series).
async function seriesRowExists(sb, title) {
  const { data: exact } = await sb.from('series').select('id').eq('title', title).limit(1);
  if (exact?.length) return true;
  const norm = normTitle(title);
  const { data: normMatch } = await sb.from('series').select('id').eq('title_normalized', norm).limit(1);
  return Boolean(normMatch?.length);
}

// Minimal row only — title/publisher/year, same fields find_volume() already
// resolves in comicvine_api_to_supabase.py. resolved_publisher_cached is set
// directly from ComicVine's publisher name (not left for later re-resolution)
// because these are exclusively new-release titles from the last DAYS window
// — always modern era, where CLAUDE.md's year-aware publisher rule already
// says to trust cv over GCD indicia. issue_count_cached / year_end_cached /
// featured_cover_path_cached are left null for the next scheduled
// refreshSeriesSearchCache.js pass to fill in once covers exist.
async function createMinimalSeriesRow(sb, { name, publisher, year }) {
  // title_normalized is a Postgres GENERATED column — Postgres computes it
  // from `title` itself; setting it explicitly is a hard insert error, not
  // just ignored.
  const { error } = await sb.from('series').insert({
    title: name,
    cv_publisher: publisher,
    resolved_publisher_cached: publisher,
    year_start_cached: year,
  });
  if (error) throw error;
}

(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const sinceDate = isoDaysAgo(DAYS);
  console.log(`Probing CV for issues with store_date >= ${sinceDate}…`);

  const issues = await fetchRecentIssues(sinceDate);
  console.log(`  ${issues.length} recent issues returned by CV`);

  // Group by volume_id
  const volMap = new Map();
  for (const iss of issues) {
    const v = iss.volume;
    if (!v?.id) continue;
    if (!volMap.has(v.id)) volMap.set(v.id, { id: v.id, name: v.name, count: 0 });
    volMap.get(v.id).count++;
  }
  console.log(`  → ${volMap.size} distinct volumes`);

  // Load existing gap-manual to dedupe against
  const existing = JSON.parse(fs.readFileSync(GAP_MANUAL_PATH, 'utf-8'));
  const existingVolIds = new Set(existing.map(e => e.volume_id).filter(Boolean));

  // For each volume, check canonical_covers coverage
  const candidates = [];
  let checked = 0;
  for (const vol of volMap.values()) {
    checked++;
    if (existingVolIds.has(vol.id)) continue;

    // Check if canonical_covers already has any row for this CV volume.
    const { count } = await sb
      .from('canonical_covers')
      .select('id', { count: 'exact', head: true })
      .eq('comicvine_volume_id', vol.id);

    if (count && count > 0) continue;

    // Need to fetch volume meta to get publisher + start_year for gap entry.
    await new Promise(r => setTimeout(r, 1100));
    let meta;
    try { meta = await fetchVolumeMeta(vol.id); } catch (e) { console.warn(`  vol ${vol.id} fetch failed: ${e.message}`); continue; }
    if (!meta) continue;

    const publisherName = meta.publisher?.name || '';
    if (!ALLOWED_PUBLISHERS.has(publisherName)) {
      console.log(`  skip vol ${vol.id} "${meta.name}" — publisher "${publisherName}" not allowlisted`);
      continue;
    }

    const year = meta.start_year ? Number(meta.start_year) : null;
    candidates.push({ name: meta.name, publisher: publisherName, year, volume_id: vol.id });

    if (await seriesRowExists(sb, meta.name)) {
      console.log(`  + ${meta.name} (${publisherName}, ${meta.start_year}) vol ${vol.id} — ${vol.count} new issue(s)`);
    } else if (APPLY) {
      await createMinimalSeriesRow(sb, { name: meta.name, publisher: publisherName, year });
      console.log(`  + ${meta.name} (${publisherName}, ${meta.start_year}) vol ${vol.id} — ${vol.count} new issue(s) [created series row — no catalog entry existed]`);
    } else {
      console.log(`  + ${meta.name} (${publisherName}, ${meta.start_year}) vol ${vol.id} — ${vol.count} new issue(s) [would create series row — no catalog entry exists]`);
    }
  }

  console.log(`\n${candidates.length} new volume(s) to add (checked ${checked}).`);

  if (!candidates.length) {
    console.log('Nothing to write.');
    return;
  }

  if (!APPLY) {
    console.log('\n(dry run — pass --apply to append to gap-manual.json)');
    return;
  }

  const merged = [...existing, ...candidates];
  fs.writeFileSync(GAP_MANUAL_PATH, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  console.log(`Wrote ${candidates.length} additions to gap-manual.json (now ${merged.length} total).`);
})();
