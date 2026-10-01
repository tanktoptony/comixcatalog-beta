# Marketplace v2 Build Brief (for an implementing agent)

**Written:** 2026-10-01, right after Marketplace v1 (beta) shipped in PR #152 and #157.
**Owner:** Tony (founder, solo). You are building for one person who reviews PRs; keep slices small and mergeable.
**Supersedes:** the mechanics sections of [marketplace-launch-spec.md](marketplace-launch-spec.md) where they conflict (that spec predates v1; its Trust & Safety and Stripe Connect thinking still holds and is referenced below). Its agent-prompt companion has stale repo paths; do not use it.

---

## 0. Kickoff

You are an Opus agent building out the ComixCatalog marketplace from a working v1 beta into something that is safe, scalable, and ready to take payments through Stripe. Read this whole brief, then `CLAUDE.md`, then the files listed in section 2 before writing code. Work in phases (section 5). Each phase is one or more small PRs from a git worktree. Do not start Stripe money movement (Phase 4) until Phases 0 to 2 are merged and Tony has answered the open questions in section 12.

The north star filter from the original spec still applies. Every change should answer yes to at least one:
1. Does this make a buyer trust a listing (right book, honest condition, real photos, fair price)?
2. Does this make a seller trust the platform (easy listing, predictable payout, protection from scams and spam)?
3. Does this keep the platform safe and cheap to run (no abuse vectors, no runaway storage or database cost)?

---

## 1. Goals for v2

1. **A real listing model.** Today a "listing" is just a `user_collections` row with `status = 'for_sale'`. Move to a first-class `listings` table that can carry price, shipping, photos, state, and later an order.
2. **Discogs-style photos.** A seller can add their own photos of the exact copy (front, back, spine, defects) from the library or the listing, quickly, from a phone. Photos are processed server-side, stripped of location data, and cheap to store.
3. **Messaging that can't be abused.** Offers and questions keep working, but spam, harassment, scams and flooding are prevented by server-enforced limits, not client goodwill.
4. **Stripe-ready.** A data model and state machine that a Stripe Connect checkout can plug into safely: server-computed amounts, idempotent webhooks, reserved inventory, refunds and disputes accounted for.
5. **Scales past the beta.** Server-side search, filtering and pagination; no "load every listing into memory" path once listings grow.

---

## 2. Where things stand (read these files)

Marketplace v1 is live as a **beta**. Public copy promises **"No fees during the beta"** (`src/app/marketplace/page.js`). Changing that requires updated copy and Terms.

| Piece | Where | Notes |
|---|---|---|
| Listing = for_sale row | `user_collections.status = 'for_sale'` | No price, no shipping, no photos column beyond `user_cover_url`. A for-sale book still counts as owned (Collection tab, value). |
| Bulk list / unlist | `src/app/library/page.js` `setAllForSale`, For sale tab, per-row `toggleForSale` | Client-side Supabase updates under RLS. |
| Listings read model | `src/lib/marketplace.js` `getListings()` | Loads ALL for_sale rows (paginated with `fetchAllPages`), filters to public sellers (`profiles.is_public`, `show_for_sale`), hydrates titles/covers by calling `/api/library-hydrate` in-process, caches 2 min with `unstable_cache`. Fine to a few thousand listings, not beyond. |
| Est. value | `market_value` (seller) else `auto_market_value` (eBay comps) | Shown as "est. value"; buyers "Make an offer". |
| API | `src/app/api/marketplace/route.js` (`?gcd=` per issue) | 60 s CDN cache. |
| Browse UI | `src/app/marketplace/page.js`, `src/components/MarketplaceGrid.js` | Grouped by publisher then title, search, sort, publisher chips, all client-side over the full list. |
| Issue page | `src/components/IssueForSale.js` in `src/app/issue/[id]/page.js` | "Copies for Sale" per catalog issue. |
| Offers | `src/lib/marketplaceFormat.js` `offerHref` -> `/inbox/<seller>?about=<book>` | Pre-filled free-text DM. No structured offer object. |
| Messaging | `scripts/migrations/0005_messages.sql`, `src/app/inbox/*`, `src/lib/inboxCache.js`, `src/hooks/useUnreadMessageCount.js` | **Messages are inserted directly from the browser** under RLS. No rate limit, no block/report, no length or link controls beyond a 4000-char check. The thread page holds a Realtime `postgres_changes` channel while open. |
| Photos today | `src/components/GradeEditor.js` | One photo per collection row, uploaded **raw from the browser** (up to 8 MB, EXIF/GPS intact) to the public `comic-covers` bucket at `library/<collection_id>.<ext>` with upsert. Do not build listing photos on this path. |
| Stripe today | `src/app/api/stripe/{checkout,portal,webhook}` | Pro subscriptions only. Webhook verifies signatures; check whether it records processed event ids before relying on it for orders. `profiles.stripe_customer_id` is live/test-mode sensitive. |
| Thumbnails | `src/lib/coverThumb.js`, `cover-thumbs` bucket, `CoverThumbFallback` | Pattern to copy for listing photo thumbs. |

---

## 3. Non-negotiables (guardrails)

These are requirements, not suggestions. A PR that violates one is not done.

**Money and Stripe**
- The server computes every amount from the database. Never trust a price, fee, or quantity from the client.
- Every webhook handler is idempotent: record `event.id` in a processed-events table and no-op on repeats. Handle out-of-order delivery.
- Inventory is reserved during checkout (listing `reserved` with an expiry) so a book can't be sold twice. Reservation expiry is enforced server-side.
- Use Stripe test mode end to end first, behind a feature flag. Live keys only after Tony signs off.
- No card data touches our servers. Stripe Checkout or Payment Element only.

**Abuse and safety**
- All marketplace writes that another user can see (messages, offers, listings, reports, photos) go through server routes or Postgres functions that enforce limits. Close the direct-insert path for messages.
- Rate limits are enforced server-side and stricter for new or unverified accounts (section 7 has numbers).
- Users can block and report. Blocked users can't message, offer on, or see the blocker's listings.
- Never expose emails, real names, or addresses publicly. Seller location, if shown, is city/state at most. Shipping addresses are visible only to the two parties of a paid order, and only from then on.
- Strip EXIF (including GPS) from every uploaded photo before it is stored anywhere public.

**Cost and performance**
- File storage is the plan limit we already hit (150 GB on a 100 GB plan, fixed 2026-10-01). Every photo is resized and re-encoded server-side; per-user and per-listing photo caps; photos of sold or withdrawn listings are cleaned up on a schedule.
- No Supabase Realtime `postgres_changes` subscriptions opened by every visitor or on every page. That pattern was the #1 database cost until 2026-10-01 (PR #145). Poll, or use scoped broadcast channels only where a user is actively in a conversation.
- Respect the PostgREST 1000-row cap: paginate with `src/lib/supabase/fetchAllPages.js` or keyset pagination.
- Public reads are CDN- or data-cache friendly; `unstable_cache` results must throw (not return empty) on failure so errors are never cached.

**Honesty**
- Copy only claims what works today. "No fees during the beta" stays true until Tony changes the fee model.

---

## 4. Target architecture

Treat these as a starting design. Adjust with reasons in the PR description. Write migrations as numbered files in `scripts/migrations/` (Tony applies them in the Supabase SQL editor; destructive statements need his explicit go-ahead).

### 4.1 Tables

```sql
-- One active listing per collection row. A listing snapshots what buyers see
-- so browse/search never fans out to hydrate.
create table public.listings (
  id                uuid primary key default gen_random_uuid(),
  seller_id         uuid not null references auth.users(id) on delete cascade,
  collection_id     uuid not null references public.user_collections(id) on delete cascade,
  gcd_issue_id      int4,                       -- catalog link (required for v2 listings)
  status            text not null default 'active'
                    check (status in ('draft','active','reserved','sold','withdrawn','removed')),
  -- Denormalized display fields, refreshed when the catalog row changes.
  series_title      text not null,
  issue_number      text,
  release_year      int4,
  publisher         text,                       -- master name (normalizePublisherLabel)
  cover_path        text,                       -- canonical-covers storage path
  -- Condition snapshot at listing time.
  grade_numeric     numeric(3,1),
  slab_company      text,
  slab_cert_number  text,
  condition_notes   text check (char_length(condition_notes) <= 2000),
  restored          boolean not null default false,  -- comics-specific disclosure
  signed            boolean not null default false,
  -- Pricing. price_cents null = offers only. Never trusted from the client at checkout.
  price_cents       int4 check (price_cents is null or price_cents between 100 and 10000000),
  currency          text not null default 'usd',
  accepts_offers    boolean not null default true,
  shipping_cents    int4 check (shipping_cents is null or shipping_cents between 0 and 100000),
  ships_from_region text,                       -- e.g. 'US-IL'; never a street address
  reserved_until    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  sold_at           timestamptz
);
create unique index listings_one_active_per_copy on public.listings (collection_id)
  where status in ('draft','active','reserved');
create index listings_browse_idx on public.listings (status, publisher, series_title, created_at desc);
create index listings_issue_idx on public.listings (gcd_issue_id) where status = 'active';
create index listings_seller_idx on public.listings (seller_id, status);
-- Search: trigram on series_title (pg_trgm is already used on series).

create table public.listing_photos (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid references public.listings(id) on delete cascade,
  collection_id uuid not null references public.user_collections(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,
  storage_path  text not null,       -- processed full image
  thumb_path    text not null,       -- 400px webp
  width int4, height int4, bytes int4,
  kind          text check (kind in ('front','back','spine','interior','defect','slab_label','other')),
  sort_order    int2 not null default 0,
  moderation    text not null default 'ok' check (moderation in ('ok','flagged','removed')),
  created_at    timestamptz not null default now()
);

create table public.offers (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings(id) on delete cascade,
  buyer_id      uuid not null references auth.users(id) on delete cascade,
  amount_cents  int4 not null check (amount_cents between 100 and 10000000),
  status        text not null default 'pending'
                check (status in ('pending','accepted','declined','countered','withdrawn','expired')),
  counter_cents int4,
  expires_at    timestamptz not null default now() + interval '48 hours',
  created_at    timestamptz not null default now()
);
-- At most one live offer per buyer per listing.
create unique index offers_one_pending on public.offers (listing_id, buyer_id) where status = 'pending';

create table public.orders (
  id                        uuid primary key default gen_random_uuid(),
  listing_id                uuid not null references public.listings(id),
  buyer_id                  uuid not null references auth.users(id),
  seller_id                 uuid not null references auth.users(id),
  item_cents                int4 not null,
  shipping_cents            int4 not null default 0,
  platform_fee_cents        int4 not null default 0,
  tax_cents                 int4 not null default 0,
  currency                  text not null default 'usd',
  status                    text not null default 'pending_payment'
                            check (status in ('pending_payment','paid','shipped','delivered','completed',
                                              'cancelled','refunded','disputed')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text unique,
  stripe_transfer_id         text,
  tracking_carrier text, tracking_number text,
  created_at timestamptz not null default now(),
  paid_at timestamptz, shipped_at timestamptz, delivered_at timestamptz, completed_at timestamptz
);

create table public.stripe_events (
  id text primary key,               -- Stripe event id; insert-or-skip = idempotency
  type text not null,
  received_at timestamptz not null default now()
);

create table public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('listing','message','user','photo')),
  target_id uuid not null,
  reason text not null check (reason in ('spam','scam','harassment','counterfeit','misdescribed','prohibited','other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at timestamptz not null default now()
);
```

Also add:
- `messages.listing_id uuid null references listings(id)` so a conversation can be about a listing (and offers can link to it).
- `profiles.stripe_account_id text`, `profiles.stripe_charges_enabled boolean`, `profiles.stripe_payouts_enabled boolean`, `profiles.seller_status text` ('ok', 'limited', 'suspended').
- A `listing_photo` storage budget per user (e.g. 200 photos) enforced in the upload route.

### 4.2 RLS shape
- `listings`: public `select` where `status in ('active','reserved')` and the seller profile is public; sellers `select/insert/update` their own rows but **status transitions to `reserved`/`sold` and any price at checkout happen only via the service role** in server routes.
- `listing_photos`: public `select` where moderation = 'ok' and the listing is visible; writes only via the server upload route.
- `offers`, `orders`: only the two parties can read; writes only via server routes.
- `messages`: replace the browser insert policy with a server route or a `security definer` function that enforces rate limits, blocks, and length; **fix the existing update policy**, which lets a recipient update any column (only `read_at` should be updatable; use a trigger or column privileges).
- `reports`, `user_blocks`: users read and write their own; admin reads all.

### 4.3 Storage
- New bucket `listing-photos` (public read, no client write). Upload flow: client requests a signed upload URL from `POST /api/listings/photos/upload-url` (checks ownership, quotas, MIME, size <= 15 MB) -> uploads the original to a private `listing-photo-originals` bucket -> `POST /api/listings/photos/process` runs sharp: auto-rotate, strip all metadata, cap the long edge at 1600 px (WebP q80, target 150 to 400 KB), make a 400 px thumb, write both to `listing-photos`, delete the original. Record the row in `listing_photos`.
- Paths: `l/<owner_id>/<collection_id>/<photo_id>.webp` and `.../<photo_id>.thumb.webp`. Never reuse a path (no upsert), so CDN caches can be a year long.
- Cleanup job: delete photos for listings `sold` or `withdrawn` more than 90 days ago (keep sold-order photos for dispute windows, then delete), and orphaned uploads older than 24 h.
- Vercel function bodies cap at 4.5 MB; that's why uploads go browser -> Supabase via signed URL, not through our API.

### 4.4 Read path at scale
- Browse, search and filters run as database queries on `listings` (denormalized), keyset-paginated, with the filters done in SQL: publisher, title search (trigram), grade range, slab yes/no, price range, has-photos, sort (newest, price, A to Z). The UI keeps the publisher-then-title grouping by grouping each page of results; or add a `/marketplace/[publisher]` route for very large catalogs.
- Cache public pages with `unstable_cache` plus `revalidateTag('listings')` (and `listing:<id>`) on every listing write, so a new listing appears in seconds rather than minutes.
- Listing detail page `/listing/[id]`: server-rendered, photo gallery, condition block, seller block (username, member since, completed sales, rating once Phase 5 lands), shipping, buy or offer actions, "report listing".

---

## 5. Phases (each ends in merged PRs with acceptance criteria met)

### Phase 0: Foundation (listings table + migration)
- Migration for section 4.1 tables (the core four first: listings, listing_photos, user_blocks, reports; offers/orders/stripe_events can land with their phases).
- Backfill: every current `user_collections` row with `status = 'for_sale'` and a `gcd_issue_id` gets an `active` listing with denormalized fields (reuse `/api/library-hydrate` logic once, server-side). Local `comic_id` rows stay unlisted with a clear "link to a catalog issue to list it" prompt.
- Keep `user_collections.status = 'for_sale'` in sync with listing status (a trigger or the listing routes), so the library UX from v1 keeps working.
- Switch `src/lib/marketplace.js`, `/api/marketplace` and `IssueForSale` to read `listings`.
- **Accept when:** the marketplace, issue pages and library For Sale tab show the same books as before; "List everything for sale" creates listings; a listing appears on /marketplace within 10 s of creation.

### Phase 1: Seller tools and photos (Discogs-style)
- In the library row and a new listing editor (`/listing/[id]/edit`): price (optional; prefilled with est. value, clearly marked as a suggestion), accepts offers, shipping price, condition notes, restored/signed toggles, slab cert.
- Photo uploader: drag/drop and phone camera (`accept="image/*" capture`), multiple at once, progress per file, reorder by drag, choose the cover photo, label kind (front/back/spine/defect/slab label), delete. Max 10 photos per listing. Uploading a photo to an owned book that isn't listed yet is allowed (photos belong to the copy via `collection_id`), so listing later is one click.
- Prompt on list: "Add photos" nudge; high-value listings (est. value or price >= $100) require at least front and back photos before going active.
- Migrate the GradeEditor single photo to this system (keep the old URL working until migrated).
- **Accept when:** a phone upload of a 12 MB HEIC/JPEG lands as a <= 400 KB WebP with no EXIF (verify GPS is gone with `sharp(...).metadata()`), thumbs serve with a one-year cache, quotas reject the 11th photo and the 201st per user, and a sold/withdrawn listing's photos are removed by the cleanup job in a dry run.

### Phase 2: Messaging and offers that can't be abused
- Move message sends to `POST /api/messages` (or a `send_message()` security-definer function). Enforce limits from section 7, blocks, length, and duplicate-body suppression. Then revoke the browser insert policy.
- Structured offers: `POST /api/offers` creates an offer on a listing (one pending per buyer per listing, expiry 48 h); seller can accept, decline, or counter; every state change posts a system message into the thread with `listing_id`. "Make an offer" opens this flow instead of a free-text DM.
- Block and report from any thread, listing, or profile. Blocking hides each party's listings and threads from the other.
- Link and contact-info heuristics: messages containing phone numbers, emails, off-platform payment terms ("Zelle", "Venmo", "Cash App", "PayPal friends and family", "wire") get a visible warning banner to the recipient ("Payments outside ComixCatalog aren't protected") and count toward a scam score; first messages from new accounts with links are held for review.
- Email notifications for new messages and offers (Resend is already configured) with per-user throttling (at most one digest per 15 min) and an unsubscribe link.
- **Accept when:** a scripted test that fires 50 messages in a minute from a new account gets rate-limited server-side (not just in the UI), a blocked user gets a clear error, an accepted offer reserves the listing, and the recipient's update permission covers only `read_at`.

### Phase 3: Browse at scale and the listing page
- Server-side query, filters, keyset pagination and caching from section 4.4. Listing detail page. SEO: `Product`/`Offer` structured data for active listings with a price, canonical URLs, sitemap entries for active listings.
- **Accept when:** /marketplace renders in under 1 s from cache with 10k seeded listings (seed in a test schema or with a script against a preview database, not production), filters round-trip in under 300 ms server time, and no page loads more than 60 listings at once.

### Phase 4: Stripe Connect checkout (test mode, behind a flag)
See section 6. **Accept when:** in test mode, an end-to-end purchase works (buy now and accepted offer), the listing is reserved during checkout and released on expiry, the webhook is replay-safe (send the same event twice), refunds and a test dispute update the order correctly, and the seller sees the payout in their Express dashboard.

### Phase 5: Trust and safety
- Seller ratings after completed orders (buyer rates seller; optional seller rates buyer), shown on listings and profiles.
- New-seller limits: max 10 active priced listings and $500 total open order value until 3 completed sales with no disputes; raise automatically.
- Admin moderation queue at `/admin/marketplace`: reports, flagged messages, flagged photos, suspend seller, remove listing (status `removed`, reason logged), refund order. Gate with the existing `ADMIN_ID` server check.
- Prohibited items list and listing review for keywords (reprints sold as originals, facsimiles not disclosed, counterfeit CGC labels).
- **Accept when:** a report reaches the queue, an admin action is audit-logged, and a suspended seller's listings disappear from browse immediately.

### Phase 6: Polish and growth
- Saved searches and wantlist matches ("a book on your wantlist was just listed"), throttled emails.
- Seller storefront section on profiles.
- Fee model switch (only when Tony decides; update copy, Terms, and `/upgrade` Pro comparisons).

---

## 6. Stripe design (Connect)

- **Account type:** Stripe Connect **Express** (Stripe-hosted onboarding and KYC, Express dashboard for payouts; matches the original spec). Store `stripe_account_id` and capability flags on `profiles`; update them from `account.updated` webhooks.
- **Charge type:** **destination charges** via Checkout Sessions (`payment_intent_data.transfer_data.destination = seller account`, `application_fee_amount = platform fee`). Simple to reason about, the platform is merchant of record for disputes. Alternatively separate charges and transfers if Tony wants to hold funds until delivery; decide in section 12.
- **Fees during beta:** `application_fee_amount = 0` while "No fees during the beta" is public. Make the fee a server constant with a single source of truth.
- **Flow:** `POST /api/checkout/listing` (auth required) -> verify listing `active`, buyer is not seller, not blocked, seller `charges_enabled` -> set listing `reserved` with `reserved_until = now() + 30 min` in a transaction -> create the `orders` row (`pending_payment`) -> create the Checkout Session with server-computed line items (item + shipping), `shipping_address_collection` (US only to start), `metadata.order_id`, `client_reference_id = order_id`, `expires_at` matching the reservation -> redirect.
- **Webhooks** (extend `src/app/api/stripe/webhook/route.js` or add `/api/stripe/connect-webhook` for Connect events): insert `event.id` into `stripe_events` first and skip if it exists. Handle `checkout.session.completed` (order `paid`, listing `sold`, collection row moves out of the seller's library or is flagged sold, notify both parties), `checkout.session.expired` (release the reservation), `charge.refunded`, `charge.dispute.created/closed`, `account.updated`. Never mark anything paid from a client redirect alone.
- **After payment:** seller enters tracking, the order moves `shipped -> delivered` (carrier webhook later; manual "received" from the buyer first), then `completed` after a dispute window (e.g. 7 days after delivery).
- **Tax:** US marketplace-facilitator laws can make the platform responsible for collecting sales tax once state thresholds are met. Plan for Stripe Tax (`automatic_tax`) and flag this to Tony before live launch; do not guess.
- **Refunds:** platform-initiated refunds reverse the transfer (`reverse_transfer: true`) and refund the application fee where appropriate.
- **Test plan:** Stripe CLI `stripe listen` against a preview deploy, test cards for success, 3DS, decline, and dispute (`4000000000000259`). Document it in `docs/stripe-testing-guide.md` (exists; extend it).
- **Keys:** test and live keys are separate env vars; nothing live until Tony flips it. `stripe_customer_id` is mode-sensitive (a live `cus_` fails under a test key); same for `acct_` ids.

---

## 7. Anti-spam and abuse limits (start here, tune with data)

Enforce in the server route or database function, return a clear error, and log the hit.

| Action | New account (< 7 days or 0 completed orders) | Established |
|---|---|---|
| Messages sent | 20 per hour, 60 per day | 60 per hour, 300 per day |
| New conversations started (first message to someone) | 5 per day | 30 per day |
| Offers made | 10 per day, 1 pending per listing | 50 per day, 1 pending per listing |
| Listings created | 10 active priced listings until 3 completed sales | 1,000 active |
| Photo uploads | 50 per day, 200 stored | 300 per day, 2,000 stored |
| Reports filed | 20 per day | 20 per day |

Also:
- Message body 1 to 2,000 chars (tighten from 4,000); identical body to 3+ recipients within an hour is blocked as spam.
- Require a verified email (Supabase auth) to message or list.
- A recipient who never replied gets at most 3 messages from a sender until they reply (stops cold-message flooding).
- Auto-flag: links in a first message, off-platform payment terms, repeated reports. Three open reports on a user pauses their messaging pending admin review.
- Never reveal whether a blocked user exists or why a message failed beyond "can't send to this user".

---

## 8. Comics-specific considerations

- **Exact copy, exact issue:** listings must be catalog-linked (`gcd_issue_id`); variant and printing matter (see `src/lib/printings.js`, `cover_variants`). Let sellers pick the variant/printing on the listing and show it prominently.
- **Condition disclosure:** raw grade is the seller's opinion; slabbed grade shows company + cert. Disclose restoration (CGC purple/"Restored" labels), pressing/cleaning if known, signatures (and whether witnessed: CGC Signature Series yellow label vs unwitnessed), missing pages/coupons, Marvel value stamps cut.
- **Cert verification:** CGC/CBCS cert lookups exist publicly; Phase 5 can add a "cert entered" vs "cert verified" distinction (the original spec's verified-slab badge).
- **Price guidance:** show est. value with its sample size (`auto_market_value_n`) and source; never present eBay listing medians as "sold" prices if they aren't (CLAUDE.md caveat).
- **Shipping:** offer guidance for raw vs slab (bag and board, team bags, cardboard sandwich; slab boxes), and require tracking above a value threshold (e.g. $50).

---

## 9. Scalability and cost notes

- Stay off the "fetch everything then filter in JS" path past Phase 0; `getListings()` is a beta convenience.
- Denormalize display fields onto `listings` so browse is one indexed query. Refresh them with a small job when catalog covers or titles change (the cover ingest runs hourly).
- Index every foreign key you filter on; check plans with `EXPLAIN ANALYZE` (Tony can run SQL; PostgREST plan output is disabled).
- Images: thumbs in grids (pattern: `src/lib/coverThumb.js`), never originals.
- Background jobs (cleanups, reservation expiry sweeps, digest emails) run as GitHub Actions cron or Supabase scheduled functions, idempotent and paginated.
- Watch Supabase usage (org Usage page): file storage, egress, database CPU. pg_stat_statements was reset 2026-10-01 16:05 UTC for a clean baseline.

---

## 10. Legal and policy (flag, don't decide)

- Update Terms with marketplace rules: prohibited items, seller obligations, fees, disputes, refunds, buyer protection scope, ban policy.
- Sellers must be 18+ (Stripe Express enforces KYC; mirror it in Terms).
- Sales tax as marketplace facilitator (section 6).
- 1099-K reporting is handled by Stripe Connect for Express accounts; confirm.
- Founding Collector terms already say marketplace fees are not included in lifetime Pro; keep that consistent.

---

## 11. How to work in this repo (gotchas that have bitten before)

- **Worktrees:** a branch guard requires work in `.worktrees/<topic>` on branch `agent/<topic>` (`git worktree add .worktrees/<topic> -b agent/<topic> main`). Copy `.env.local` into the worktree. Do not use bare `git stash`.
- **CI:** `pr-ci.yml` runs lint on changed files (fix pre-existing errors in files you touch), unit tests, and an error-handling ratchet (`npm run audit:errors`): every Supabase query must check `error`.
- **PostgREST caps at 1000 rows silently.** Use `fetchAllPages` or keyset pagination. Throwaway diagnostic scripts must check errors and paginate too.
- **Caching:** `unstable_cache` must throw on failure (never return a cacheable empty). Use tags and `revalidateTag` for listing writes.
- **No per-visitor Realtime.** See section 3.
- **Storage budget.** See section 3. Every new upload path resizes server-side.
- **Database changes:** write migrations in `scripts/migrations/NNNN_name.sql`; Tony runs them in the Supabase SQL editor. Paste any SQL he must run directly in your report, never just a file path. Destructive SQL (drops, deletes) needs his explicit go-ahead.
- **Copy:** Tony's voice (good-natured, collector-to-collector, a little sarcastic), no em dashes, no claims about features that don't exist. Add a `src/lib/siteNews.js` entry when something user-visible ships (it feeds the homepage Dispatch).
- **Docs travel with the work:** update `CLAUDE.md` (tables, buckets, routes) and `docs/PROJECT_STATUS.md` in the same PR as the change.
- **PRs:** one phase slice per PR, CI green, description with what changed for users vs infrastructure. Tony merges (or tells you to).

## 11a. Verification standards

- Tests must exercise the failure mode, not just the happy path (rate limit actually trips, duplicate webhook actually no-ops, reservation actually expires, EXIF actually gone). Two past defects shipped because tests used samples too small to hit the bug.
- Unit-test pure logic (fee math, state transitions, rate-limit windows) with `node --test` like the existing `src/lib/*.test.js` files, and add them to CI.
- For UI, build and screenshot desktop and phone (headless Chrome is available under `video-production/node_modules/.remotion/chrome-headless-shell`).
- Never test against production data destructively. Seed scale tests in a separate schema or a preview database.

---

## 12. Open questions for Tony (ask before Phase 4)

1. **Fee model after beta:** percentage (Discogs-style 5 to 8 percent), flat, or Pro-discounted? When does the beta end?
2. **Hold funds until delivery** (separate charges and transfers) or pay out on Stripe's normal schedule (destination charges)?
3. **Who can sell:** everyone, or Pro/Founding first? Minimum account age?
4. **Shipping:** seller-set flat price, or calculated (Shippo/EasyPost) later? US-only at launch?
5. **Returns policy:** "not as described" only, or a general window?
6. **Sales tax:** use Stripe Tax from day one of paid sales?
7. **Photo requirements:** require photos for every priced listing, or only above a value threshold?

---

## 13. Out of scope for v2

- Auctions, bundles/lots, international shipping, multi-currency, physical grading or authentication services, buyer-to-seller wanted ads (the wantlist match emails in Phase 6 cover that need).

## 14. Adjacent issues spotted on 2026-10-01 (not marketplace, don't fix in marketplace PRs)

- `tests/smoke.test.js` "orphan-issue" tests fail against production: series `d9b5588f-...` (Absolute Batman, `gcd_id` 226633) now has a single GCD issue row, so `/api/series/[id]` returns 1 issue instead of ComicVine's 23, and `/api/issues/cv-226633-2` 404s. A regression of the earlier Absolute Batman "1 issue" fix; needs its own PR.
- `messages` update policy lets a recipient update every column (fix in Phase 2).
