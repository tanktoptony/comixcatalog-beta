"use client";

// Event inventory (keep this current — it is the only place the names live
// together). GA4 reports on these; nothing here is a source of truth for
// absolute counts because trackEvent no-ops under ad blockers.
//
// Pre-signup funnel (anonymous visitors, the growth question):
//   cta_click            { location }                       home page CTAs
//   search               { search_term, result_count, logged_in }  GA4 recommended name
//   search_result_click  { result_type, result_id, search_term, position }
//   series_view          { series_id, series_title, publisher, logged_in }
//   issue_view           { issue_id, series_id, series_title, issue_number, logged_in }
//   signup_started       { next }        first interaction with the signup form
//   signup_error         { reason }      validation or Supabase failure on submit
//   house_ad_view        { position, campaign, logged_in }  <AdSlot /> mounted
//   house_ad_click       { position, campaign, logged_in }  its link clicked
//   newsletter_subscribed { source }   NewsletterSignup succeeded (footer / page / ...)
//
// Instagram funnel (/start, see src/lib/attribution.js). attr_* params are
// first-touch utm values; register attr_source/attr_medium/attr_campaign as
// GA4 custom dimensions or they will not show in reports.
//   start_view           { attr_* }                          /start loaded
//   start_cta_click      { cta, location, attr_* }          cta: start_collection | search | go_to_library
//   signup_started / signup_completed also carry attr_*
//   first_collection_add { attr_* }   first owned book on the account (activation)
//   first_wantlist_add   { attr_* }   first wantlist book on the account
//   share_card_generated { card_type }
//   share_card_action    { card_type, method }   method: share_sheet | download | copy_invite_link
//
// Post-signup (existing users):
//   signup_completed, pro_upgrade, pdf_export, grade_set, collection_add

// Thin wrapper around gtag's event API. GA itself is loaded conditionally
// (production only — see src/app/layout.js), so this guards against gtag
// not existing at all (local dev, ad blockers, GA still loading).
export function trackEvent(name, params = {}) {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}
