const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

export function validateCheckoutSelection({ tier, interval }) {
  if (!tier || !["plus", "pro", "founding"].includes(tier)) {
    return { error: "Unknown membership tier", status: 400 };
  }
  if (tier === "plus" && !["month", "year"].includes(interval)) {
    return { error: "Unknown billing interval", status: 400 };
  }
  return null;
}

export function validateMembershipEligibility({ isPro, isFounding, membershipTier, isAdmin }) {
  if (isPro || isFounding || membershipTier || isAdmin) {
    return { error: "You already have a membership", status: 400 };
  }
  return null;
}

export function subscriptionProfileUpdate(
  subscription,
  { plusMonthlyPriceId, plusAnnualPriceId, proPriceId, foundingPriceId }
) {
  const priceIds = (subscription.items?.data ?? [])
    .map((item) => item.price?.id)
    .filter(Boolean);
  const active = ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status);

  if (priceIds.some((id) => id === plusMonthlyPriceId || id === plusAnnualPriceId)) {
    return { membership_tier: active ? "collector_plus" : null };
  }
  if (priceIds.includes(foundingPriceId)) {
    return active
      ? { is_pro: true, is_founding_collector: true }
      : { is_pro: false };
  }
  if (priceIds.includes(proPriceId)) {
    return { is_pro: active };
  }
  return null;
}

export function subscriptionEventProfileUpdate(eventType, subscription, priceIds) {
  const normalized = eventType === "customer.subscription.deleted"
    ? { ...subscription, status: "canceled" }
    : subscription;
  return subscriptionProfileUpdate(normalized, priceIds);
}
