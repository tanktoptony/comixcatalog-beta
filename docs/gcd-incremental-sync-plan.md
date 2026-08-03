# GCD Incremental Sync — Implementation Plan

**Status (2026-08-03):** Planning. Do not start Phase 2 (any live request against comics.org) until the blocking prerequisite below is cleared by a human.

**Goal:** Stop `gcd_issues` from being a frozen one-time dump. Build a targeted, polite, incremental sync that pulls *new* issues for series we already track from GCD's live per-series/per-issue JSON API, instead of requiring a manual full-database re-download to see anything current.

---

## 0. Why this exists

`gcd_issues` was populated once from a GCD Postgres dump (see CLAUDE.md's Data Sources section) and nothing in this repo has ever written a new row into it since. Confirmed empirically 2026-08-03:

| Series | Our `gcd_issues` ceiling | Live GCD data |
|---|---|---|
| Absolute Batman (`series_gcd_id` 216143) | issue #11, Oct 2025 | issue #21–22, Aug 2026 |

That's an 11-issue gap on one of the site's most-collected current books, and it's structural — every series in the catalog is frozen at whatever the original dump captured, with no mechanism to move forward. The weekly cache-refresh job (`scripts/refreshSeriesSearchCache.js`) only recomputes `series.*_cached` columns from what's already in `gcd_issues` — it cannot surface an issue that was never ingested in the first place.

## 1. What we confirmed works, technically

GCD has a real, live JSON REST API, separate from the Cloudflare-walled `files1.comics.org` cover-image host that CLAUDE.md already flagged as a dead end. Verified live 2026-08-03 with a browser-UA `curl`, `Accept: application/json`:

**`GET https://www.comics.org/api/series/<gcd_id>/`** — returns, among other fields:
```json
{
  "name": "Absolute Batman",
  "year_began": 2024,
  "year_ended": null,
  "publisher": "https://www.comics.org/api/publisher/54/",
  "active_issues": ["https://www.comics.org/api/issue/2663120/", "...", "https://www.comics.org/api/issue/2842928/"],
  "issue_descriptors": ["1 [Nick Dragotta Cover]", "1 [Jim Lee & Scott Williams Cardstock Variant Cover]", "...", "22 [Werther Dell'Edera Cardstock Variant Cover]"]
}
```
`active_issues` and `issue_descriptors` are parallel arrays — one entry per printed *variant*, not one per logical issue number (matches how our own `gcd_issues` is already structured; multiple rows share the same `issue_number` for different covers/printings, and `scripts/refreshSeriesSearchCache.js`'s `baseIssueNumber()` already dedupes this correctly — see §4, keep that behavior).

**`GET https://www.comics.org/api/issue/<gcd_id>/`** — returns, among other fields:
```json
{
  "series": "https://www.comics.org/api/series/216143/",
  "number": "21",
  "publication_date": "August 2026",
  "key_date": "2026-08-00",
  "indicia_publisher": "DC Comics",
  "cover": "https://files1.comics.org//img/gcd/covers_by_id/1839/w400/1839690.jpg"
}
```

**Confirmed the join key lines up**: our existing `gcd_issues.gcd_id` column (e.g. `2764132`) is the *same numeric ID* used in the API's `/api/issue/<id>/` URLs — spot-checked against a real row (Absolute Batman #11, `gcd_id=2764132`, which appears verbatim in that series' live `active_issues` list). Diffing "what we have" vs. "what's live" is a straightforward set difference on this id, no fuzzy matching needed.

Field mapping to our schema:

| Our `gcd_issues` column | API field | Notes |
|---|---|---|
| `gcd_id` (PK) | numeric id in the issue URL | e.g. `.../api/issue/2842928/` → `2842928` |
| `series_gcd_id` | numeric id in `series` URL on the issue payload | `.../api/series/216143/` → `216143` |
| `issue_number` | `number` | direct copy |
| `publication_date` | `publication_date` | direct copy, same free-text format we already store ("August 2026") |
| `key_date` | `key_date` | direct copy, same `YYYY-MM-00`-ish sortable format we already store |
| `publisher_gcd_id` | `indicia_publisher` (a **name**, not an id) | needs a lookup against `gcd_publishers.name` — see open question in §5 |

## 2. Blocking prerequisite — do not skip

`https://www.comics.org/robots.txt` explicitly disallows Anthropic's crawler:
```
User-agent: ClaudeBot
Disallow: /
```
(along with GPTBot, Google-Extended, CCBot, Amazonbot, and most other AI/crawler bots — the general `User-agent: *` block is `Allow: /` with `Content-Signal: ai-train=no`.)

**Do not write code that spoofs a browser user-agent to route around this.** That's evasion of an explicit, vendor-targeted restriction, not a gray area.

Before any live request against comics.org (including a "harmless" dry-run test):
1. A human on this project reaches out to GCD about this specific use case — the `gcd-tech` Google Group is where the API was originally announced and is the right place to ask. Describe it plainly: a collector-database site doing polite, rate-limited, per-series polling to keep already-tracked series current, not bulk re-scraping, not AI training.
2. Get an explicit go-ahead, and use a real, identifying `User-Agent` string (project name + contact method), not a generic browser UA.
3. Only then does Phase 2 (implementation) start. Until that happens, this doc is design-only.

If you're an agent picking this up: if step 1–2 haven't visibly happened (check for a reply/confirmation the human should attach to this doc or reference in the PR), **stop and ask**, don't proceed on the assumption it's fine.

## 3. Scope for this slice

**In scope:** incremental sync for the ~80 series in `src/lib/featuredSeries.js` (the homepage carousel / highest-visibility titles — exactly where staleness is most painful and most visible to users, per the Absolute-line investigation that motivated this).

**Explicitly out of scope for this slice:**
- Full-catalog sync (217k series). That's a follow-up phase, and needs its own rate-limit/runtime budgeting once this slice proves out.
- Discovering *new* series GCD doesn't have from us at all (that's `scripts/probeNewReleases.js` / `gap-probe.yml`'s job — different problem, different data source, don't conflate).
- Replacing `canonical_covers`/ComicVine cover ingestion. This slice only touches issue *metadata* (`gcd_issues`), not cover images. GCD's `cover` field is a bonus data point, not something to build a new ingestion path around here.

## 4. Technical design

New script: `scripts/syncGcdIssuesIncremental.js` — follow the existing raw-Node-script conventions in this repo (`scripts/refreshSeriesSearchCache.js`, `scripts/instagramBot.js`): `dotenv.config({ path: "../.env.local" })`, relative imports only (no `@/` aliases — these run outside Next.js), a `--dry-run` flag that computes and logs without writing, `runWithRetry`-style backoff on transient Supabase errors (copy the pattern from `refreshSeriesSearchCache.js:60-89`, don't reinvent it).

Flow:
1. Load `FEATURED_SERIES` from `src/lib/featuredSeries.js`. Resolve each entry to a `series.gcd_id` — reuse the exact matching logic in `scripts/validateFeaturedSeries.js`'s `findBestMatch()` (title + publisher + closest `year_start_cached`), don't rewrite it from scratch.
2. For each resolved `gcd_id`, `GET /api/series/<gcd_id>/`. Rate-limit between requests — mirror `comicvine_api_to_supabase.py`'s `--vol-sleep` pattern (start conservative, ~1 req/sec or slower; tighten only after the human contact in §2 confirms what's acceptable).
3. Extract the numeric issue ids from `active_issues` URLs. Diff against `SELECT gcd_id FROM gcd_issues WHERE series_gcd_id = <id>` — anything live-but-not-local is new.
4. For each new issue id, `GET /api/issue/<id>/`, map fields per the table in §1, resolve `publisher_gcd_id` via a `gcd_publishers.name` lookup (build an in-memory name→id map once per run, don't query per-issue).
5. Upsert new rows into `gcd_issues` (insert-only is fine for a first pass — these are genuinely new ids that can't collide with existing rows).
6. After a series' issues are updated, call the existing `scripts/refreshSeriesSearchCache.js --only-ids=<that series' UUID>` (as a subprocess, same pattern already used successfully for the manual Absolute-line fix on 2026-08-03) so the cached columns and featured cover pick immediately reflect the new data — don't leave the raw table updated but the cache stale, that just moves the same staleness bug one layer down.

## 5. Open questions to verify empirically before considering this done

- **Publisher name matching quality**: does `indicia_publisher` ("DC Comics") match `gcd_publishers.name` cleanly for the publishers that matter (DC, Marvel, Image, etc.), or does it need the same fuzzy normalization already used elsewhere (see `normalizePublisherForMatch()` in `refreshSeriesSearchCache.js`)? Test against a handful of real series before assuming a raw equality match is enough.
- **Pagination**: does `active_issues` ever get paginated for a very long-running series (Detective Comics, Action Comics — 900+ issues), or is it always a flat array? The Absolute Batman response (22 issues × ~9 variants ≈ 200 entries) was a single flat array with no `next` cursor — confirm this holds for a long-runner before assuming it always will.
- **Auth**: no API key or auth header was needed for the requests made during investigation. Confirm this stays true, and check whether an unauthenticated client gets a lower/different rate limit than an authenticated one — worth asking about in the §2 outreach.

## 6. Rollout

- Ship as `workflow_dispatch`-only initially (no `schedule:` trigger) — same pattern as the other workflows in `.github/workflows/`, but deliberately not cron'd yet.
- First run: `--dry-run` against the full featured list, human reviews the diff output (what would be inserted, per series) before any live write happens.
- First live run: still manual (`workflow_dispatch`), human spot-checks 2-3 series afterward the same way the Absolute-line investigation did (compare `gcd_issues` count/max issue vs. what's visibly live on comics.org for that series).
- Only add a `schedule:` cron once a few manual runs look correct and the human is comfortable — nightly is a reasonable eventual cadence, matching the reasoning already used for the featured-list problem.

## 7. Acceptance criteria

- [ ] Human sign-off from GCD outreach obtained and referenced (§2) before any code runs against comics.org.
- [ ] `--dry-run` output for all ~80 featured series reviewed and looks correct (no obviously wrong series/issue matches).
- [ ] A live run against the 6 Absolute-line series (`ddcf3771-89ff-45db-92a8-f52ed3f09e05`, `b39ac902-b608-4671-b9e2-ab583c193fea`, `e674dd96-765f-47c3-b33e-9b0632e57015`, `3f37342c-babe-43f3-97a0-f32f33b17a35`, `f87d6f3b-5443-499a-8379-c8d967fe6839`, `93966542-9d3b-4fe4-97a2-a278c67f1410` — same ids from the 2026-08-03 manual fix) brings Absolute Batman to its real current issue count (≥21, not 11).
- [ ] `refreshSeriesSearchCache.js --only-ids=` re-run confirmed to reflect the new issue count and pick an appropriate featured cover.
- [ ] Workflow lands as `workflow_dispatch`-only; no `schedule:` added in this PR.
