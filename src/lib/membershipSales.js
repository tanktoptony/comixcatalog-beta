export const MEMBERSHIP_SALES_OPEN = false;
// Flip this switch to true to restore the upgrade page, checkout, and sales prompts.

export const FOUNDING_MEMBERSHIP_COPY = {
  intro: "The first hundred collectors get a free lifetime Collector Pro membership, no card required; a numbered Founding Collector badge nobody after No. 100 can get; and their name on the wall.",
  perks: [
    {
      title: "Lifetime Collector Pro membership",
      description: "Free for the lifetime of your ComixCatalog account and the ComixCatalog service. No card required.",
    },
    {
      title: "The badge",
      description: "A numbered Founding Collector badge nobody after No. 100 can get.",
    },
    {
      title: "Your name on the wall",
      description: "Your place in the Founding Collector roll of honor is yours for good.",
    },
  ],
};

export function membershipMenuLink({
  membershipTier,
  hasMembershipPass = false,
  salesOpen = MEMBERSHIP_SALES_OPEN,
} = {}) {
  const hasPaidMembership = membershipTier === "collector_plus";
  if (hasPaidMembership) {
    return { href: salesOpen ? "/upgrade" : "/account", label: "Manage membership" };
  }
  if (!salesOpen) return null;
  return hasMembershipPass
    ? { href: "/upgrade", label: "Manage membership" }
    : { href: "/upgrade", label: "Join Collector+" };
}

export function shouldShowMembershipUi({ isPro, isFounding, membershipTier } = {}) {
  return Boolean(isPro || isFounding || membershipTier === "collector_plus");
}
