# Marketplace Beta Plan

**Status:** active, approved by Tony 2026-10-09 · **Progress:** tracked per package on the "Marketplace Beta Build" page (claude.ai/artifact/XYDtzp1VfPc1Uz8g49xnj4) and in each PR
**Current state of the marketplace:** [MARKETPLACE.md](MARKETPLACE.md) · **Longer-range design:** [marketplace-v2-build-brief.md](marketplace-v2-build-brief.md)

The marketplace already ships as a labeled beta: listings come from a collector's library, buyers message the seller, nothing is paid through ComixCatalog. This plan is the smallest set of changes that makes it safe and honest enough to recruit sellers into. Each package is one small PR. Any PR in this plan updates this file's table and `MARKETPLACE.md` in the same PR.

## Audit baseline (live, 2026-10-08)

370 active listings from 4 sellers (341 from `thrice347`, 24 from Tony's account, now `@tanktop__`). None had a price, a seller photo or condition notes. 7 messages ever, 0 reports, 0 blocks. RLS is on for every marketplace table.

## Decisions (Tony, 2026-10-09)

- Selling stays open to any member. Recruit hand-picked sellers until reports (5) ship.
- Safe-trading copy recommends PayPal Goods & Services.
- Listings made during the beta carry over if checkout ships.
- Reports go to `/admin/reports` and email anthony.jarina@gmail.com (put the address in an env var, not in code).
- Unpriced listings stay live as "Open to offers". The eBay asking-price estimate is never shown to buyers as a price; sellers still see it in their library as a hint.
- Marking a book sold removes it from the collection and keeps a private sold history with the sale price.
- Price data: PriceCharting is the first licensing inquiry. Our own reported sale prices (package 8) are the long-term source.
- Public contact until reports ship: comixcatalog@gmail.com.

## Packages

| # | Package | Gate | Migration | PR |
|---|---|---|---|---|
| 1 | Copy honesty pass: Terms/Privacy, Beta labels, `/trust` safe-trading page, "Most books listed", `/sell` carry-over line | Before recruiting | none | this PR |
| 2 | Honest prices: "Open to offers" for unpriced listings, estimates only in the seller's library, shelves and headline count real prices | Before recruiting | none | |
| 3 | Lock message editing to `read_at` | Before recruiting | 0044 | #254 |
| 4 | Server-side message send: rate limits (stricter under 7 days), block enforced on send, link warning; close the direct insert path | Before public push | yes | |
| 5 | Reports: button on listing, thread, profile; email + `/admin/reports` behind the admin MFA gate; admin can resolve or remove a listing | Before public push | yes | |
| 6 | New-message email via Resend, throttled per conversation, with opt-out | Before public push | maybe | |
| 7 | Listing completeness: price/photo prompt after listing, "N need a price" on the For sale tab | Worth showing off | none | |
| 8 | Mark as sold + sale price, private sold history | Worth showing off | yes | |
| 9 | Listing trigger logs failures instead of swallowing them; nightly check for for-sale books with no listing | Anytime | yes | |

## Rules for every package

- Only claim what ships. No "coming soon" copy.
- Migrations are numbered files in `scripts/migrations/` with rollback SQL at the bottom. Tony applies them before merge.
- Verification exercises the failure mode (try the blocked edit, hit the rate limit), not just the happy path.
- Test as anonymous visitor, buyer, seller and admin, desktop and phone.
