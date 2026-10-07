# ComixCatalog: Decisions

**Status:** living log, ADR-lite · **Started:** 2026-10-05
Add new decisions at the bottom. Don't edit an old one to reverse it; add a new entry that supersedes it and change the old one's status. If the reason isn't known, write "Rationale not documented."

---

## Decision: Next.js App Router on Vercel with Supabase

Status: Active
Date: Unknown
Decision: The whole product is one Next.js app (App Router, JavaScript, no TypeScript) deployed on Vercel, backed by Supabase Postgres, Auth and Storage. Server logic lives in route handlers; there is no separate backend.
Reason: Rationale not documented.
Consequences: Schema, RLS and storage are managed in the Supabase dashboard. Long-running jobs run in GitHub Actions, not on Vercel.

## Decision: GCD is the metadata source of truth

Status: Active
Date: Unknown (bulk import predates the repo history)
Decision: Series, issue, publisher and date metadata come from the Grand Comics Database, mirrored into `gcd_*` tables. `gcd_issues.gcd_id` is the canonical issue id.
Reason: Rationale not documented beyond GCD being the most complete open comics index.
Consequences: GCD's CC BY-SA license rules out reselling the data. The mirror goes stale and needs API top-ups. GCD ids appear in user data, URLs and listings, so they can't be renumbered.

## Decision: ComicVine for covers only

Status: Active
Date: Unknown (before May 2026)
Decision: ComicVine supplies cover and variant images. It is not a metadata source.
Reason: GCD's image host is behind Cloudflare and blocks scripted access (confirmed 2026-05-19). ComicVine has an API with images.
Consequences: Covers must be linked to GCD issues by matching, which is the source of most data-quality bugs. Throughput is capped by ComicVine's free tier.

## Decision: Covers are copied into Supabase Storage

Status: Active
Date: Unknown; thumbs added 2026-10-01
Decision: Every cover is downloaded and stored in `canonical-covers`, with a 400px WebP in `cover-thumbs`. The app never hotlinks ComicVine.
Reason: Rationale for copying not documented. Thumbs: a single search page loaded 127 MB of originals.
Consequences: Storage is a plan limit (hit 150 GB on a 100 GB plan, 2026-10-01). Originals are capped at 1600px and over-1 MB files re-encoded.

## Decision: No wrong-cover fallback

Status: Active
Date: 2026-08-04/05
Decision: If an issue has no confidently matched cover, show none. Never substitute another issue's cover from the same series.
Reason: The fallback displayed plausible but wrong art (Thor #440 to #479). The founder ruled that an honest blank beats a confident wrong cover.
Consequences: Visible gaps on series pages until ingest fills them. Every cover path must end in "no cover," not a guess.

## Decision: Cached, year-aware publisher resolution

Status: Active
Date: May 2026
Decision: Publisher is resolved once per series (pre-2000 trusts GCD indicia, later trusts ComicVine), stored in `series.resolved_publisher_cached`, and pinned for key series in `SERIES_OVERRIDES`. Request-time code reads the cache.
Reason: Both raw publisher fields are corrupt in places; re-resolving per request produced regressions ("1984 TMNT shows IDW").
Consequences: Publisher fixes need a cache refresh to show up.

## Decision: US publisher allowlist for search and browse

Status: Active
Date: May 2026
Decision: Search and browse show only series from about 45 US publishers (`US_PUBLISHER_ALLOWLIST`).
Reason: Most of GCD's 2.5M issues are foreign reprints and editions nobody searches for here.
Consequences: Non-US series are reachable by direct URL only. Coverage is measured against the allowlisted corpus.

## Decision: Client session in localStorage; API identity by Bearer token

Status: Active, cookie-based SSR auth deferred
Date: Fixed 2026-09 (server client rewrite)
Decision: The browser keeps the Supabase session in localStorage. API routes identify callers only through `Authorization: Bearer` validated by `getAuthedUser()`. Client-supplied user ids are never trusted.
Reason: The earlier server client read a cookie nothing ever set, so server-side identity silently failed.
Consequences: Server components don't know the user. A move to `@supabase/ssr` cookies is deferred but tracked.

## Decision: Service-role clients in API routes

Status: Active
Date: Unknown
Decision: Most route handlers use the service-role key and do their own authorization.
Reason: Rationale not documented.
Consequences: RLS doesn't protect anything a route reads or writes. Every new route must check identity and ownership itself.

## Decision: Single hardcoded admin

Status: Active
Date: Unknown
Decision: Admin is one user id in `src/lib/admin.js`. Admin counts as Pro by id, not by `is_pro`.
Reason: Solo founder. Rationale for not using a role column not documented.
Consequences: Adding a second admin is a code change.

## Decision: Billing columns are server-only

Status: Active
Date: 2026-10-05 (PR #197, migrations 0032a/0032b)
Decision: Only the service role may change `is_pro`, `is_founding_collector` or `stripe_customer_id`. Browsers can't read `stripe_customer_id`.
Reason: The profile update policy had no column limit; any signed-in user could grant themselves Pro.
Consequences: Browser code must select explicit `profiles` columns. New `profiles` columns must be added to 0032b's grant list to be readable.

## Decision: Founding pass is server-granted and capped at 100

Status: Active
Date: 2026-09-24
Decision: New accounts get lifetime Pro and the Founding badge only by asking `/api/founding/status`, which counts claims and stops at 100.
Reason: The client used to stamp its own flags, so the cap was never enforced and no one could ever reach checkout.
Consequences: Revenue starts only after 100 passes are gone or the flag `AUTO_PRO_AND_FOUNDING_ON_SIGNUP` is turned off.

## Decision: Pro features enforced in the database for grading

Status: Superseded on 2026-10-07
Date: Unknown (migration 0008)
Decision: Trigger `enforce_pro_for_grading` blocks grade, slab and photo fields for non-Pro users.
Reason: Rationale not documented beyond keeping the paywall honest against direct browser writes.
Consequences: Its service-role bypass never worked (uses `current_user` inside `SECURITY DEFINER`). Fix planned with `auth.role()`.

## 2026-10-07: Paywall only what competitors don't have

Decision: Grading, per-copy photos, PDF and CSV exports, value history, duplicate
and missing-issue tools, imports, cover scanning, and catalog linking are free for
every signed-in collector. League of Comic Geeks and CLZ already offer these
capabilities, so ComixCatalog competes on trust and collector ownership instead
of charging for parity. Collector Pro is a supporter badge, with house upgrade
prompts hidden, until unique paid features ship.

## Decision: One `user_collections` table for owned, wanted and for-sale

Status: Active, being revised
Date: Unknown; multi-copy approved 2026-10-05
Decision: Every collection entry is a row with `status` in `owned | wishlist | for_sale`, pointing at exactly one of `gcd_issue_id` or `comic_id`. `for_sale` counts as owned.
Reason: Rationale not documented.
Consequences: A unique index made multiple copies and owned+wanted impossible. Founder approved multi-copy (2026-10-05); splitting wants into their own table is a later design note.

## Decision: Marketplace listings created by trigger from the library

Status: Active
Date: 2026-10-01 (migration 0031)
Decision: Listings are their own table, but the library still lists by setting `status = 'for_sale'`; a trigger creates or withdraws the listing. Users have no write policies on `listings`.
Reason: Keep the v1 library UX working while giving listings their own model.
Consequences: Snapshot fields that need JS (cover, publisher label) are filled afterward by `refreshListingSnapshots()`. Trigger errors are swallowed so a marketplace bug can't block a library edit.

## Decision: No fees and no checkout during the marketplace beta

Status: Active
Date: 2026-10-01
Decision: Buyers contact sellers by message; nothing is charged.
Reason: Ship the listing side first; payments need the v2 safety work.
Consequences: Public copy promises no fees. Changing that needs copy and Terms updates.

## Decision: Valuation from eBay; label the source

Status: Active
Date: May 2026 (GoCollect dropped); labels by 2026-08-03
Decision: Values come from eBay comps via `valueFromComps()`. Asking-price rows are `source = 'ebay-listed'` and shown as "asking"; sold rows would be `'ebay'`.
Reason: GoCollect never responded. eBay Browse returns only active listings; Marketplace Insights (sold) needs approval that hasn't come.
Consequences: Current values are asking prices and skew high. Copy must not call them sales.

## Decision: Migrations applied by hand

Status: Active
Date: Unknown
Decision: SQL files go in `scripts/migrations/`; the founder runs them in the Supabase SQL editor before dependent code merges.
Reason: No DB password or DDL-capable connection is available to agents or CI (verified 2026-09-18).
Consequences: The repo's schema record is incomplete. Agents paste SQL inline for the founder to run.

## Decision: Automation in GitHub Actions, state committed to git

Status: Active; moving state out is parked
Date: Unknown
Decision: Ingest, cache refresh, gap generation, comps, snapshots and social posts run as scheduled Actions that commit their state files to `main`.
Reason: Rationale not documented.
Consequences: Most commits are bots. Actions schedules are unreliable, hence `cron-watchdog.yml`.

## Decision: Branch, PR, CI; founder merges

Status: Active
Date: 2026-08-04; auto-merge off confirmed 2026-10-05
Decision: Non-trivial work goes on a branch in its own git worktree, through `pr-ci.yml`, merged by the founder (or by Claude after the founder approves). No auto-merge, no branch protection.
Reason: Concurrent AI sessions committing straight to `main` caused a near miss on 2026-08-03.
Consequences: Use `git worktree add`, not just a branch. Base on `origin/main`.

## Decision: No AI attribution in commits or PRs

Status: Active
Date: Unknown
Decision: No "Generated with Claude" lines or Co-Authored-By AI trailers.
Reason: Founder preference.
Consequences: Overrides tool defaults.

## Decision: Internal Discogs model, external comic-shop framing

Status: Active
Date: 2026-09-13
Decision: Discogs answers "should this capability exist." "The comic shop that belongs to you" answers how it's named and explained to users.
Reason: Visitors had to translate the Discogs comparison before they cared.
Consequences: User-facing copy goes through NORTH_STAR §1.2.
