# ComixCatalog North Star — Design Standard & Sitemap

> Aspirational. This document anchors what ComixCatalog should look like, feel like, and *do* once it's mature.
> Source of truth: **Discogs** (discogs.com), captured 2026-04-26. Screenshots saved to `docs/north-star/discogs-reference/`.
>
> **Use this doc:** before adding a major feature, check whether Discogs has a parallel for it and how they solve it. Match their information density, their navigation grammar, and their collector-first tone — adapted for comics.
>
> Pair this with [CLAUDE.md](../../CLAUDE.md), which is the engineering brief. CLAUDE.md = "what we are now." NORTH_STAR.md = "what we're aiming at."

---

## 1. The One-Sentence Truth

> **ComixCatalog is what Discogs is for music, but for comic books.**

When in doubt about a feature, ask: *does Discogs do this, and does it make sense for comics?* If yes — build it. If they don't, think hard about whether it belongs.

### 1.1 Competitive references

**Primary reference: Discogs.** Music collectors' platform. Database + collection manager + peer marketplace, all in one. The standard we're trying to meet on UX and information density.

**Closest comics-space competitor: [mycomicshop.com](https://www.mycomicshop.com).** A long-running comics retailer that does much of what we're building — searchable database, want-list tracking with email alerts, marketplace, customer collection records — but **clunkily**. The site reads as a 2010-era retail catalog: dense tables, retailer-led layout, dated typography, no real collector identity layer (no public profiles in the Discogs sense), no slab-grade-first UX, no portfolio-style value tracking. They prove the demand exists; their UX shows the gap we're filling.

**What ComixCatalog does differently from mycomicshop:**
- **Collector identity first.** Public profiles at `/u/<username>` with badges, stats, and shareable collection — mycomicshop has none of this.
- **Slab-grade native.** CGC/CBCS cert numbers, slabbed-vs-raw distinctions, verified-grade marketplace badges baked in, not bolted on.
- **Portfolio over time.** Value-tracking charts, run-completion stats, want-list price alerts as first-class features.
- **Modern visual standard.** Discogs-density navigation, dark theme, grid-first browsing, mobile-respectful.
- **Marketplace as peer-to-peer.** mycomicshop sells *to* collectors. We let collectors transact *with* collectors and take a smaller cut.

When evaluating a feature, also check: *would this make ComixCatalog feel less like mycomicshop and more like Discogs?*

---

## 2. Visual Design Standard

### 2.1 Brand surface
| Token | Value | Notes |
|---|---|---|
| Primary background | `#0b1230` (deep navy) | Discogs uses near-black; we lean navy for warmth |
| Accent / "value" color | `#F4D03F` (gold) | Used for value, badges, active tab markers, key numbers |
| Surface / card | `rgba(17, 24, 39, 0.7)` | Subtle elevation over background |
| Border | `rgba(255,255,255,0.08)` | Hairline, never heavy |
| Text primary | `#fff` | |
| Text secondary | `rgba(255,255,255,0.65)` | Use for labels, meta, supporting copy |
| Text dim | `rgba(255,255,255,0.45)` | Counts, timestamps, helper text |

### 2.2 Typography rules (from Discogs observation)
- **Page titles**: large, light weight, never all-caps. Discogs uses ~32–40px regular weight.
- **Section labels**: ~12px, uppercase, letter-spacing 0.1em, opacity 0.7. We already use this on profile sidebar.
- **Numbers as content**: when a number IS the content (collection size, value, count), it should be **large and bold** with a small uppercase label underneath. Discogs leans on this hard.
- **Counts in tab pills**: small rounded pills next to tab labels, e.g. `Owned (47)` styled as `Owned [ 47 ]`.

### 2.3 Layout grammar
- **Card grid + sidebar** is the dominant pattern. Main column is the data; right sidebar is metadata, related links, "about this collector", recommendations.
- **Sticky filters left, content right** for any browse/search page.
- **Horizontal carousel** for "best-selling this week," "most valuable," editorial picks. Always with `‹ ›` chevron controls.
- **Tabs over sub-pages** when multiple views of the same dataset (Owned / Wantlist / For Sale on profile is the canonical example).

### 2.4 Imagery
- **Cover thumbnail is the primary visual unit.** Aspect ratio respected (3:4 for comics, square for music — we keep 3:4).
- Album/cover grids have *no* heavy borders — the cover IS the card. Title + meta sit underneath in plain type.
- Hover states subtle: slight lift (`translateY(-2px)`) + faint shadow. Never colored borders.

### 2.5 Tone & copy
- **Collector-first, never marketer-first.** Discogs never shouts "Buy now!" — it shows pricing, quantities, conditions, and trusts the user.
- Use domain vocabulary correctly: variant, slabbed, raw, key issue, run, story arc, newsstand, direct edition, grade, cert. (See CLAUDE.md domain vocab.)
- Neutral verbs: "Add to collection," "Add to wantlist," "List for sale." Never "Get yours now!"

---

## 3. Sitemap (Aspirational, Discogs-mirrored)

This is the eventual nav structure. Items marked **(P1)** = needed before public launch. **(P2)** = revenue-engine phase. **(P3+)** = scale phase.

### 3.1 Top-level navbar (always visible)

```
[ COMIXCATALOG ]    [ search bar — full width ]    [ icons: dashboard, library, wishlist, cart, mail, notifications, avatar ]
```

Below that, a **secondary nav row** with dropdowns:

```
Explore Database  ▾    Shop Comics  ▾    Sell Comics  ▾    Community  ▾                                      Reads ▾
```

### 3.2 Explore Database ▾ (P1)
*(Discogs equivalent: "Explore Discography")*
- **Explore All** — top-level browse (publishers, decades, genres)
- **Advanced Search** — multi-field search (title, writer, artist, year, publisher, catalog #, story arc)
- **Most Collected** — what ComixCatalog users own most of
- **Submit a Comic** — user contributions to the database (P2, gated to verified)
- **Submission Guidelines** — rules for contributions

### 3.3 Shop Comics ▾ (P3 — marketplace)
*(Discogs equivalent: "Shop Music")*
- **Shop My Wantlist** — items from your wantlist that are now for sale (huge engagement loop)
- **New & Upcoming** — pre-orders, just-released, this week's drops
- **Slabbed (CGC/CBCS/PGX)** — graded copies for sale
- **Raw** — ungraded copies
- **Key Issues** — first appearances, deaths, origins
- **All Formats** — full marketplace browse

### 3.4 Sell Comics ▾ (P3)
*(Discogs equivalent: "Sell Music")*
- **List a Comic For Sale**
- **Start Selling** — onboarding wizard
- **How to Grade** — full guide article (defensible content moat)
- **How to Price** — pricing data + suggestions
- **How to Pack & Ship** — bagged & boarded, gemini mailer guidance, slab shipping
- **More Seller Resources**
- **Seller News & Updates** — release notes for sellers

### 3.5 Community ▾ (P2)
*(Discogs equivalent: "Community")*
- **Forum** — categories: General, Database, Marketplace, App, Development, API
- **Groups** — user-created interest groups (e.g. "Bronze Age Marvel," "CGC Census Watchers")
- **Lists** — collector-curated lists (e.g. "Top 10 Spider-Man Keys," "Bronze Age Horror Must-Owns")
- **Database Contributors** — leaderboard of users who add comics/data
- **Monthly Leaderboard** — top contributors that month
- **Community Guidelines**

### 3.6 Reads ▾ (P2 — content/SEO play)
*(Discogs equivalent: "Digs" magazine)*
- **Reads Home** — magazine landing
- **Features** — long-form articles ("Why Bronze Age Horror Got Hot Again")
- **Essentials** — beginner guides ("Starting a Spider-Man collection")
- **Most Valuable & Best Selling** — monthly recap of top sales
- **Collecting** — how-tos (storage, grading prep, displaying slabs)
- **Gear** — bags & boards, mylar comparisons, slab cases, lightboxes
- **Search Articles**
- **Selects** — editor picks

This section is HUGE for SEO and is where Discogs builds authority. Don't skip it.

### 3.7 User dropdown (avatar in upper right)
Two columns:

**Buy/Browse**
- Shop My Wantlist
- Purchases (order history)
- Cart

**Account**
- Dashboard (the personalized home)
- Messages (buyer↔seller, comments)
- Collection
- Wantlist
- Lists (your curated lists)
- Friends / Following
- Settings
- Help
- Log Out

**Sell** (visible if seller-enabled)
- My Storefront
- Inventory
- Orders
- List Item for Sale

**Contribute** (visible if contributor-enabled)
- Submissions
- Drafts

### 3.8 Notifications panel (bell icon)
Discogs surfaces:
- "New wantlist items for sale" (with cover thumb, seller, price)
- "In Case You Missed It" (similar items based on history)
- Forum/messages mentions

For us:
- "An issue from your wantlist just got listed"
- "Price drop on a wantlist item"
- "New comment on your listing"
- "New issue added to a series you own >5 of" (run completion nudge)
- "Forum reply"

### 3.9 Footer (P1, build once)

| About | Community | Help & Resources | Social / Newsletter |
|---|---|---|---|
| Get Started | Community Guidelines | Help Center | (social icons) |
| What is ComixCatalog | Community Advisory | Seller Resource Center | Email signup |
| Database | Contributor List | Submission Guidelines | App store badges (P3) |
| Marketplace | Add Comic | Trust Center | |
| Collection | Developer API | Forum | |
| Wantlist | Help Translate | System Status | |
| Statistics | | Keyboard Shortcuts | |
| Careers | | | |

---

## 4. Page-Type Catalog

### 4.1 Public profile `/u/[username]` ✅ v1 shipped
Already aligned to Discogs pattern. See [src/app/u/[username]/page.js](../../src/app/u/[username]/page.js) and [ProfileTabs.js](../../src/components/ProfileTabs.js).

**Future iterations:**
- Follower/following counts in stats strip
- "Lists" tab (curated lists user has made)
- "Reviews" tab (P3)
- Run-completion widget in sidebar (e.g. "Owns 11/15 Uncanny X-Men keys")
- Verified Collector badge slot (CGC registry linkage)

### 4.2 Series page `/series/[id]` (partly built)
Discogs equivalent: "master release" page.
- Hero: featured cover, title, publisher, year span, issue count
- Issue grid: every issue with cover + number + year
- Filters: variant type, year, era
- Sidebar: contributor list, related series, "people who own this also own…"
- Tabs: Issues / Variants / Story Arcs / Reviews (P3)

### 4.3 Issue page `/issue/[id]` (built)
Discogs equivalent: "release" page.
- Hero: large cover, title, issue #, publisher, release date, key-issue indicator
- "Have / Want" counts (Discogs surfaces these as social proof)
- Marketplace strip: lowest, median, highest current listing price
- Sidebar: variants, related issues (next/prev), credits (writer/artist), key facts ("First app of…"), CGC pop report (P3)
- Reviews / discussion (P3)

### 4.4 Search results `/search` (built)
Discogs pattern is gold: faceted filters left, results right, sort + view-mode top-right.
- Filters: Publisher, Era/Decade, Format (slab/raw/digital), Country, Genre, Key issue Y/N
- Results: card grid OR list view (toggle)
- Sort: Trending / Most Collected / Price / Year / Title

### 4.5 Library `/library` (built, ongoing polish)
The collector's home. Already supports list/grid, grading editor, PDF export.
**Aspirational adds:**
- Tabs at top (Owned / Wantlist / For Sale / Drafts) — already partly there
- Bulk actions (batch grade entry, batch list-for-sale)
- "Run completion" indicator per series

### 4.6 Marketplace browse `/shop` (P3, doesn't exist yet)
Discogs marketplace pattern:
- Faceted filters: format, condition, ships-from, currency, price range, seller rating
- Result rows: cover, title, condition labels (media/sleeve/slab grade), seller + rating, price + shipping
- "Add to Cart" inline
- Per-row "Has X items I want" callout when seller has multiple wantlist hits

### 4.7 Cart / Checkout `/cart` (P3)
Discogs has a clean empty state ("Shop for Vinyl, CDs… Start Shopping" CTA). We'd mirror that.

### 4.8 Order history / Purchases `/purchases` (P3)
Table view: Order # / Summary / Seller (with rating) / Total / Date / Status. Status uses iconography: 📦 Shipped, 🚫 Cancelled, ✅ Delivered.

### 4.9 Settings `/settings/*` (P2)
Sidebar-driven multi-tab: User / Notifications / Privacy / Collection / Applications / Developers / Buyer / Seller / Labs.

### 4.10 Seller onboarding (P3)
Discogs gates selling behind a clear modal: hobby vs business, full name, address, payment connection (PayPal/Stripe), currency, policy agreement. Mirror exactly — it sets expectation that selling is a real commitment.

### 4.11 Forum / Groups / Lists (P2)
Standard threaded forum with thread/reply count, last activity timestamp. Lists are user-curated collections of items — like Spotify playlists for collectors.

### 4.12 Database Contributors leaderboard (P2)
Ranked table: Username / Points / (avatar). Drives database-completion gamification.

### 4.13 Monthly Leaderboard (P2)
Same idea but month-scoped, sidebar shows "Latest Submissions" stream.

---

## 5. Functionality Catalog

These are first-class capabilities ComixCatalog must eventually support:

### 5.1 Database / catalog (P1 → P2)
- ✅ Series + issue records
- ✅ Publisher resolution
- ✅ Cover images (canonical via ComicVine)
- ⬜ User-submitted comics (already partially built via `comics` + `comic_covers`)
- ⬜ Variant tracking (cover A/B/C, newsstand vs direct, sketch covers)
- ⬜ Story arc / story line records
- ⬜ Credit records (writer, artist, inker, colorist, letterer, editor)
- ⬜ Key-issue flagging
- ⬜ Submission workflow + voting (Discogs has "Needs vote" / "Needs changes")

### 5.2 Collection management (P1 ✅)
- ✅ Add to collection / wantlist
- ✅ Per-item grading (grade_numeric, slab_company, slab_cert_number)
- ✅ Per-item notes
- ✅ Per-item purchase price + market value
- ⬜ User-uploaded cover image per copy (column migration pending)
- ⬜ Bulk import via CSV
- ⬜ Bulk export (PDF ✅, CSV ⬜)
- ⬜ Run-completion view ("you own 11/15")
- ⬜ Duplicate detection

### 5.3 Marketplace (P3)
- ⬜ List for sale (price, condition, ships-from, photos, description)
- ⬜ Buyer cart + checkout via Stripe Connect
- ⬜ Order management (seller side: confirm → ship → close)
- ⬜ Buyer↔seller messaging
- ⬜ Seller ratings + reputation scores
- ⬜ "Verified Grade" badge on slabbed listings (CGC cert lookup)

### 5.4 Pricing intelligence (P2 → P3)
- ⬜ User-entered market value (current path)
- ⬜ GoCollect API integration (Pro-gated, cached)
- ⬜ eBay sold-comp fallback
- ⬜ Price history charts per issue
- ⬜ Want-list price alerts (email/push when below threshold)

### 5.5 Community (P2 → P3)
- ⬜ Forum
- ⬜ Groups
- ⬜ Curated lists ("Top 10 X-Men Keys")
- ⬜ Comments on listings, series, issues
- ⬜ User-to-user messaging
- ⬜ Follow / followers
- ⬜ Activity feed (already partially built — surface friends' activity)

### 5.6 Content / editorial (P2)
- ⬜ "Reads" articles (CMS or simple Supabase content table)
- ⬜ Most-Valuable / Best-Selling monthly recaps (auto-generated from data)
- ⬜ Featured collectors / collector profiles ("Collector of the Month")

### 5.7 Subscriptions (P2)
- ✅ Stripe scaffold (in progress)
- ⬜ Collector Pro ($8/mo): grading tools, PDF export, unlimited import
- ⬜ Vault ($18/mo): PDF reports, private sharing, priority marketplace placement
- ⬜ Verified Collector ($10 one-time): CGC registry linkage
- ⬜ Founding Collector ($20/mo, capped): permanent badge, name on founders page, roadmap access

### 5.8 Notifications (P2)
- Wantlist hit (item just listed)
- Price drop on wantlist item
- New comment / message
- Forum mentions
- Run-completion nudge (new issue added to series you nearly complete)

### 5.9 Mobile (P5)
React Native app with collection scanner (barcode → match → add). Discogs invests heavily here; we will too.

---

## 6. What ComixCatalog adds that Discogs doesn't

Don't just mirror — there are things comics need that music doesn't:

- **Slabbed grade granularity**: CGC 9.8 ≠ CGC 9.6, and the price gap is huge. Music doesn't have this.
- **Newsstand vs direct edition tracking**: same issue number, different barcode, different value. No music equivalent.
- **Cert number → live registry lookup**: CGC and CBCS publish census data. Linking to it is a credibility moat.
- **Pop reports / census integration** (P5): "There are 47 copies of ASM #300 in CGC 9.8."
- **Run completion gamification**: comics come in numbered runs. "Owns 47/50 of Uncanny X-Men" is meaningful in a way "owns 47/50 of Beatles releases" isn't.
- **Key issue flagging**: first appearances, deaths, origins, costume changes. This drives 80% of comic value.
- **Insurance/appraisal PDF export**: the PRIMARY revenue feature. Discogs doesn't do this. We will.

These are our wedge.

---

## 7. Discogs reference screenshots

Captured 2026-04-26 from discogs.com. Saved in [`docs/north-star/discogs-reference/`](./discogs-reference/).

Coverage of the captures (in rough nav order — actual filenames in the folder, browse them directly):

- **Homepage**: top nav, search bar, hero carousel, "Best-Selling This Week" grid
- **Notifications panel**: wantlist hits with cover thumb + seller + price, "In Case You Missed It" recommendations
- **User dropdown**: Account / Shop / Sell / Contribute column layout
- **Top-nav dropdowns**: Explore Discography, Shop Music (formats), Sell Music (guides), Community (forum/groups/lists/contributors), Reads/Digs (features/most-valuable/collecting/gear)
- **Search**: faceted-filter results page, advanced search form, "Most Collected" sort
- **Submission flow**: Add Release form (drag-drop image, structured fields, guidelines sidebar), Submission Guidelines article
- **Marketplace**: Shop My Wantlist, New & Upcoming (carousel + grid), format-specific shops (Vinyl / CD / Cassette), full marketplace browse, empty cart, Purchases history table
- **Settings**: Buyer settings, Seller onboarding modal + form
- **Seller resources**: "Sell on Discogs" landing, How to Grade article, How to Price article, Packing & Shipping article, Seller Resources index, Seller Updates feed with topic filter
- **Community**: Forum index with category counts, Groups index, Recent Lists, all-time Contributors leaderboard, Monthly Leaderboard with Latest Submissions sidebar, Community Guidelines
- **Reads/Digs**: Features, Most Valuable & Best Selling, Collecting, Audio Gear

When in doubt about layout density, button placement, filter behavior, or copy tone — open the relevant capture and match it.

---

## 8. How to use this document

When picking the next thing to build:

1. **Match it against the sitemap (§3) and page catalog (§4).** If it's already there, you know the shape.
2. **Check §6** to see if comics need an adaptation Discogs doesn't have.
3. **Stay inside §2 (visual standard).** New components must match the existing color/typography/layout grammar.
4. **Update CLAUDE.md** with what you actually built. Update *this* doc only when the north star itself shifts.

The bar isn't "does it work." The bar is "does it feel like Discogs would feel if Discogs were for comics."
