export const FOLLOW_LIMITS = Object.freeze({
  newAccountHours: 24,
  perDay: Object.freeze({ newAccount: 30, established: 200 }),
});

export function cleanUsername(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function selfFollowError(followerId, followeeId) {
  return followerId && followerId === followeeId ? "You can't follow yourself." : null;
}

export function isEitherDirectionBlocked(blockCount) {
  return Number(blockCount) > 0;
}

export function followRateLimitDecision({ accountCreatedAt, recentFollows, now = Date.now() }) {
  const createdAt = new Date(accountCreatedAt).getTime();
  if (!Number.isFinite(createdAt)) throw new Error("Invalid account creation date");
  const isNewAccount = now - createdAt < FOLLOW_LIMITS.newAccountHours * 60 * 60 * 1000;
  const limit = isNewAccount ? FOLLOW_LIMITS.perDay.newAccount : FOLLOW_LIMITS.perDay.established;
  return { isNewAccount, limit, allowed: recentFollows < limit };
}

export function splitFollowBatchByLimit({ accountCreatedAt, recentFollows, candidates, now = Date.now() }) {
  const decision = followRateLimitDecision({ accountCreatedAt, recentFollows, now });
  const remaining = Math.max(0, decision.limit - recentFollows);
  return {
    ...decision,
    accepted: candidates.slice(0, remaining),
    rateLimited: candidates.slice(remaining),
  };
}

export function rankSuggestedCollectors(candidates, { viewerId = null, followedIds = [], blockedIds = [], limit = 24 } = {}) {
  const followed = new Set(followedIds);
  const blocked = new Set(blockedIds);
  return candidates
    .filter((candidate) => (
      candidate.id !== viewerId &&
      candidate.is_public !== false &&
      Number(candidate.owned_count) >= 10 &&
      !followed.has(candidate.id) &&
      !blocked.has(candidate.id)
    ))
    .sort((a, b) => (
      Number(Boolean(b.is_founding_collector)) - Number(Boolean(a.is_founding_collector)) ||
      Number(b.owned_count) - Number(a.owned_count) ||
      String(a.username).localeCompare(String(b.username))
    ))
    .slice(0, limit);
}

// Backslash is PostgreSQL LIKE's escape character. Escape it first, then
// neutralize the two wildcard characters so member input stays literal.
export function escapeLike(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
