// src/lib/launchFlags.js
//
// Single source of truth for launch-window promotional behavior. Flip the
// constants here when the launch promo ends and signups should go back to
// hitting the regular paywall.

// AUTO_PRO_AND_FOUNDING_ON_SIGNUP
// When true, every new signup (email/password + OAuth) gets is_pro=true
// and is_founding_collector=true at profile-create time. No Stripe payment
// required. Existing users are not affected by toggling this — flip
// individual rows in `profiles` if you need to retroactively change a
// user's tier.
//
// Why we have this: during the launch push, the marketing creative
// (homepage, OG image, paid posts) implies a fully-loaded product. If new
// signups land in a hobbled free tier they bounce. Once we have real
// active users + Stripe customers, set this to false so new accounts
// follow the normal Pro upsell funnel.
export const AUTO_PRO_AND_FOUNDING_ON_SIGNUP = true;

// Returns the profile fields that should be merged into the upsert payload
// when creating a new user's profiles row. Centralized so the two signup
// surfaces (signup page + OAuth callback) stay in lockstep.
export function launchProfileFlags() {
  if (!AUTO_PRO_AND_FOUNDING_ON_SIGNUP) return {};
  return {
    is_pro: true,
    is_founding_collector: true,
  };
}
