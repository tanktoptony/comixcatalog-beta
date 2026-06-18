// Moves user_collections rows from Marvel UK Transformers (gcd_series 32544)
// to US Marvel Transformers (gcd_series 2898) by matching issue_number.
// Dry-run by default; pass --apply to write.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const FROM_SERIES = 32544;
const TO_SERIES = 2898;

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: fromIssues } = await sb
  .from('gcd_issues')
  .select('gcd_id, issue_number')
  .eq('series_gcd_id', FROM_SERIES);
const fromMap = new Map(fromIssues.map(r => [r.gcd_id, r.issue_number]));

const { data: toIssues } = await sb
  .from('gcd_issues')
  .select('gcd_id, issue_number')
  .eq('series_gcd_id', TO_SERIES);
// Prefer lowest gcd_id per issue_number (typically the first printing in GCD).
const toMap = new Map();
for (const r of toIssues.sort((a, b) => a.gcd_id - b.gcd_id)) {
  const k = String(r.issue_number).trim();
  if (!toMap.has(k)) toMap.set(k, r.gcd_id);
}

const { data: ucRows } = await sb
  .from('user_collections')
  .select('id, user_id, gcd_issue_id')
  .in('gcd_issue_id', [...fromMap.keys()]);

console.log(`Found ${ucRows.length} user_collections rows under series ${FROM_SERIES}`);

let mapped = 0, unmatched = 0;
const updates = [];
for (const row of ucRows) {
  const issueNum = fromMap.get(row.gcd_issue_id);
  const newGcdId = toMap.get(String(issueNum).trim());
  if (newGcdId) {
    updates.push({ id: row.id, from: row.gcd_issue_id, to: newGcdId, issue: issueNum });
    mapped++;
  } else {
    console.log(`  UNMATCHED: row ${row.id} issue #${issueNum} has no equivalent under ${TO_SERIES}`);
    unmatched++;
  }
}

console.log(`\nMappable: ${mapped}  Unmatched: ${unmatched}`);
for (const u of updates) console.log(`  ${u.id}  issue #${u.issue}  ${u.from} -> ${u.to}`);

if (!APPLY) {
  console.log('\n(dry run — pass --apply to write)');
  process.exit(0);
}

let ok = 0, err = 0;
for (const u of updates) {
  const { error } = await sb
    .from('user_collections')
    .update({ gcd_issue_id: u.to })
    .eq('id', u.id);
  if (error) { console.error(`  fail ${u.id}: ${error.message}`); err++; } else ok++;
}
console.log(`\nApplied: ${ok}  Failed: ${err}`);
