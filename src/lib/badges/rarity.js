// Steam-style badge rarity: the share of collectors who hold each badge.
// "Collectors" are profiles with a username, test accounts left out of both
// the count and the total.

export const RARE_PERCENT = 10;

// viewCounts: rows of the badge_rarity view ({badge_id, earned_count}).
// testRows: user_badges rows held by test accounts, taken back out.
export function badgeRarity({ viewCounts = [], testRows = [], memberCount = 0 }) {
  const counts = {};
  for (const row of viewCounts) counts[row.badge_id] = Number(row.earned_count) || 0;
  for (const row of testRows) if (counts[row.badge_id]) counts[row.badge_id] -= 1;
  return { total: Math.max(0, Number(memberCount) || 0), counts };
}

export function rarityPercent(count = 0, total = 0) {
  return total > 0 ? (Math.min(count, total) / total) * 100 : null;
}

export function rarityLabel(count = 0, total = 0) {
  const percent = rarityPercent(count, total);
  if (percent == null) return null;
  if (!count) return "No collector has this yet";
  return `${percent < 1 ? "<1" : Math.round(percent)}% of collectors`;
}

export function isRare(count = 0, total = 0) {
  const percent = rarityPercent(count, total);
  return percent != null && count > 0 && percent < RARE_PERCENT;
}
