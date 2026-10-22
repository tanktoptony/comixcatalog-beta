export const RUN_QUICK_ADD_LIMIT = 500;

export function selectableIssueIds(issues, ownedIds) {
  return (issues ?? [])
    .map((issue) => String(issue?.id ?? ""))
    .filter((id) => id && !ownedIds?.has(id));
}

export function selectIssueRange(issues, firstId, lastId, ownedIds) {
  const ids = (issues ?? []).map((issue) => String(issue?.id ?? ""));
  const firstIndex = ids.indexOf(String(firstId));
  const lastIndex = ids.indexOf(String(lastId));

  if (firstIndex === -1 || lastIndex === -1) return [];

  const start = Math.min(firstIndex, lastIndex);
  const end = Math.max(firstIndex, lastIndex);

  return ids
    .slice(start, end + 1)
    .filter((id) => id && !ownedIds?.has(id));
}

export function buildRunQuickAddPayload(selectedIds, ownedIds) {
  const issueIds = [];
  const seen = new Set();

  for (const rawId of selectedIds ?? []) {
    const id = String(rawId ?? "");
    const match = id.match(/^gcd-(\d+)$/i);
    if (!match || ownedIds?.has(id)) continue;

    const issueId = Number(match[1]);
    if (seen.has(issueId)) continue;
    seen.add(issueId);
    issueIds.push(issueId);
  }

  return { issue_ids: issueIds.slice(0, RUN_QUICK_ADD_LIMIT) };
}
