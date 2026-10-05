# ComixCatalog: UX Rules

**Status:** canonical · **Verified against code:** `origin/main` at `040d7d1`, 2026-10-05
**Not a design system.** Visual standard and brand tokens: [north-star/NORTH_STAR.md](north-star/NORTH_STAR.md) §2 and `:root` in `src/app/globals.css`. Copy voice: NORTH_STAR §1.2 (comic-shop framing, no "Discogs for comics" on the front door).

Each section lists **Current** (what the code does) and **Intended / incomplete** (stated direction not yet true). Inconsistencies are marked ⚠.

## Rules that apply everywhere

1. **Never show a wrong cover.** A missing cover is a blank or the fallback image. No borrowing a neighboring issue's art. Founder decision, sitewide.
2. **Never overclaim.** Don't present asking prices as sales, a planned feature as live, or the marketplace as having checkout. Valuations carry their source label ("asking, N listings" vs "auto, N sales").
3. **A for-sale book is still owned.** Use `OWNED_STATUSES`; never `status === "owned"` alone.
4. **Small covers use thumbs.** Any grid, shelf, search result or carousel wraps the URL in `coverThumb()`. Detail pages use the original.
5. **Long lists render progressively.** The series grid renders in batches as you scroll; bulk actions over 50 items confirm first.
6. **Server-render the first view.** Search, series and home render data into the HTML; the client takes over for typing and filters. Don't regress a page to a client-only loading shell.

## Search

**Current**
- The header search box is on every page. It shows a page-width dropdown grouped by title, keyboard navigable. On `/search` the dropdown is suppressed because the page itself is the result list.
- A trailing year is a filter ("rai 1994" finds the 1994 volume). A trailing issue number is stripped for series matching ("hulk 181").
- Results rank exact title, then year match, then starts-with/contains, then size. GCD fragments of one ComicVine run collapse into one result. Results are spread across distinct titles so one franchise doesn't fill the list.
- Only US allowlisted publishers appear.
- `/search` has publisher chips and an in-collection/in-wishlist filter, applied client-side to the current page.

**Intended / incomplete**
- ⚠ Issue-level search (`/api/search/comics`) and series search use different code paths and different normalizers.
- Barcode scan to find a book is listed as "soon" on `/upgrade`; nothing exists.

## Series vs issue presentation

**Current**
- Series page: header (title, publisher, year span, issue count, format label for collected editions), run completion for signed-in users, issue grid with cover, number, owned/wanted state, sort options (issue #, title, year, recently added). "Add all missing to wishlist" with confirmation for big runs.
- Issues sort by leading number, so "30 (471)", "1A", "300.1" sort by their primary number.
- Issue page: cover (or the collector's own copy photo first, then the catalog cover and variants), metadata, story arcs ("you own X of Y"), key-issue note, printings, copies for sale, market stats, nearby issues, prev/next.
- Variant covers show as an unlabeled thumbnail grid. Picking one sets it as "my copy."

**Intended / incomplete**
- ⚠ Issues that exist only as covers (`cv-…`, `cvt-…` ids) look like normal issues but have thinner metadata.
- A proper variant/printing identity (separate tracked copies per printing) is out of scope until a design note exists.

## Filtering and navigation

**Current**
- Primary nav: logo, search, Marketplace, Library, Inbox (with unread count), account menu (profile, Founding Collectors, Blog, Account, Upgrade). Signed out: Log in, Sign up.
- URL holds state on `/marketplace` (filters, sort, page) and `/library?tab=`.
- Placeholder routes exist but aren't linked from nav: `/sell`, `/forum`, `/crate-dig`, `/community/guidelines`.

**Intended / incomplete**
- NORTH_STAR §3 describes Discogs-style dropdown menus (Explore, Shop, Sell, Community, Reads). Not built.
- ⚠ `/reads` is in the sitemap but not in nav; `/blog` is in the account menu only.

## Responsive and mobile

**Current**
- Mobile is a first-class target: much traffic comes from Instagram on phones. Recent work cut phone load time (server rendering, progressive grids, thumbs).
- Layouts collapse with CSS media queries in `globals.css` and some inline `style` grid rules (`auto-fit, minmax(...)`). Issue page: two columns on desktop, stacked under about 600px; stat cards and nearby-issue thumbs reduce columns on phones.
- Some nav links hide on small screens (`nav-link-mobile-hide`).
- Photo upload supports phone camera capture.

**Intended / incomplete**
- ⚠ No shared breakpoint scale: at least 12 different max-width values (540 to 1080px) in `globals.css`. Pick from the existing ones (640, 900) rather than adding new ones.
- ⚠ CLAUDE.md says "Tailwind only, no inline styles for layout." The code has about 360 inline `style={{}}` objects and mostly global CSS classes. Follow the file you're in.

## Comic cover treatment

**Current**
- Covers sit in fixed comic-proportion boxes with `object-fit: cover` (32 rules in `globals.css`), so odd-sized scans get cropped at the edges rather than letterboxed.
- The collector's own photo (`user_cover_url`) represents their copy in library, profile, PDF and issue page. It never replaces the catalog cover for anyone else.
- Listing photos are separate from catalog covers and belong to the copy.

## Metadata density

**Current**
- Discogs-level density is the goal: grade, slab, cert, value, publisher and year visible on library rows without opening a detail view.
- Dates show as "Month YYYY" from `key_date`, never GCD's raw `publication_date` (it can be in another language).
- Publisher shown is the cached, normalized label, never the raw GCD or ComicVine value.

## Collection and wishlist interactions

**Current**
- One action per issue: Add to Collection, Add to Wishlist, Remove. The library has tabs Owned (includes for sale), Wishlist, For Sale.
- Grading, slab, cert, notes, photo are inline in the library (`GradeEditor`). Grade and photo fields are Pro only, enforced by a DB trigger.
- Changes are optimistic and the library is cached in localStorage, refreshed on tab focus.

**Inconsistencies**
- ⚠ **"+ Add another copy" doesn't work.** It's on the issue page, but a unique index allows one row per user per issue. The insert fails and the error is only logged. Multi-copy support is approved and planned (slop spec WS2).
- ⚠ Owning a book and wanting it are mutually exclusive today. Adding to the wishlist while owned flips the row's status.
- ⚠ Remove acts on the issue, not a specific row.
- ⚠ Bulk "add all missing" doesn't report partial failures.
- ⚠ Terminology: "Wishlist" (issue page, library, LibraryContext) vs "Wantlist" (profile tab, export, upgrade copy). Pick one in copy before adding more.

## Marketplace presentation

**Current**
- Shelves first, then a facet list once you search or filter. One row per copy.
- Price shown if set, otherwise "est. value" or "Open to offers." Every listing page says "No fees during the beta" and that payment is arranged by message.
- CTA is "Make an offer," which opens a pre-filled DM.

**Inconsistencies**
- ⚠ `/sell` still says "Seller Tools Coming Soon."
- ⚠ `/upgrade` lists "Early marketplace access... when it launches" as "soon," while the marketplace is live for everyone.

## Public profiles

**Current**
- `/u/[username]`: header with badges (Founding Collector, Pro), stats, tabs Owned / Wantlist / For Sale / Activity. Each tab respects its `show_*` flag; `show_value` hides values. Private profiles show nothing. Owners get edit and share buttons; visitors get a signup CTA.
- Share cards for Instagram Stories (owner only).

**Inconsistencies**
- ⚠ The activity feed (`/api/activity`) doesn't check `is_public`, `show_collection` or `show_wantlist`, and labels `for_sale` rows wrong (slop spec S3, open).

## Desktop vs mobile differences

| Area | Desktop | Mobile |
|---|---|---|
| Header search results | Page-width dropdown | Same dropdown, full width |
| Issue page | Cover and info side by side | Stacked |
| Marketplace | Facet sidebar | Filters stacked above list |
| Library | Dense rows with inline editing | Same data, wrapped |
| Photo upload | Drag and drop | Camera capture |

## Copy rules

- Founder's voice: first person where personal, plain, a little funny. No em dashes in published copy.
- Say what's shipped. Mark future features "soon" and keep that list current. ⚠ `/upgrade` currently says "Collection value over time" is soon (it shipped 2026-10-02) and "13,000+ recent sold listings" (the data is asking prices, not sales).
