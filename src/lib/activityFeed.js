// Who may appear in the public activity feed, and what each row says.
//
// /api/activity reads the newest user_collections rows with the service
// role, which bypasses RLS, so this filter is the only thing keeping a
// private library off the homepage. Before it existed the feed showed every
// account's adds, including private profiles and hidden wantlists, and
// labelled anything that wasn't "owned" as "wishlisted" (audit S3,
// 2026-10-05).
//
// is_public must be explicitly true. The show_* flags follow the marketplace
// view's convention: a missing or null flag counts as shown; only false hides.

export const ACTIVITY_VERB = {
  owned: "added",
  wishlist: "wishlisted",
  for_sale: "listed",
};

// Which profile flag hides which kind of row, on top of show_collection.
const STATUS_FLAG = {
  wishlist: "show_wantlist",
  for_sale: "show_for_sale",
};

export function isVisibleActivity(row, profile) {
  if (!row || !profile) return false;
  if (!ACTIVITY_VERB[row.status]) return false;
  if (!profile.username) return false;
  // Public means explicitly true, matching the RLS policy and /api/public-profile.
  if (profile.is_public !== true) return false;
  if (profile.show_collection === false) return false;
  const flag = STATUS_FLAG[row.status];
  if (flag && profile[flag] === false) return false;
  return true;
}

// rows: user_collections rows, newest first. profilesById: Map or object of
// profile rows keyed by id. Returns at most `limit` visible rows, each with
// a `verb` for display.
export function filterVisibleActivity(rows, profilesById, limit = 20) {
  const get = (id) =>
    profilesById instanceof Map ? profilesById.get(String(id)) : profilesById?.[String(id)];
  const out = [];
  for (const row of rows ?? []) {
    if (out.length >= limit) break;
    if (!isVisibleActivity(row, get(row.user_id))) continue;
    out.push({ ...row, verb: ACTIVITY_VERB[row.status] });
  }
  return out;
}
