export const TEST_ACCOUNT_USERNAMES = Object.freeze([
  "test_tony",
  "test_tony_depaul",
]);

export function attributionWriteOncePatch(current, incoming) {
  const fields = ["source", "medium", "campaign", "referrer_host", "landing_path"];
  if (fields.some((field) => current?.[field] != null)) return {};
  return Object.fromEntries(fields.filter((field) => incoming?.[field] != null).map((field) => [field, incoming[field]]));
}

export function newlyReachedMilestones(previous = {}, ownedForSaleCount = 0) {
  const next = { ...previous };
  const claimed = [];
  if (ownedForSaleCount >= 1 && !next.first_comic_added) {
    next.first_comic_added = true;
    claimed.push("first_comic_added");
  }
  if (ownedForSaleCount >= 25 && !next.collection_25) {
    next.collection_25 = true;
    claimed.push("collection_25");
  }
  return { next, claimed };
}

export function cohortPercent(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

export function excludeTestAccounts(rows) {
  const excluded = new Set(TEST_ACCOUNT_USERNAMES);
  return rows.filter((row) => !excluded.has(String(row.username || "").toLowerCase()));
}
