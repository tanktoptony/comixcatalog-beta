// Every .in() list goes into the request URL, and a big collection's lists
// together are too long for it: PostgREST answered "Bad Request" and the whole
// profile was a 500 for the four largest collections (2026-11-24). Batches keep
// the URL short; each one carries only its own series' issue numbers.
const COVER_BATCH = 40;
export function coverBatches(keys, numbersOf) {
  const batches = [];
  for (let i = 0; i < keys.length; i += COVER_BATCH) {
    const group = keys.slice(i, i + COVER_BATCH);
    const numbers = [...new Set(group.flatMap((key) => [...(numbersOf.get(key) ?? [])]))];
    // A few very long runs can still add up, so split the numbers too.
    for (let n = 0; n < numbers.length; n += 400) batches.push({ group, numbers: numbers.slice(n, n + 400) });
  }
  return batches;
}

export function numbersByKey(rows, keyOf) {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (key == null || row.issue_number == null) continue;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(row.issue_number);
  }
  return map;
}
