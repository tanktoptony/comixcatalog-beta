// backfillMissingSeriesRows.js
//
// One-time backfill for the 2026-08-03 cover-ingest batch: canonical_covers
// rows with no series_gcd_id AND no matching series row at all (not just
// ambiguous multi-volume) are orphaned -- covers exist in storage/the DB but
// there's no page in the app that could ever show them. probeNewReleases.js
// now prevents this going forward (see that script's seriesRowExists() /
// createMinimalSeriesRow() -- same logic, duplicated here on purpose since
// this is a one-time script, not a recurring part of the pipeline), but it
// never revisits a volume that's already partially ingested, so it can't
// fix titles that are already orphaned. This does, for exactly the batch
// that surfaced the bug.
//
// Usage:
//   node scripts/backfillMissingSeriesRows.js            # dry run
//   node scripts/backfillMissingSeriesRows.js --apply    # write
//   node scripts/backfillMissingSeriesRows.js --since=2026-08-03T00:00:00 --apply

import 'dotenv/config';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sinceArg = process.argv.find(a => a.startsWith('--since='));
const SINCE = sinceArg ? sinceArg.split('=')[1] : '2026-08-03T00:00:00';

function normTitle(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Same check as probeNewReleases.js: exact OR normalized title match means a
// series row already exists (even if ambiguous/multi-volume) -- that's a
// different, already-handled problem, not a missing series.
async function seriesRowExists(sb, title) {
  const { data: exact } = await sb.from('series').select('id').eq('title', title).limit(1);
  if (exact?.length) return true;
  const norm = normTitle(title);
  const { data: normMatch } = await sb.from('series').select('id').eq('title_normalized', norm).limit(1);
  return Boolean(normMatch?.length);
}

async function createMinimalSeriesRow(sb, { name, publisher, year }) {
  // title_normalized is a Postgres GENERATED column -- do not set it.
  const { error } = await sb.from('series').insert({
    title: name,
    cv_publisher: publisher,
    resolved_publisher_cached: publisher,
    year_start_cached: year,
  });
  if (error) throw error;
}

// One representative (publisher, series_year) per distinct orphaned title,
// paginated so we don't silently truncate at PostgREST's row cap.
async function fetchOrphanedTitles(sb, since) {
  const byTitle = new Map();
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from('canonical_covers')
      .select('series_title, publisher, series_year')
      .is('series_gcd_id', null)
      .not('series_title', 'is', null)
      .gte('created_at', since)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      if (!byTitle.has(row.series_title)) {
        byTitle.set(row.series_title, { publisher: row.publisher, year: row.series_year });
      }
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return byTitle;
}

(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log(`Scanning canonical_covers created >= ${SINCE} for orphaned titles (no series_gcd_id)...`);

  const byTitle = await fetchOrphanedTitles(sb, SINCE);
  console.log(`  ${byTitle.size} distinct titles with no series_gcd_id link\n`);

  let created = 0;
  let alreadyExists = 0;
  for (const [title, { publisher, year }] of byTitle) {
    if (await seriesRowExists(sb, title)) {
      alreadyExists++;
      continue;
    }
    if (APPLY) {
      await createMinimalSeriesRow(sb, { name: title, publisher, year });
      console.log(`  + created: "${title}" (${publisher || 'unknown publisher'}, ${year || 'unknown year'})`);
    } else {
      console.log(`  would create: "${title}" (${publisher || 'unknown publisher'}, ${year || 'unknown year'})`);
    }
    created++;
  }

  console.log(
    `\n${byTitle.size} titles checked, ${alreadyExists} already have a series row ` +
    `(ambiguous/multi-volume -- correctly left alone), ${created} ${APPLY ? 'created' : 'would be created'}.`
  );
  if (!APPLY) console.log('(dry run -- pass --apply to write)');
})();
