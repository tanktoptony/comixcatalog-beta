# Operations & Efficiency Handoff

**Written 2026-09-21.** Context for an agent picking up operations and growth
work: GitHub Actions reliability, the cover-ingestion pipeline, Instagram
posting, blog, marketing, ads, Google Analytics, the mailing list, and
traffic. Sections 1-7 cover operations; **section 8 covers growth.**

**If this file disagrees with reality, reality wins — verify before acting.**
Everything below was true on 2026-09-21 and parts of it will rot.

---

## 1. The most important lesson from the week before this handoff

Three production outages were caused by *fixes*, each of which passed a
verification that was **structurally incapable of failing**.

| Fix | What its test did | What it missed |
|---|---|---|
| Cover-bleed fix | ran on 46 series rows via `--only-ids` | the bug is a per-batch set leaking across batches of 100, so 46 rows fit in one batch and could not exhibit it |
| Ingest silent-skip fix | ran the ingester once | the failure only appears on run N+1, when the same dead targets re-consume the budget. Took the hourly pipeline down 27 hours |
| Retry-backoff fix | verified the backoff logic in isolation | did not consider that rewriting `needs_volume_id.json` hourly would collide with the other workflow that writes it |

**The rule this produced:** before accepting any verification, ask *"could
this test have failed?"* If the sample is too small, too short, or too
isolated to reproduce the mechanism, it proves nothing. State the pass
criterion as an observable number that would differ if the fix were absent
(`issues>0`, `collisions 12 -> 1`), and name the scale or repetition needed
to exercise it.

This applies to tooling output, not just to agents. A coverage script was
trusted and its **15.86%** user-collected coverage figure was reported to the
founder as fact. The real number was **97.28%** — the script had a pagination
bug. Verify the instrument before trusting the reading.

---

## 2. The three recurring failure classes

Recognise these before re-diagnosing from scratch.

### 2a. PostgREST's silent 1000-row cap

PostgREST caps any read at 1000 rows with **no error and no truncation
signal**. A query matching 3,833 rows returns 1,000, indistinguishable from
one that genuinely matched 1,000. A truncated read looks exactly like a real
data gap.

Shipped three times: PR #63 (library hydration), and both lookups in
`scripts/reportUserCollectedCoverCoverage.js` (the 15.86% above).

**The recurrence is structural.** There were *eleven separate local copies*
of a `fetchAllPages` loop across `src/` and `scripts/`, and `src/` had no
shared one. Everyone who hit the bug wrote a private fix, so the next person
had nothing to import and wrote an unpaginated query. The safe path was
invisible.

`src/lib/supabase/fetchAllPages.js` now exists as that shared path (PR #90).
**Consolidating the other ten copies onto it is open and unstarted**, and is
a real efficiency win: it removes the conditions that keep recreating the
bug.

Currently over the cap: The Beano (3,833 covers), Micky Maus (2,830),
2000 AD (2,480), Four Color (1,321). Four more series are within 200 rows.
**The trigger is "more covers per series", so this activates as coverage
improves.**

**The sibling bug: offset pagination with no `ORDER BY`.** Postgres makes
no promise about row order between two queries that do not sort, so
consecutive `.range()` pages over an unordered result overlap and skip
rows arbitrarily. No error, no truncation signal — just the wrong set.

Found live 2026-09-22 in `refreshSeriesSearchCache.js`'s "Distinct cover'd
series" stat. Back-to-back runs against the same unchanged table returned
**5,762** and then **5,031**. With `.order("id")` added it returns
**7,589** twice. The number it had been printing was not merely unstable,
it was understating by roughly a quarter, and it is the figure quoted when
anyone asks how many series have any cover at all.

**If a loop calls `.range()`, it needs a stable sort on a unique column.**
Treat an unordered paginated walk exactly as seriously as an unpaginated
one, and re-check any number that came out of one.

### 2b. Head-of-line blockage in the ingest queue

`comicvine_api_to_supabase.py` walks a `gap-*.json` in file order, skips
targets in `.ingest-done.json` for free, and stops at `--max-search-calls`.
Targets that fail to resolve are deliberately **not** marked done (so they
are not lost forever), but if nothing defers them they sit at the head of the
queue and re-consume the whole budget every hour, forever.

This took the pipeline down 27 hours (2026-09-19 to 09-20). Symptom:
byte-identical lane output across consecutive runs, `search=30 volume=0
issues=0`, and a done-ledger count that never changes.

Fixed by a retry-backoff (PR #86) keyed on `(name, publisher, year)`,
persisted in `needs_volume_id.json`, escalating 1/3/7/14/30-day windows. It
survives gap-file regeneration because it keys on target identity rather
than queue position.

**Diagnostic:** if covers stop appearing, compare the `Finished cleanly.
Counters:` line across two consecutive runs. Identical counters means the
queue is not advancing.

### 2c. GitHub Actions scheduler unreliability

Documented at length in `cover-ingest.yml`'s own header. `schedule:` triggers
fire late or not at all, sometimes for days. The repo works around it with an
external cron service posting to the workflow dispatch endpoint, plus
`cron-watchdog.yml`.

`pr-ci.yml` also intermittently fails to trigger on PR open/push — GitHub
never creates the check suite at all. Confirmed via the Actions API, not
inferred. Workaround: push one empty commit to nudge; if that fails, run the
equivalent checks locally (`npx eslint`, `npm run test:cover-match`,
`npm run build`, `npm run docs:check`) and say that is what you did.

**Do not treat a missing check as a code problem before querying the Actions
API for whether a run was ever created.**

---

## 3. Workflow inventory

| Workflow | Schedule | Purpose | Known issues |
|---|---|---|---|
| `cover-ingest.yml` | hourly `0 * * * *` | six ingest lanes, auto-repair, health checks | see 2b. The health check correctly fails the job on zero new covers in 24h |
| `weekly-refresh.yml` | Mon/Thu `0 9 * * 1,4` | search-cache rebuild (`--force --max-batches=700`, cursor persists, ~3 cycles for a full rotation), regenerates gap-width/depth | hit Postgres statement timeouts until the 0027 index landed |
| `gap-probe.yml` | Mon/Thu `0 8 * * 1,4` | resolves the needs-volume-id backlog into `gap-pinned.json` | **collides with cover-ingest at `:00`** — both write `needs_volume_id.json`. PR #89 puts them in one concurrency group |
| `nightly-cover-report.yml` | 06:00 UTC | writes `reports/cover-coverage-history.json` + HTML | the canonical answer to "where are covers at" — read it rather than re-deriving |
| `cron-watchdog.yml` | — | force-dispatches overdue workflows | grace windows live in `scripts/cronWatchdog.js` |
| `instagram-post.yml` | — | posts an issue to Instagram | **never audited. The founder asked for an "Instagram bot refinement" and never specified what. Ask, do not guess.** |
| `gcd-issue-refresh.yml`, `snapshot-collection-value.yml`, `pr-ci.yml` | — | metadata refresh, value snapshots, PR checks | |

---

## 4. Database facts that bite

- `canonical_covers` is ~121k rows. The index on `(series_title, id)` was
  added 2026-09-18 (migration 0027) because `series_title` was unindexed
  while being the column the search-cache refresh filters on. Without it both
  `cover-ingest` and `weekly-refresh` failed intermittently with Postgres
  `57014` statement timeouts, at a rate that grew with the table.
  **If you add a query filtering `canonical_covers` by a new column, check it
  is indexed.** At this size an unindexed filter is a scan, and the symptom
  is a red workflow, not a slow page.
- **Migrations are applied by hand.** There is no migration runner; files live
  in `scripts/migrations/`. The service-role key can read and write rows but
  **cannot execute DDL** — no connection string, no `psql`, no SQL-executing
  RPC (all verified 2026-09-18). Schema changes go through the Supabase
  dashboard, which means the founder runs them.
- `series.featured_cover_path_cached` is what `/api/search/series` renders as
  the thumbnail. The invariant "no storage_path is the featured cover for more
  than one series" is enforced by a reconciliation pass in
  `scripts/refreshSeriesSearchCache.js`, **not** by in-memory state. Per-batch
  in-memory bookkeeping is precisely what failed before.
- `user_collections.user_cover_url` already exists and renders in library,
  public profile, PDF export and issue pages. User-uploaded photos attach to
  that user's own copy and **never** write to `canonical_covers`, so a user
  uploading a variant or omnibus photo cannot pollute anyone else's view.
  This matters for any user-contribution feature work.

---

## 5. Non-negotiable conventions

- **Worktrees, not branches.** A pre-commit guard blocks committing on a
  branch in the primary checkout. Use
  `git worktree add .worktrees/<topic> -b agent/<topic> main`, then copy
  `.env.local` in (it is gitignored, so a fresh worktree lacks it) and run
  `npm ci`.
- **Never enable auto-merge.** Every PR gets human review.
- **A fix does nothing until merged.** Say so explicitly when reporting.
- CI lints *whole files*, not diffs, so pre-existing lint errors in a file you
  touch will block your PR. Run `npx eslint` on everything you edit.
- **Do not commit** `.ingest-done.json`, `needs_volume_id.json`, or
  `comicvine_api_output/issues_uploaded.csv` from a PR branch. The hourly
  workflow owns and commits those; including them fights the cron.
- Report user-visible changes separately from backend/infra changes.
- Never claim verification you did not perform. An honest "got to 34%, here is
  what blocks the rest" is worth more than an inflated number.

---

## 6. Security notes

- Secrets live in `.env.local` (gitignored) and GitHub repo secrets. **Never
  write secret values into a file, commit, PR body, or report.** Reference
  them by variable name only.
- The service-role key bypasses RLS. Treat any script using it as
  production-write-capable, including ones that look read-only.
- A blog defacement incident occurred 2026-08-05 via compromised admin auth.
  RLS itself was confirmed solid, the key was rotated, root cause never
  confirmed. Admin and blog write paths are correctly gated server-side
  (re-verified 2026-09-16) — keep it that way. A client-side-only gate is a P0.
- **Unverified, worth closing:** `blog_posts` and `blog_comments` have no
  tracked migration, so their RLS policies were never statically confirmed. A
  live test was blocked by the safety classifier. Confirm in the Supabase
  dashboard that comment INSERT is restricted to `authenticated` with
  `user_id = auth.uid()`, and that posts are admin/service-role only.
- Harmless but startling: the installed `dotenv` (v17.x) prints random
  promotional tips on every load, including one advertising an external
  "auth for agents" service. It is genuine upstream package behaviour, not a
  compromise. Do not follow it.

---

## 8. Growth: analytics, mailing list, email, traffic

Added 2026-09-21 at the founder's request. All figures below were measured
live that day, not estimated.

**The denominator to keep in mind: 28 registered users and 1 newsletter
subscriber.** At this scale, traffic acquisition matters more than conversion
optimisation. Do not spend effort A/B-testing a funnel that 28 people have
walked.

### 8a. Google Analytics — measuring the wrong half

GA is wired (`NEXT_PUBLIC_GA_MEASUREMENT_ID`, loaded production-only from
`src/app/layout.js`, thin `trackEvent` wrapper in `src/lib/analytics.js`).

Until 2026-09-21 it fired exactly five custom events, all post-signup
(`signup_completed`, `pro_upgrade`, `pdf_export`, `grade_set`,
`collection_add`), so it could answer "what do existing users do" but not
"where do strangers drop off".

**The pre-signup funnel is now instrumented** (PR `agent/growth-funnel`,
2026-09-21). The full event inventory lives at the top of
`src/lib/analytics.js` and is the place to keep it current. New events:
`cta_click` (home CTAs), `search` (GA4's recommended name, with
`search_term` + `result_count`), `search_result_click`, `series_view`,
`issue_view`, `signup_started` (first form focus) and `signup_error` (with a
`reason`). Every one carries `logged_in` where it makes sense, so anonymous
and signed-in behaviour can be split in GA. Not yet instrumented: newsletter
form seen/submitted, because the form is not rendered (see 8b).

Note `trackEvent` no-ops silently when `gtag` is absent (ad blockers, local
dev), so expect real-world undercounting and do not treat GA as a source of
truth for absolute numbers.

### 8b. Mailing list — collection works, sending does not exist

`newsletter_subscribers` (migration 0019) is **well built**: unique
normalised email, `source`, `subscribed_at`, `unsubscribed_at` for
unsubscribes, RLS enabled with all privileges revoked from `anon` and
`authenticated` so only the server-side service client writes. The API route
is `src/app/api/newsletter/route.js`. The form's code is in
`src/components/Footer.js` but **it is not rendered**: it was hidden (not
deleted) because it promised monthly emails nothing could send. So there is
currently no signup surface at all.

Two concrete gaps:

1. **1 subscriber, sourced `footer`**, from before the form was hidden. When
   it comes back, the footer is the lowest-visibility position on the site.
   The `source` column exists specifically to compare placements — use it.
   Candidate surfaces: post-signup, after a first collection add, on
   `/reads/[slug]` blog posts, an interstitial on the public profile share
   link.
2. **There is no email-sending infrastructure at all.** No Resend, SendGrid,
   Postmark, Mailgun or nodemailer anywhere in `package.json`, `src/` or
   `scripts/`. The only mail currently sent is Supabase's own auth mail
   (confirmation, password reset). **A monthly send requires choosing and
   wiring a provider first** — that is the blocking task, not list growth.

When wiring one: the send job belongs in GitHub Actions like the other cron
work, the provider key goes in repo secrets (never in a file), and
`unsubscribed_at` must be honoured on every send. One-click unsubscribe is a
legal requirement for bulk mail, not a nicety.

### 8c. Blog — stalled, and it is the SEO asset

Posts and dates, newest first:

| date | slug |
|---|---|
| 2026-08-28 | august-2026-build-update |
| 2026-08-04 | reading-guide-doomsday-secret-wars-x-men |
| 2026-05-06 | may-2026-build-update |
| 2026-04-04 | dev-blog-april-2026 |
| 2026-03-05 | march2026update |

Roughly monthly, then **nothing for about four weeks**. Posts render at
`/reads/[slug]` with `generateMetadata`, so they are indexable and are the
cheapest organic-traffic lever available. Note the mix: the one
non-build-update post (a reading guide) is the only piece written for
readers rather than for the founder's own changelog. Reading guides and
"which issues matter" content target searches people actually run; build
updates do not.

### 8d. SEO foundation

Already present: `src/app/robots.js` and `generateMetadata`/openGraph on
`src/app/layout.js`, `src/app/issue/[id]/layout.js`,
`src/app/series/[id]/layout.js`, `src/app/reads/[slug]/page.js`. Series
titles, descriptions and canonicals were spot-checked distinct per page on
2026-09-21.

**The sitemap was the gap.** Until 2026-09-21 `src/app/sitemap.js` emitted
19 static URLs and nothing else: no series, no blog posts, no reading
guides. It is now a sitemap index (`src/app/sitemap.xml/route.js`, same
entry URL robots.txt and Search Console already use) pointing at
`/sitemaps/static.xml` (static routes + `/reads/*` + published `/blog/*`)
and 16 `/sitemaps/series-<hex>.xml` chunks split by UUID prefix, each
cached a day. Logic is in `src/lib/sitemap.js`. Verified live against the
dev server: all 16 chunks sum to **45,985** series URLs, zero duplicates,
equal to the exact count of allowlisted series, so the §2a 1000-row cap is
not in play. Issues (2.5M) are still not enumerated, deliberately.

Still worth doing: resubmit `/sitemap.xml` in Search Console after this
deploys and watch the indexed-page count over the following weeks. That is
the number that says whether it worked.

### 8e. Sequencing suggestion

Ordered by "blocks the next thing" rather than by appeal:

1. ~~Instrument the pre-signup funnel in GA.~~ Done 2026-09-21 (8a).
2. ~~Fix the sitemap.~~ Done 2026-09-21 (8d). Resubmit in Search Console.
3. ~~Build the `<AdSlot />` house-ad slots.~~ Done 2026-09-21 (PR
   `agent/adslot`). `src/components/AdSlot.js` + inventory in
   `src/lib/houseAds.js`; positions `HOME_INLINE`, `SEARCH_INLINE_1` (after
   two grid rows), `SERIES_INLINE_1` (after one row), `ISSUE_INLINE_1`
   (page bottom). Grid placement is CSS `grid-row`, not "after N cards", so
   it never orphans a card at any width. Four house ads (Founding, Pro
   value, contribute, reading guides), upsells hidden from Pro/Founding.
   Events `house_ad_view` / `house_ad_click` give CTR per creative per
   position. **A newsletter creative is not in rotation yet** because the
   form is hidden (8b); add it with step 4. **Before any paid ad goes in a
   slot:** `src/app/upgrade/page.js` tells Pro subscribers the $8 buys "no
   ads". That copy is a positioning decision the founder makes on purpose.
4. Pick and wire an email provider (Resend is the obvious fit). Nothing about
   "monthly emails" can start until this exists. Then re-show the newsletter
   form, tagging placements by `source`.
5. Resume the blog, weighted toward reader-facing content over build updates.

---

## 7. State as of 2026-09-21

**PRs #84, #88, #89, #90 and this handoff (#91) all merged 2026-09-21.**
Nothing is open. For the record, what they were:

- **#84** — migration 0027, the `canonical_covers(series_title, id)` index
  (already applied in production before the PR; bookkeeping + CLAUDE.md fix).
- **#88** — user-collected cover lane wired first; fixed the metric that
  reported 15.86% instead of 97.28%; fixed `gap-probe.yml` never writing its
  file.
- **#89** — shared concurrency group for the two workflows that write
  `needs_volume_id.json`. **Still only provable at the next Mon/Thu 08:00
  window**: check that the collision did not recur.
- **#90** — paged the series-page cover lookups; added
  `src/lib/supabase/fetchAllPages.js`.

**Live in production:** cover collisions are fixed (7,550 series, 7,550
distinct paths, 0 collisions, verified by direct query). The ingest pipeline
is producing covers again. The 0027 index is applied.

**Coverage as of 2026-09-20:** ~36.8% of allowlisted catalog issues;
**97.28%** of issues actually in a user's library.

**On the coverage goal:** 100% catalog coverage is the founder's goal and he
does not want it relitigated. An earlier argument that the ~200 req/hr
ComicVine ceiling made this infeasible was **wrong and was retracted** — it
was derived from a throughput number that the head-of-line blockage bug had
depressed, i.e. using our own defect as evidence against the goal. The
ceiling only binds when calls are *productive*. **Hit rate, not request
volume, is the real lever.** Recent runs spend 30 search calls to land ~22
issues, and a meaningful share of the misses are publisher-string mismatches
(the `UDON` vs `Udon Entertainment Corp.` class) where the volume exists and
we simply fail to recognise it. That category is fixable and makes every call
worth more.

**Untouched and squarely in the new scope:** Instagram bot refinement
(unspecified — ask), blog cadence, marketing calendar, ads. None audited or
planned.

**Collected editions (2026-09-21):** GCD has separate series records for a run and its trade paperbacks, same name. 616 ComicVine volumes are pinned by more than one `series` row, mostly this pattern; the TPB row shows the monthly's cover and issue count in search and lands users on a page with no covers (Fables). Fix shipped as migration 0028 + `syncGcdSeriesFormat.js` (throttled GCD API, `gcd-series-format-sync.yml` runs it 4x/day) + `unpinCollectedEditions.js` (run by hand once the shared-pins backlog is synced, dry-run first) + read-path guards. `src/app/api/comics/route.js:182` still has an unpaginated `gcd_issues` `.in()` of the same shape that bit `repairAllCoverSeriesLinks.js`.

**Known open, not started:** consolidating the ten remaining `fetchAllPages`
copies; the mid-run title-split attribution problem (see
`docs/cover-ingestion-next-steps.md` §8, worked example Rai); roughly 800
unresolvable ingest targets needing manual `--volume-id` pinning; the
publisher-mismatch backlog.

---

## 9. Open work, consolidated (end of 2026-09-21)

Everything agreed with the founder today, in one place. Founder decisions
that day: primary user is the **run completer / hunter**; voice is **"fan
with some knowledge"** in the founder's own register (a little sarcastic,
good natured, funny; his Feb-2026 blog posts are the reference); social
means follow + activity feed, compare/compete, and talk (not shareable
cards).

### Data integrity (covers)

1. **Every issue in a user's library must have its cover.** The 97.28%
   user-collected figure hides classes of miss. Found live on
   `/u/treystyles`: *The Transformers Universe* (GCD 11216, pinned to the
   wrong ComicVine volume 20559) shows no covers while the 4 real covers sit
   on the duplicate GCD record *Transformers Universe* (199403, volume
   33530). The title-path lookup is an exact string match, so a leading
   "The" defeats it. **Lookup half fixed 2026-09-22** (PR
   `agent/cover-lookups`): `titleVariants()` in `src/lib/titleMatch.js`
   (punctuation + leading-article variants) is now used by the issue and
   series routes and by library-hydrate / public-profile, with
   `normTitle()` map keys. treystyles' profile went 111/116 -> 114/116
   covers; the 2 left (Marvel Tales #188, G.I. Joe Comics Magazine #1)
   have no cover in the catalog at all. **Still open:** the user-collected
   gap lane should verify a cover *resolves on the page* for each library
   issue instead of trusting the pin, and report the residue as a list,
   not a percentage. `refreshSeriesSearchCache.js` Tier 3 still matches
   exact titles.
2. **Collected editions** (this PR): after migration 0028 is applied and
   `gcd-series-format-sync.yml` has walked the shared-pins backlog (~1 week
   at 4x60/day), run `node scripts/unpinCollectedEditions.js` (dry run,
   read the plan, then `--apply`). Then the dup-titles backlog (months).
3. **616 volumes pinned by more than one series row.** Item 2 handles the
   collected-edition share; the remainder are wrong pins of the
   Transformers Universe kind and need a pin audit (year + issue-count
   sanity vs the ComicVine volume).
4. `src/app/api/comics/route.js`: was paginated after all, but ordered by
   `gcd_id` under an `IN (series_gcd_id)` filter (the 4.5s/page plan);
   reordered 2026-09-22. Consolidating the local `fetchAllPages` copies onto
   `src/lib/supabase/fetchAllPages.js` (with a keyset mode) is still open.
   This item was originally filed as "unpaginated `gcd_issues` `.in()`",
   which was wrong. What remains is a duplication cleanup, not a truncation
   bug — nothing is returning short counts because of it. Do not re-file it
   as urgent.
5. **Re-measured 2026-09-22**, superseding LAUNCH_CHECKLIST's "2,783
   ambiguous volumes" (which came from the truncated instrument). Honest
   figures from `repairAllCoverSeriesLinks.js --dry-run`: **1,022** volumes
   need resolution, of which 823 had no candidate clear 85% and 90 are
   ambiguous within 15 points; 2,855 candidate pairings were excluded by
   the year gate; 109 have a same-start-year series that did not win.
   **0 volumes would actually be relinked**, so the mislink check is green.
   The checklist has been updated with this table.
6. ~~`refreshSeriesSearchCache.js` Tier 3 is still exact-title matching~~
   **Corrected 2026-09-22: also wrong.** Tier 3 keys on `normTitle()`
   (lowercased, punctuation-stripped, leading article removed) and the
   cover fetch is already expanded with article and punctuation variants.
   The one genuine gap was that those two transforms were never applied
   *together*, so a title with both a leading "The" and punctuation never
   had its fully-normalized form fetched. 2,222 titles are shaped that way,
   but measuring it found only 1 title and 1 cover affected in a
   1,200-title sample ("The Army of Darkness: Forever" vs "Army of Darkness
   Forever"). Closed by switching that fetch onto `titleVariants()` from
   `src/lib/titleMatch.js`, which #102 added and which already covers the
   combined case — one shared helper instead of two partial copies.

### Growth (order agreed with the founder)

7. **Email provider**: built 2026-09-22 (PR `agent/newsletter`):
   `scripts/sendNewsletter.js` (Resend batch API, honours `unsubscribed_at`,
   signed one-click unsubscribe in footer + RFC 8058 headers, `.sent.json`
   ledger), `/api/newsletter/unsubscribe`, `NewsletterSignup` component
   with `source` tagging, form back in the footer, `/newsletter` landing
   page, newsletter house-ad creative, `newsletter-send.yml` (manual).
   First issue drafted at `content/newsletter/2026-10-first-issue.md`.
   **Still the founder's:** verify `comixcatalog.com` in Resend (DNS), add
   `RESEND_API_KEY` + `RESEND_FROM_EMAIL` to GitHub secrets and Vercel,
   `--test` yourself, then send.
8. **Instagram bot rewrite.** Current output (random cover + ComicVine
   solicit blurb + "Est. cover-price floor: $3.50" + generic CTA) rejected
   by the founder as "the same bland post template". Also: a brand card
   says "the database is the moat" on a public post; a "New to the Catalog"
   post featured a trade collection. Rewrite around *why this book
   matters* (key issues, first appearances, creator runs, arcs, "cost to
   complete" hooks), in the founder's voice. Files:
   `scripts/instagramBot.js`, `scripts/previewInstagramQueue.js`,
   `docs/instagram-bot-plan.md`.

   **Shipped in #99, live 2026-09-22.** First founder-voice post went out
   at 19:12 UTC (The Avengers #1, 1963, key-issue format, media id
   18121853023936440). Note for next time: #99 merged at 03:38 UTC, three
   hours *after* that day's post had already fired at 00:25, so the change
   looked dead all day. The `.instagram-last-post-date.json` marker has to
   be rolled back and the workflow dispatched if you want a same-day post
   after a merge.
9. **Blog, reader-facing cadence.** Founder wants: (a) how-to-use-the-site
   posts with screenshots; (b) how to get into / back into comics (his own
   story: asked a Graham Crackers Comics clerk, got pointed at House of M,
   loved it); (c) hunter angles ("what it costs to complete X", "cheapest
   way into Y"). Blog posts live in `blog_posts` (publish via
   `scripts/publishBlogPost.js`); reading guides in
   `src/app/reads/articles.js`.

   **(a) and (b) published 2026-09-22**: `/blog/how-to-use-comixcatalog`
   (611 words, 5 screenshots already in Supabase storage) and
   `/blog/getting-back-into-comics` (890 words). (c), the hunter angles,
   is still unwritten and is the natural next post.
10. **Positioning brief** (one page) from the founder's answers above, then
   scope the collection-insights + social features: cost to complete,
   cheapest path, paid vs worth, upgrade candidates, publisher/era/creator
   fingerprint, streaks; follow/feed, compare, talk.
11. **Ads**: house-ad slots are live (#95). No AdSense until traffic
    justifies it and the upgrade-page "no ads" copy decision is made on
    purpose. Direct sponsorship is the goal once GA shows real numbers.
12. **Watch the instruments**: Search Console indexed-page count and crawl
    requests (baseline 138 / 90 days), GA4 Realtime for the funnel events,
    `house_ad_view`/`house_ad_click` CTR per creative.

### Housekeeping

13. ~~Leftover QA test account `oauthfixver178927334` (1d9fad1a…)~~
    **Done 2026-09-22**: founder ran `scripts/deleteTestAccount.js --apply`
    and the row is gone, verified by query. Rule going forward stands: a QA
    pass deletes its own test accounts and proves it with a query.
14. Handoff §7's "#89 only provable at the next Mon/Thu 08:00 window" is
    still open: check the collision did not recur.
15. **The stall check was the flakiest step in the pipeline, not the
    pipeline.** The 2026-09-22 03:00/06:00 cover-ingest failures were
    `checkCoverIngestHealth.js --mode=stall` timing out during a transient
    Supabase `PGRST002` degradation, on a full COUNT of `canonical_covers`
    over an unindexed `created_at`. PR #104 makes it a one-row primary-key
    probe (455ms vs 8s) and prints `code | message | details | hint`
    instead of "unknown error". General lesson, third time now: **a health
    check that costs more than the work it guards will eventually lie about
    the work.**
