export function hasSupporterPerks({ isPro, isFounding, membershipTier } = {}) {
  return Boolean(isPro || isFounding || membershipTier === "collector_plus");
}

export function isCollectorPlus(membershipTier) {
  return membershipTier === "collector_plus";
}
