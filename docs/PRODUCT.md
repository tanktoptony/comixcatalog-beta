# ComixCatalog: Product

**Status:** canonical · **Verified against code:** `origin/main` at `040d7d1`, 2026-10-05
**Scope:** what the product is and what actually ships. For data counts and launch gates see [PROJECT_STATUS.md](PROJECT_STATUS.md) and [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md). For long-range direction see [north-star/NORTH_STAR.md](north-star/NORTH_STAR.md) (aspirational, not status).

## Definition

ComixCatalog (comixcatalog.com) is a web app for comic book collectors. It combines a searchable catalog of US comics (about 208k series and 2.5M issues, mirrored from the Grand Comics Database) with a personal collection manager: you mark issues as owned or wanted, record grade, slab and cert details, attach your own photos, and see an estimated value derived from eBay listing data. Collectors get a shareable public profile, and can list owned books in a beta marketplace where buyers contact sellers by message. It is a solo-founder product in public beta, built on Next.js and Supabase.

Internal model: Discogs (catalog + collection + peer marketplace). External pitch since 2026-09-13: "the comic shop that belongs to you." Both live in NORTH_STAR.md §1. Don't lead user-facing copy with the Discogs comparison.

## Users

| User | What they need |
|---|---|
| Serious collector | Exact tracking: grade, slab company, cert number, variant/printing, purchase price, value, insurance PDF |
| Casual / returning collector | Find a series, see what they're missing from a run or story arc, keep a wantlist |
| Seller (beta) | List owned copies with price, condition notes and photos; get contacted by buyers |
| Visitor from social | Land on `/start` or a public profile, understand the site in seconds, sign up |
| Admin (the founder, one hardcoded user id) | Comp Pro, write blog posts, manage production assets |

## Core jobs

1. Find a comic: search a series by title (optionally with year or issue number), open the series, open an issue.
2. Record it: add to collection or wantlist, then grade it, photo it, note it.
3. Know what it's worth: per-copy and total estimated value, value over time (Pro).
4. Finish a run: run and story-arc completion, "add all missing to wantlist."
5. Show it off: public profile at `/u/[username]`, share cards for Instagram Stories.
6. Sell it (beta): list from the library, buyers message to make an offer.
7. Get data out: CSV export, wantlist export, insurance PDF.

## Product surfaces

| Surface | Route(s) | State |
|---|---|---|
| Home | `/` | Live |
| Search | `/search`, header search dropdown | Live |
| Series page | `/series/[id]` | Live |
| Issue page | `/issue/[id]` (numeric GCD id, or synthetic `cv-…`/`cvt-…` ids) | Live |
| Local (user-added) comic | `/comic/[id]`, `/comic/[id]/edit` | Live |
| Story arc | `/arc/[id]` | Live |
| Library | `/library` (tabs: owned, wishlist, for sale), `/library/add` | Live |
| Public profile | `/u/[username]` | Live |
| Marketplace | `/marketplace`, `/listing/[id]` | Beta, no checkout |
| Messaging | `/inbox`, `/inbox/[username]` | Live, free-text only |
| Pro / billing | `/upgrade`, `/account`, Stripe checkout and portal | Live |
| Founding pass | `/founding-collectors` | Live (first 100 accounts get lifetime Pro free) |
| Onboarding | `/start`, `/signup`, `/login`, `/complete-profile` | Live; Google sign-in is commented out |
| Editorial | `/blog` (DB-backed), `/reads` (static articles) | Both live; see Open product questions |
| Newsletter | `/newsletter`, footer form | Live signup; sending via manual workflow |
| Contribute | `/contribute/add-comic` | Live (catalog lookup first, then submit) |
| Admin | `/admin`, `/admin/production-assets` | Live, single admin |
| Placeholders | `/sell`, `/forum`, `/crate-dig`, `/community/guidelines`, `/status` | Static "coming soon" or hardcoded pages |

## Differentiators (as built)

- Grade-native collection records: raw vs slabbed, CGC/CBCS/PGX, 0.5 to 10.0, cert numbers, per-copy photos.
- Run and story-arc completion with one-click wantlist fill.
- Honest valuation labeling: the UI says "asking" when the data is listing prices, not sales.
- Honest covers: a missing cover shows as missing. Borrowing another issue's cover was removed sitewide on purpose.
- Collector identity: public profiles with shelves, badges, share cards.
- Insurance/appraisal PDF export (Pro).

## What ComixCatalog is not

- Not a retailer. It does not sell inventory.
- Not a payments platform yet. No checkout, no escrow, no buyer protection, no fees.
- Not a data API product. The dataset is internal only (GCD license, ComicVine and eBay terms).
- Not a grading service. Grades are self-reported; certs are not verified.
- Not international. Search and browse are filtered to a US publisher allowlist.
- Not a community forum yet. `/forum` is a placeholder.

## Maturity

Public beta, part-time solo development, no fixed launch date. Small real user base (dozens of profiles, nearly all comped Pro via the founding pass, so revenue is effectively $0). The catalog and collection core are stable. Cover coverage is the main visible gap: roughly a third of the allowlisted US corpus has a cover, filled hourly by an automated ComicVine ingest.

## Capabilities

| Capability | State |
|---|---|
| Catalog search, series, issues | Implemented |
| Collection, wishlist, grading, photos, notes | Implemented |
| Multiple copies of one issue | **Broken.** UI offers "Add another copy"; a DB unique index rejects it. Fix planned (slop spec WS2) |
| Variant covers (gallery, "which printing is mine") | Implemented (ComicVine images, unlabeled) |
| Community-reported printings (UPC) | Implemented, low usage |
| Key issue flags | Implemented (curated seed list) |
| Valuation | Partial: based on eBay asking prices, not sold prices |
| Value over time chart | Implemented (Pro) |
| CSV import/export, wantlist export, PDF | Implemented (limits and Pro gates apply) |
| Public profiles, share cards | Implemented |
| Pro subscription (Stripe) | Implemented |
| Marketplace browse, listing page, price, photos | Implemented (beta) |
| Structured offers, checkout, payouts, ratings | Planned |
| Block/report users | Schema only, no UI or API |
| Price alerts, barcode scan, heat seekers | Planned (shown as "soon" on `/upgrade`) |
| Google sign-in | Built, disabled pending session-persistence fix |
| Forum, events | Placeholder pages only |

## Open product questions

These are undecided. Don't resolve them in code without the founder.

- **Two editorial surfaces.** `/blog` (database `blog_posts`, linked in the account menu, drafts in `content/blog/`) and `/reads` (static `src/app/reads/articles.js`, in the sitemap, not in navigation). Which one is the long-term home?
- **Founding tier.** The founding pass is free for the first 100 accounts, but `/api/stripe/checkout` still accepts `tier: "founding"` with its own Stripe price. Is a paid founding tier still meant to exist?
- **Who can sell.** Any user with a public profile can list today. The marketplace brief asks whether selling should be Pro-first (open question 3).
- **Online-shop reframe.** The "your comic shop" positioning (2026-09-13) changes copy, not the data model. Features implied by it (forum, community price contributions) are not scheduled.
- **Patreon and Vault tiers.** CLAUDE.md lists Patreon tiers and an $18 Vault tier. No code references either.
