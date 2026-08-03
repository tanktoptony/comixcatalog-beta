# Phase 1 Pre-Launch Audit

> Page-by-page comparison of ComixCatalog against the Discogs reference in [NORTH_STAR.md](../../docs/north-star/NORTH_STAR.md).
> **Archived 2026-08-03:** Phase 1 is complete per CLAUDE.md. This audit's unchecked items are historical, not current blockers — see [archive README](./README.md).
> Each page lists: **Discogs equivalent**, **current state**, **gaps**, and **priority** (P1 = launch blocker, P2 = soon-after, P3 = later phase).
>
> Use this as a checklist. Cross items off as they're addressed. Add new gaps as you spot them.

---

## Homepage `/`

**Discogs equivalent:** discogs.com — top nav, search, hero carousel, "Best-Selling This Week" grid, editorial blocks.

**Current state:** Static landing with hero copy and feature blocks.

**Gaps:**
- [ ] **(P1)** Add a curated "Featured This Week" carousel — pull top 8 series by `issue_count_cached` with `featured_cover_path_cached`. Same data as `/search` no-query browse, just on the home page.
- [ ] **(P2)** "Most Collected" / "Recently Added" editorial blocks
- [ ] **(P2)** Stats strip: total issues in DB, total collectors, total covers — proof of content depth
- [ ] **(P3)** App store badges + mobile screenshot (when mobile lands)

---

## Search `/search`

**Discogs equivalent:** discogs.com/search — faceted filters left, results right, sort + view toggle top-right.

**Current state:** No-query browse shows curated featured series. Query mode shows series matches + comic results. Dynamic publisher pills + collection/wishlist filter.

**Gaps:**
- [ ] **(P1)** Filters left, results right (currently filter pills are inline above results) — Discogs's column layout is denser and more usable on long lists
- [ ] **(P2)** Sort dropdown (Trending / Most Collected / Year / Title) — currently no sort control on /search
- [ ] **(P2)** Card view toggle (grid vs list) — Discogs lets users switch
- [ ] **(P2)** Pagination controls (Prev / 1 2 3 ... 51 / Next) instead of "Load More" only
- [ ] **(P3)** "Search Marketplace" entry point on the page

---

## Series page `/series/[id]`

**Discogs equivalent:** discogs.com/master/<id> — hero cover, publisher, year span, issue grid, contributor sidebar, related releases.

**Current state:** Hero (featured cover + title + publisher + issue count + year range), sort dropdown, flat issue grid.

**Gaps:**
- [ ] **(P1)** Sidebar with: contributors who added issues, related series ("People who own this also own…")
- [ ] **(P2)** "Have / Want" counts above the issue grid — social proof, drives engagement
- [ ] **(P2)** Issue grid filterable by variant type, era, key-issue Y/N
- [ ] **(P2)** Show "key issues" badge on cards where applicable (data-dependent)
- [ ] **(P3)** Volume sibling navigation — needs a real `volume_group_id` column on `series`, populated during ingestion or by manual curation. (See conversation 2026-04-26: ILIKE-based attempt was rejected for being too loose / too strict.)
- [ ] **(P3)** Reviews / discussion tab

---

## Issue page `/issue/[id]`

**Discogs equivalent:** discogs.com/release/<id> — cover hero, "Have/Want" counts, marketplace listings strip, credits, variants, reviews.

**Current state:** Hero cover, title, issue #, publisher, year. Add to collection / wishlist actions. Prev / next issue nav.

**Gaps:**
- [ ] **(P1)** "Have / Want" counts shown prominently
- [ ] **(P2)** Marketplace strip: lowest, median, highest current price (dependent on Phase 4 marketplace, but can stub with placeholder)
- [ ] **(P2)** Credits panel (writer, artist, inker, letterer, editor) — depends on data ingestion
- [ ] **(P2)** Variants list — depends on variant data
- [ ] **(P3)** Key-issue facts ("First appearance of...")
- [ ] **(P3)** CGC pop report integration

---

## User-added comic page `/comic/[id]`

**Discogs equivalent:** Roughly a user-submitted release page, but Discogs vets contributions before publishing.

**Current state:** Renders title + cover + publisher for user-contributed comics.

**Gaps:**
- [ ] **(P1)** Surface "User Added" / "Pending Review" status clearly — these aren't canonical issues
- [ ] **(P1)** Run `node scripts/auditUserComics.js --apply` to remove unreferenced garbage rows so direct hits don't land on "Untitled #[nn]" pages
- [ ] **(P2)** Submission workflow: when a user-added comic matches an existing GCD issue, prompt to merge

---

## Library `/library`

**Discogs equivalent:** discogs.com/user/<name>/collection — tabbed view (Collection / Wantlist / For Sale / Drafts), bulk actions, list/grid toggle, faceted filters.

**Current state:** Tabbed (owned / wantlist / for_sale), search, publisher filter, sort, list/grid toggle, GradeEditor inline, PDF export (Pro-gated).

**Gaps:**
- [ ] **(P1)** Bulk actions: select multiple → batch edit grade / batch list-for-sale / batch delete
- [ ] **(P2)** Run-completion indicator per series ("11/15 owned")
- [ ] **(P2)** Duplicate detection
- [ ] **(P2)** Faceted filters (era, condition, slabbed/raw)

---

## Public profile `/u/[username]` ✅ v1 shipped

**Discogs equivalent:** discogs.com/user/<name> — hero, stats strip, tabbed body (Collection / Wantlist / For Sale / Activity), about sidebar.

**Current state:** Aligned. Hero, badges, stats strip, ProfileTabs, sidebar (About / Top Publishers / Get Started).

**Gaps:**
- [ ] **(P2)** Follow / followers counts in the stats strip
- [ ] **(P2)** "Lists" tab (curated lists user has made — depends on Lists feature)
- [ ] **(P3)** Run-completion widget in sidebar
- [ ] **(P3)** Verified-Collector badge wiring (CGC registry linkage)
- [ ] **(P3)** Reviews tab

---

## Upgrade / billing `/upgrade`

**Discogs equivalent:** discogs.com/settings — buyer/seller settings; Discogs doesn't have direct subscriptions, but the layout pattern is sidebar-driven multi-tab.

**Current state:** Stripe checkout scaffold for Collector Pro.

**Gaps:**
- [ ] **(P1)** Verify second-user Stripe flow works in test mode (was deferred from earlier session)
- [ ] **(P2)** Display tier comparison table (Free / Pro / Vault / Founding Collector)
- [ ] **(P2)** Founding Collector cap counter ("12 of 50 spots remaining")

---

## Auth pages `/login`, `/signup`, `/access`

**Discogs equivalent:** Standard auth flows, nothing distinctive.

**Current state:** Working flows.

**Gaps:**
- [ ] **(P2)** Tighten copy / errors against the brand voice in NORTH_STAR.md §2.5
- [ ] **(P2)** "Continue with Google / Apple" if not already supported

---

## Account settings `/account`

**Discogs equivalent:** discogs.com/settings — sidebar tabs: User / Notifications / Privacy / Collection / Applications / Developers / Buyer / Seller.

**Current state:** Single page with profile fields.

**Gaps:**
- [ ] **(P2)** Sidebar-driven multi-tab layout matching Discogs (User / Notifications / Privacy / Collection / Applications / Developers / Buyer / Seller / Labs)
- [ ] **(P2)** Notifications tab (toggles for wantlist hits, price drops, comments)
- [ ] **(P2)** Privacy tab (`is_public` toggle, search visibility)

---

## Collectors directory `/collectors`

**Discogs equivalent:** No exact match — Discogs has user search but no public directory.

**Current state:** Likely a scaffold listing public profiles.

**Gaps:**
- [ ] **(P2)** Decide whether this stays — Discogs doesn't have it, but it's a distinguishing feature for ComixCatalog community
- [ ] **(P2)** If it stays: filter by recent activity, top contributors, verified collectors

---

## Marketplace `/marketplace`

**Discogs equivalent:** discogs.com/sell — faceted filters, results table, ships-from, condition.

**Current state:** Likely a stub or coming-soon page (Phase 3 / 4 work).

**Gaps:** All Phase 3+ work, see NORTH_STAR §3.3.

---

## Blog `/blog`, `/blog/[slug]`

**Discogs equivalent:** discogs.com/digs — magazine-style content hub with Features / Essentials / Most Valuable / Collecting / Gear.

**Current state:** Basic blog with comments.

**Gaps:**
- [ ] **(P2)** Restructure as "Reads" matching NORTH_STAR §3.6 — landing with Features / Essentials / Most Valuable & Best Selling / Collecting / Gear sections
- [ ] **(P2)** Author bylines, publish dates, reading time
- [ ] **(P3)** Article categories + filters

---

## Cross-cutting concerns

### Header / nav
- [ ] **(P1)** Header search bar — currently exists; verify it points at `/search?q=…`
- [ ] **(P2)** Add notification bell with count badge (wantlist hits, etc.) — depends on Phase 3
- [ ] **(P2)** Cart icon (depends on marketplace)
- [ ] **(P2)** Mail / messages icon (depends on community phase)

### Footer
- [ ] **(P1)** Build out the four-column footer per NORTH_STAR §3.9: About / Community / Help & Resources / Social. Most pages don't render a real footer yet.

### Visual consistency
- [ ] **(P1)** Walk every page and confirm tokens match NORTH_STAR §2.1 (gold accent, navy background, surface elevation)
- [ ] **(P1)** Confirm typography rules from §2.2 (uppercase section labels, large bold numbers as content, count pills on tabs)
- [ ] **(P1)** No inline-styled layout that fights the design system — convert lingering inline styles to className-based rules in [globals.css](../../src/app/globals.css)

### Performance / data
- [ ] **(P1)** Run `node scripts/auditUserComics.js --apply` to remove garbage user-added rows
- [ ] **(P1)** Run `node scripts/fixupFeaturedCovers.js --apply` to NULL bad cover assignments
- [ ] **(P2)** Switch search ILIKE to full-text search (tsvector + GIN) on `series.title` and `comics.series_title` — significant perf win at 217k rows
- [ ] **(P2)** Add proper indexes on hot columns: `user_collections(user_id, status)`, `comics(created_by)`, `comic_covers(comic_id, is_primary)`

---

## Sign-off

When every **(P1)** item above is checked, Phase 1 is done.

P2 items roll into Phase 2 (Revenue Engine) where they don't conflict with the Grading UI / PDF Report / Stripe Pro launch.
