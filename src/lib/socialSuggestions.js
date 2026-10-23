export const REASON_PRIORITY = Object.freeze({
  shared_runs: 5,
  followed_by: 4,
  same_shop: 3,
  same_publisher: 2,
  same_location: 1,
  fallback: 0,
});

export function mergeSuggestionReasons(rows = []) {
  const strongest = new Map();
  for (const row of rows) {
    if (!row?.user_id) continue;
    const current = strongest.get(row.user_id);
    const rowPriority = REASON_PRIORITY[row.reason_kind] ?? 0;
    const currentPriority = REASON_PRIORITY[current?.reason_kind] ?? 0;
    if (!current || Number(row.score || 0) > Number(current.score || 0) || (
      Number(row.score || 0) === Number(current.score || 0) && rowPriority > currentPriority
    )) {
      strongest.set(row.user_id, row);
    }
  }
  return [...strongest.values()].sort((a, b) => (
    Number(b.score || 0) - Number(a.score || 0) ||
    (REASON_PRIORITY[b.reason_kind] ?? 0) - (REASON_PRIORITY[a.reason_kind] ?? 0) ||
    String(a.user_id).localeCompare(String(b.user_id))
  ));
}

export function rankSuggestionSections(rows = []) {
  const ranked = mergeSuggestionReasons(rows);
  return {
    peopleYouMayKnow: ranked,
    publisherCollectors: ranked.filter((row) => row.reason_kind === "same_publisher"),
    sharedRuns: ranked.filter((row) => row.reason_kind === "shared_runs"),
  };
}
