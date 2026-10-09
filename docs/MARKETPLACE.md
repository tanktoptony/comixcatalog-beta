# ComixCatalog: Marketplace

**Status:** canonical, describes current state · **Verified against code:** `origin/main` at `4abf5dc`, 2026-10-09
**Plan of record:** [marketplace-v2-build-brief.md](marketplace-v2-build-brief.md) (phases 0 to 6, open questions for the founder). [marketplace-launch-spec.md](marketplace-launch-spec.md) is older; its mechanics are superseded.

**One line:** a public beta where collectors list copies from their library and buyers contact them by direct message. No money moves through ComixCatalog. Don't describe checkout, buyer protection, payouts, fees or seller ratings as available.

## Implemented

**Seller model**
- Any signed-in user can sell. A listing is visible only if the seller's profile has a `username`, `is_public` is not false, and `show_for_sale` is not false (RLS on `listings`).
- No seller onboarding, verification, account-age limit or Pro requirement.

**Listing model** (`listings`, migration 0031)
- One row per listed copy, tied to a `user_collections` row (`collection_id`) and a catalog issue (`gcd_issue_id`, required). Local comics can't be listed.
- Status: `draft | active | reserved | sold | withdrawn | removed`. Only `active` and `withdrawn` are produced today.
- Snapshot columns (title, issue, year, publisher, variant, cover path) so browse never re-hydrates. The trigger fills them from SQL; `refreshListingSnapshots()` (`src/lib/marketplace.js`) fills cover and publisher label.
- Condition copied from the collection row while draft/active: `condition`, `grade_numeric`, `slab_company`, `slab_cert_number`. Seller adds `condition_notes` (2,000 chars), `restored`, `signed`.
- Price: `price_cents` optional ($1 to $100,000); null means "open to offers." `shipping_cents` optional ($0 to $1,000). `accepts_offers` flag. USD only.

**How listing works (seller flow)**
1. In `/library`, mark a book for sale (per row or "list everything").
2. The browser updates `user_collections.status = 'for_sale'`. Trigger `user_collections_sync_listing` creates or reactivates a listing. Unlisting withdraws it.
3. The library calls `POST /api/listings/sync`, which fills covers and expires the `listings` cache.
4. Seller sets price, shipping, offers, notes, restored/signed via `ListingEditor` → `PATCH /api/listings/[id]` (owner only, draft/active only; rules in `src/lib/listingEdit.js`).
5. Seller adds up to 10 photos per copy (`PhotoManager`): signed upload to `listing-photo-originals`, server re-encode with sharp to WebP (EXIF/GPS stripped, 1600px + 400px thumb) into `listing-photos`. Quotas: 10 per copy, 200 per user, 50 per day, 15 MB per upload. Nightly cleanup deletes originals and orphaned files.

**Buyer flow**
1. Browse `/marketplace` (`MarketplaceBrowser`): shelves (just listed, most wanted, most valuable, publishers, top sellers), then a facet sidebar with search, filters, sort, 25 per page. All state in the URL. Filtering runs client-side over every listing (`src/lib/marketplaceFacets.js`).
2. See copies for sale on an issue page (`IssueForSale`, `GET /api/marketplace?gcd=<id>`).
3. Open `/listing/[id]`: photos, condition, the seller's price or "Open to offers," shipping, seller since.
4. "Make an offer" opens `/inbox/<seller>?about=<book>`, a pre-filled free-text message. Payment and shipping are arranged off-platform.

**Pricing shown**
- Buyers only see the seller's price (`price_cents`). Unpriced listings read "Open to offers" on browse, listing, issue and profile pages, in page metadata, and in wantlist matches. Price sorts, the price facet and the "Highest priced" shelf ignore unpriced listings.
- The estimate (`market_value`, else eBay asking-price `auto_market_value`) is only shown to the seller, in the library and `ListingEditor`, as a pricing hint.

**Fees**
- None. "No fees during the beta" is public copy on `/listing/[id]` and in `MarketplaceBrowser`. Changing it needs copy and Terms updates.

## Partially implemented

| Piece | What exists | What's missing |
|---|---|---|
| Safety tables | `user_blocks`, `reports` tables with RLS (0031) | No API, no UI, nothing reads them |
| Listing photos | Upload, process, reorder, delete, cleanup | High-value listings aren't required to have photos; the old single `user_cover_url` photo isn't migrated |
| Statuses | Full status enum and partial unique index | No `reserved` or `sold` transitions; sold books just get unlisted |
| Messaging | `messages` table, inbox, unread count, Realtime on open thread | Browser inserts directly under RLS: no rate limit, no block check, no link/scam warnings. Recipients can only update `read_at` (column grant, migration 0044) |
| SEO | `Product`/`Offer` JSON-LD on priced listings, escaped with `safeJsonLd` (`src/lib/jsonLd.js`) | Listings aren't in the sitemap |
| Scale | Snapshot table, browse indexes, trigram index on title | `getListings()` loads all listings into memory; `refreshListingSnapshots` runs before every uncached read |

## Planned or placeholder

From the v2 brief, not built:
- Phase 2: Structured offers (`offers` table, accept/decline/counter, 48h expiry).
- Phase 2: Server-side message sending with limits, blocks, reports, scam heuristics, email notifications.
- Phase 3: Server-side filtering and keyset pagination; listings in the sitemap.
- Phase 4: Stripe Connect checkout, `orders`, `stripe_events` idempotency, reserved inventory, refunds, disputes. Test mode first, behind a flag.
- Phase 5: Seller ratings, new-seller limits, admin moderation queue, prohibited-item rules, cert verification.
- Phase 6: Wantlist match alerts, storefronts, fee model.

## Inventory and the collection

- A listing is a view of a collection row, not separate inventory. `for_sale` counts as owned in totals, values, run completion and exports (`OWNED_STATUSES`).
- Deleting the collection row cascades to the listing and its photo rows (files are cleaned up nightly).
- Because `user_collections` allows one row per user per issue today, a seller can't list one copy while keeping another of the same issue. Multi-copy support (slop WS2) changes that.

## Schema

`listings`, `listing_photos`, `user_blocks`, `reports` (0031); view `marketplace_listings` (active listings from visible sellers, plus `seller_username` and the copy's values); `messages` (0005). Writes to `listings` only via the trigger and the service role. No insert/update/delete policies for users.

## Required before real transactions

1. Server-side messaging with rate limits, blocks and reports (Phase 2).
2. Founder answers the brief's §12 questions: fee model, payout timing, who can sell, shipping, returns, sales tax, photo requirements.
3. Stripe Connect accounts, server-computed amounts, idempotent webhooks, reservation with expiry (Phase 4).
4. Terms and `/trust` updated for payments, disputes and prohibited items.
5. Admin moderation tools (Phase 5).
6. Server-side browse once listings reach the low thousands.
