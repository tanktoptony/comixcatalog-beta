# Instagram funnel: adversarial audit

Branch `agent/ig-funnel`, 2026-09-30. A separate reviewer agent was told to assume the implementation was flawed and look for reasons not to ship it. This file records its findings, what was done about each one, and how each fix was checked.

**Result:** 0 BLOCKER, 3 HIGH, 5 MEDIUM, 7 LOW. All HIGH findings are fixed and retested. Every MEDIUM is fixed or partly fixed; the unfixed parts have a stated reason. Two LOW findings are left open, also with reasons.

## HIGH

### H1. Activation events lost Instagram attribution after email confirmation (fixed)

**Problem.** Attribution lived only in the signup browser's localStorage. A visitor who signs up inside Instagram's in-app browser usually confirms from their mail app, which opens Safari or Chrome with empty storage. `first_collection_add` then went out with no `attr_*` params. The data was already on `user_metadata.signup_attribution`, but nothing read it back.

**Fix.** `seedAttribution()` in `src/lib/attribution.js` is called from `/auth/callback`. It restores the account's attribution into the confirming browser, never overwrites a fresh first touch, and re-validates the value, because `user_metadata` is user-writable.

**Retest.** Three new tests in `attribution.test.js`: restore in a fresh browser, no overwrite, and tampered or expired metadata rejected. 11/11 pass.

### H2. Long display names pushed the URL and @username off the share card (fixed)

**Problem.** The title was sized by string length and Satori wrapped it. A 60-character name ran to five lines and the footer fell off the canvas.

**Fix.** In `templates.js`:
- a display name longer than 16 characters falls back to the username (20 characters max);
- the title size comes from an estimated width, with `nowrap` and ellipsis as a backstop;
- the footer is in normal flow with `flexShrink: 0`.

**Retest.** Rendered a 20-character username with 4 publisher rows and 3 covers, a normal name, and a card with no covers. All fit on one title line, and the footer stays inside the Story safe zone.

### H3. The header "Create account" on /start skipped the funnel (fixed)

**Problem.** The header link went to bare `/signup`, so a new account landed on an empty profile. The click also wasn't tracked.

**Fix.** On `/start` only, the header CTA uses `SIGNUP_HREF` (`/signup?next=/library`) and carries the `data-start-cta` attributes. Every other page is unchanged.

**Retest.** The built `/start` HTML shows all three signup links pointing to `/signup?next=%2Flibrary`.

## MEDIUM

### M1. No og:image on /start, and the Twitter tags carried the root's marketplace copy (fixed)

`/start` metadata now sets its own `openGraph` (type, siteName, image) and `twitter` (card, title, description, image). Verified in the built HTML.

### M2. OnboardingModal covered the first-run library right after signup (fixed)

The modal no longer auto-opens on `/library` or `/search` while the collection is empty or still loading. Everywhere else it behaves as before, and it still appears once the collector owns a book.

### M3. Share card was slow (about 7s) and unthrottled (partly fixed)

**Fixed:**
- Cover lookups run in parallel.
- Covers come through Supabase's image transform at 512×768 (about 130KB instead of up to 1.7MB), embedded as data URIs.
- The shadow blur was removed.

Warm render dropped from about 7–8s to about 2.3–2.9s: load about 1.3–1.6s, render about 0.8–1.1s, measured on the dev server.

**Not fixed: per-user throttle.** The route is auth-only, and each call costs a few small queries and up to 5 image fetches. Revisit if abuse ever shows up.

**Cost note.** Supabase image transforms are metered per source image.

**Side finding.** Using our own `sharp` 0.35 clashed with Next's bundled sharp 0.34 in the same process. It broke the `/opengraph-image` prerender once and made card renders return 500 under local `next start` on Windows. `sharp` was removed from this route entirely.

### M4. first_collection_add could fire falsely and was missed on some add paths (partly fixed)

**Fixed:** a failed library load no longer counts as an empty library (`!loadError` guard).

**Not fixed:** CSV import and `addAnotherCopy` still don't fire it. CSV import goes through a server route, and an event fired from there would bypass the client GA setup. Activation for CSV importers can still be read from `collection_add` or from the database.

### M5. "Slab" was claimed under a Free CTA but is Pro-only (fixed)

The benefit copy now says "its grade and what you paid".

## LOW

### Fixed

- **L1.** StartTracker lost its click listener under React Strict Mode (dev only). The listener now attaches on every effect run, and only `start_view` is guarded by the ref.
- **L2.** The CTA had an em dash, against the house style. It now reads "Start Your Collection for Free".
- **L3.** Series whose publisher is the literal string "Unknown Publisher" (about half of all series) showed as a publisher bar. That value is now treated as unknown and folds into "Other".
- **L4.** A dead cover path showed as an empty white frame. Covers are now downloaded before render, and failures are dropped.
- **L5.** The dialog showed a stale card after adding books. It now regenerates on every open.
- **L6.** "Share my collection" and "Share my collection card" sat side by side with near-identical labels. The new button reads "📸 Make a Story card".
- **L7.** The "Log in" link on /signup dropped `?next`. It now carries it through.

### Open

- **Share-card pagination over 1,000 rows is untested on real data.** The largest real collection is 353 rows. The loader pages every query in chunks, the same pattern used elsewhere.
- **Instagram in-app browser behavior is unverified.** This covers Web Share with files, the `download` attribute on blob URLs, and `navigator.clipboard`. No device was available. Fallbacks exist: a long-press hint, and the invite link shown in the error text. See the manual QA below.

## Checked and found fine by the reviewer

- **Share-card API guards.** Unauthenticated and garbage-token requests get 401. `type=__proto__` is safe. The user id comes only from the verified token, so there is no way to request another user's card. The response is `private, no-store`, and no collection value appears on any card.
- **safeNextPath.** Rejects `//`, `/\`, control characters, and paths without a leading slash. The /login change preserves its behavior.
- **Attribution input.** Values are sanitised to slugs. `ref` must match the username regex. GA never receives a username.
- **Loader counts.** They match exact database counts for the 3 largest real collections.
- **CJK and emoji names** render.
- **Existing routes.** `/`, `/search`, `/library`, `/login?next=`, `/collectors`, issue pages, and a real profile all return 200.

## Manual QA still required before merge

These can't be automated from this environment. Run them on the Vercel preview deployment for the PR.

1. **Share card on Vercel.** Sign in on the preview, open /library, tap "📸 Make a Story card", and confirm the PNG renders. This is required: rendering could only be verified in dev mode here, because of the Windows sharp clash above. Production runs Linux, and the static `/opengraph-image` already uses the same `next/og` path there.
2. **The full funnel on a phone, inside Instagram.**
   1. Put the preview's `/start?utm_source=instagram&utm_medium=social&utm_campaign=profile` link in an IG DM to yourself and open it inside Instagram.
   2. Tap Start Your Collection for Free and sign up with a test email.
   3. Confirm from the mail app.
   4. You should land on /library's first-run screen, with no modal on top.
   5. Search X-Men and add an issue.
   6. Open /library and tap Make a Story card.
   7. Try both Share and Save.
3. **GA DebugView.** Confirm `start_view`, `start_cta_click`, `signup_started`, `signup_completed`, and `first_collection_add` arrive with `attr_source=instagram`. Register `attr_source`, `attr_medium`, and `attr_campaign` as event-scoped custom dimensions in GA4 Admin, or they won't appear in reports.
