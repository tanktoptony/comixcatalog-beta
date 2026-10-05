// probeNewReleases.js
//
// Pull recent ComicVine /issues releases, group by volume, and append any
// volumes whose recent issue numbers lack canonical coverage to gap-manual.json.
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
//   3. Batch-read canonical_covers and compare normalized issue numbers.
//   4. Append uncovered volumes to gap-manual.json — same shape the ingester
//      already consumes, and expire its done-ledger key for the next hourly run.

import 'dotenv/config';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { normalizePublisherLabel } from '../src/lib/publisher.js';
import { fetchAllPages } from '../src/lib/supabase/fetchAllPages.js';
import { fetchRecentComicVineIssues } from './lib/cvRecentReleases.js';

config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const daysArg = process.argv.find(a => a.startsWith('--days='));
const DAYS = daysArg ? Number(daysArg.split('=')[1]) : 14;

const CV_KEY = process.env.COMICVINE_API_KEY;
if (!CV_KEY) {
  console.error('COMICVINE_API_KEY missing');
  process.exit(1);
}

// Publisher allowlist check used to be a hand-copied ~15-entry Set here,
// separate from src/lib/publisher.js's real ~40-entry US_PUBLISHER_ALLOWLIST.
// It drifted stale — Titan Comics, Ahoy Comics, Antarctic Press, Vertigo,
// WildStorm, Fantagraphics, VIZ Media, Charlton, and ~15 others were missing,
// so real US publishers were being wrongly skipped as "not allowlisted"
// (confirmed 2026-08-08: a 292-volume probe wrongly rejected Titan Comics 4
// times). Use the canonical resolver instead of a second copy of the list.

const GAP_MANUAL_PATH = path.resolve('gap-manual.json');
const DONE_PATH = path.resolve('.ingest-done.json');
const IN_CHUNK_SIZE = 50;

function normalizeIssueNumber(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  const numeric = raw.match(/^#?\s*(\d+(?:\.\d+)?)/);
  if (numeric) return String(Number(numeric[1]));
  return raw.replace(/(?:[\s._-]*(?:variant|cover)?\s*[a-z])$/i, '');
}

function doneKey(target) {
  return `${target.name}\u0001${target.publisher}\u0001${target.year}`;
}

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

  const issues = await fetchRecentComicVineIssues({ apiKey: CV_KEY, sinceDate });
  console.log(`  ${issues.length} recent issues returned by CV`);

  // Group by volume_id
  const volMap = new Map();
  for (const iss of issues) {
    const v = iss.volume;
    if (!v?.id) continue;
    if (!volMap.has(v.id)) volMap.set(v.id, { id: v.id, name: v.name, issueNumbers: new Set() });
    volMap.get(v.id).issueNumbers.add(normalizeIssueNumber(iss.issue_number));
  }
  console.log(`  → ${volMap.size} distinct volumes`);

  // Load existing gap-manual to dedupe against
  const existing = JSON.parse(fs.readFileSync(GAP_MANUAL_PATH, 'utf-8'));
  const existingByVolId = new Map(existing.filter(e => e.volume_id).map(e => [Number(e.volume_id), e]));

  const coveredIssueNumbers = new Map();
  const volumeIds = [...volMap.keys()];
  for (let start = 0; start < volumeIds.length; start += IN_CHUNK_SIZE) {
    const chunk = volumeIds.slice(start, start + IN_CHUNK_SIZE);
    const rows = await fetchAllPages(() => sb
      .from('canonical_covers')
      .select('id,comicvine_volume_id,issue_number')
      .in('comicvine_volume_id', chunk), 'id');
    for (const row of rows) {
      const id = Number(row.comicvine_volume_id);
      if (!coveredIssueNumbers.has(id)) coveredIssueNumbers.set(id, new Set());
      coveredIssueNumbers.get(id).add(normalizeIssueNumber(row.issue_number));
    }
  }

  const rawDone = fs.existsSync(DONE_PATH) ? JSON.parse(fs.readFileSync(DONE_PATH, 'utf-8')) : {};
  const done = Array.isArray(rawDone)
    ? Object.fromEntries(rawDone.map(key => [key, new Date().toISOString()]))
    : rawDone;
  let expiredDoneCount = 0;

  // For each volume, check canonical_covers coverage
  const candidates = [];
  let checked = 0;
  for (const vol of volMap.values()) {
    checked++;
    const covered = coveredIssueNumbers.get(vol.id) ?? new Set();
    const missing = [...vol.issueNumbers].filter(number => number && !covered.has(number));
    if (!missing.length) continue;

    // Need to fetch volume meta to get publisher + start_year for gap entry.
    await new Promise(r => setTimeout(r, 1100));
    let meta;
    try { meta = await fetchVolumeMeta(vol.id); } catch (e) { console.warn(`  vol ${vol.id} fetch failed: ${e.message}`); continue; }
    if (!meta) continue;

    const publisherName = meta.publisher?.name || '';
    const canonicalPublisher = normalizePublisherLabel(publisherName);
    if (!canonicalPublisher) {
      console.log(`  skip vol ${vol.id} "${meta.name}" — publisher "${publisherName}" not allowlisted`);
      continue;
    }

    // Store the canonical name, not ComicVine's raw string — gap-manual.json
    // needs to match resolved_publisher_cached's form for the ingester's
    // publisher gate to work (same convention the other gap-*.json
    // generators already follow).
    const year = meta.start_year ? Number(meta.start_year) : null;
    const candidate = { name: meta.name, publisher: canonicalPublisher, year, volume_id: vol.id };
    const queued = existingByVolId.get(vol.id);
    if (!queued) candidates.push(candidate);

    const key = doneKey(queued ?? candidate);
    if (Object.hasOwn(done, key)) {
      delete done[key];
      expiredDoneCount++;
    }
    console.log(`  missing: ${meta.name} | vol ${vol.id} | issue(s) ${missing.join(', ')}`);

    if (await seriesRowExists(sb, meta.name)) {
      console.log(`  + ${meta.name} (${canonicalPublisher}, ${meta.start_year}) vol ${vol.id} — ${missing.length} missing recent issue(s)`);
    } else if (APPLY) {
      await createMinimalSeriesRow(sb, { name: meta.name, publisher: canonicalPublisher, year });
      console.log(`  + ${meta.name} (${canonicalPublisher}, ${meta.start_year}) vol ${vol.id} — ${missing.length} missing recent issue(s) [created series row — no catalog entry existed]`);
    } else {
      console.log(`  + ${meta.name} (${canonicalPublisher}, ${meta.start_year}) vol ${vol.id} — ${missing.length} missing recent issue(s) [would create series row — no catalog entry exists]`);
    }
  }

  console.log(`\n${candidates.length} volume(s) to add to the queue (checked ${checked}).`);

  if (!candidates.length && !expiredDoneCount) {
    console.log('Nothing to write.');
    return;
  }

  if (!APPLY) {
    console.log('\n(dry run — pass --apply to append to gap-manual.json)');
    return;
  }

  const merged = [...existing, ...candidates];
  if (candidates.length) fs.writeFileSync(GAP_MANUAL_PATH, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  if (expiredDoneCount) fs.writeFileSync(DONE_PATH, JSON.stringify(done, null, 2) + '\n', 'utf-8');
  console.log(`Wrote ${candidates.length} additions to gap-manual.json (now ${merged.length} total); expired ${expiredDoneCount} done-ledger target(s).`);
})().catch(error => {
  console.error('Recent-release probe failed:', error?.message || error);
  process.exitCode = 1;
});
