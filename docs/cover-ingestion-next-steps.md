# Cover Ingestion — Next Steps

**Companion to:** [docs/cover-ingestion-audit-findings.md](./cover-ingestion-audit-findings.md) (the evidence this list is built from).
**Status (2026-09-12, corrected — see note below):** Items 1, 2, and 5 were fixed the same day this list was written (2026-08-10) and this doc simply never got updated — found during a 2026-09-12 docs audit, a month later, with the fixes already live and working. Items 3 and 4 are still genuinely open. Ranked by leverage, not by order-you-must-do-them.

> **Why this matters beyond the individual items:** this doc sat wrong for a month across however many agent sessions touched this repo in between, none of which checked it against what had actually shipped. That's the concrete failure mode behind the "leaky cross-agent workflow" problem raised 2026-09-12 — docs don't travel with the work unless something forces a check. See `PROJECT_STATUS.md` / the engineering-workflow doc for whatever process fix comes out of that.

---

## Punch list

**1. ✅ Fixed 2026-08-10** — `needs_volume_id.json` persistence. Landed in `ff963a2` / `f9fea19` the same afternoon this punch list was written. `cover-ingest.yml`'s commit step now `git add -A`s it every run (see that workflow's own header comment).

**2. ✅ Fixed 2026-08-10** — done-ledger's wrong-rate problem. Both halves landed within 30 minutes of each other:
- Going forward: `ff963a2` ("trustworthy done-ledger") — `comicvine_api_to_supabase.py` now tracks `new_issue_attempts`/`new_issue_successes` per volume and only marks a target done if it was already fully covered or at least one new issue actually got a cover this run (see the `fully_stuck` check, ~line 1544). A volume where every attempt fails no longer gets silently locked out.
- Backward: `f9fea19` ("backward-clean the done-ledger of already-stuck entries") — swept the pre-fix backlog same day.

**3. Still open.** `ingestStatus.js`'s intermittent null-count bug. No fix commit found against this file since it was written (2026-06-16) — stop trusting any single run of it until this lands.

**4. Still open.** Quantify the publisher-corruption backlog properly using the ingester's own `_norm_publisher()`/alias logic instead of the audit's ad hoc string match.

**5. ✅ Fixed 2026-08-10, then superseded 2026-08-27.** The Wednesday-aligned weekly cadence landed same-day as items 1-2 (`ff963a2`), but `cover-ingest.yml` was later changed to hourly (2026-08-27) once the width/depth gap-target lists started refreshing reliably — see that workflow's own header for the reasoning. Cadence is now hourly ingest + twice-weekly (Mon/Thu, changed 2026-09-12) gap-list regeneration, not weekly-Wednesday. This item is closed, just not the way originally planned.

**Not urgent:** read-path consolidation (§1e of the original spec, `resolveCoverForIssue()` across 10 API routes) — a real gap but about display correctness, not ingestion throughput, so it doesn't block anything above it.

---

## 6. The disambiguation problem (added 2026-08-10, from live run #229)

A fresh run log showed 12 "volume not found" failures in one pass. These are **not one problem** — they split into three distinct failure classes that need three different fixes. Items 1-2 above only address one of the three.

### Class A — true multi-candidate ambiguity (item 1 above already covers this)
ComicVine has 2+ volumes with the same title/era and the ingester correctly refuses to guess. No alias table or code change fixes this — it needs a human `--volume-id` pick, one time, per title. This is exactly what persisting `needs_volume_id.json` unlocks: a reviewable batch instead of an infinite loop.
- Examples from run #229: `Inferno Girl Red`, `X-Men Annual`, `Disney Villains: Maleficent`, `Casper the Friendly Ghost`, `The Power of Shazam!` (2x).

### Class B — publisher-alias table gap (new, not covered by items 1-5)
The ingester found a single unambiguous ComicVine volume by title, but rejected it because the publisher didn't match — and the mismatch is a *real same-company/imprint relationship* the alias table (`PUBLISHER_ALIASES` in `comicvine_api_to_supabase.py:407`) doesn't know about yet.

Checked this directly against the DB: `Big Bruisers` and `Wildstorm Cliffhanger Sketchbook` both genuinely are WildStorm titles (GCD's own indicia agrees) from 1996/1998 — **before** WildStorm became a DC imprint in 1999, when it was published under Image. The existing table already has `{wildstorm, dc}` for the 1999-2010 era but has no pre-1999 `{wildstorm, image}` entry. Confirmed this is not the leftover blast-write corruption from the audit — `cv_publisher` is `null` on both rows, meaning neither has ever been successfully ComicVine-matched before, so this is a fresh, distinct gap.

**Fix:** add `frozenset({"wildstorm", "image"})` as a **separate** entry alongside the existing `frozenset({"wildstorm", "dc"})` — not merged into one three-way set. Keeping them separate means `wildstorm` matches either `dc` or `image`, but `dc` and `image` never become aliases of each other through this table. Merging them would be the unsafe version.

This table should get periodic small additions the same way — it's already designed for exactly this (see the comment at `comicvine_api_to_supabase.py:399-406`: each pair individually confirmed, deliberately not a fuzzy/prefix match). `Iron Man Battlebook: Streets of Fire` (Marvel target, ComicVine shows "Battlebooks Incorporated") is a *candidate* for the same treatment but needs one-off confirmation first — "Battlebooks" may be a genuine separate licensee (same shape as the `Marvel UK` exclusion already called out in that file's own comments), not a masthead alias.

### Class C — target itself is likely wrong (new, needs a different fix entirely)
Some "volume not found" failures aren't a ComicVine matching problem at all — the (title, publisher, year) tuple being requested looks wrong at the source, and no amount of retrying or aliasing will ever resolve it.
- `Scream (Marvel Comics)` — ComicVine's actual publishers for anything named "Scream" are Chick Publications, Dark Horse, IPC Magazines, and Skywald. None is Marvel, and they share no plausible relationship. One local `series` row does say `resolved_publisher_cached: "Marvel Comics"` (GCD, year 2020) — that's either a real GCD mis-attribution, or the actual ComicVine volume exists under a longer title (e.g. as part of an "Absolute Carnage" tie-in) that a bare "Scream" search won't find. Either way, retrying this target forever accomplishes nothing.
- `Okko (Archaia)` and `Delver (Dark Horse Comics)` are messier versions of the same thing — `Okko` alone has 7 different GCD series rows (`Unknown Publisher` x4, `Archaia` x2, a German `Carlsen Verlag` edition), none of which is "Delcourt" (what ComicVine actually shows). This is a real multi-edition mess (original French + German translation + English Archaia editions all sharing the plain title "Okko" in GCD) that needs one-off human research per row, not a systemic fix.

**These should stop being retried every 6 hours forever.** Right now they'll land in `needs_volume_id.json` (once persistence is fixed) right alongside the true-ambiguity cases, but they're not actually ambiguous — they're wrong or unresolved-at-the-source. Worth a `--volume-id`-style manual disposition step that lets a reviewer mark a target "source data problem, not a ComicVine problem" so it stops cycling back into the queue.

### Net effect on the punch list
Item 1 (persist `needs_volume_id.json`) shipped 2026-08-10, so Class A is now reviewable instead of evaporating — `gap-probe.yml`'s `resolveNeedsVolumeIdBacklog.js` walks it weekly. Class B still needs incremental, evidence-based alias-table additions (small, ongoing, not tracked as a discrete item anywhere — worth its own line if it keeps recurring). Class C still needs a way to mark a target "not ComicVine's fault" so it stops being re-attempted forever — not built as of this writing.

---

## 7. Onboarding a brand-new series (added 2026-09-17)

There was no written path for taking a series from "has a `series` row but zero covers and has never been targeted" to "actively covered by the hourly cron" — reconstructed this session from five different scripts while curating targets for a founder phone-QA pass. Worth writing down once instead of re-deriving it every time.

1. **Check current state.** `node scripts/lookupSeriesCandidates.js "Title"` is the read-only tool for this — it finds every `series` row matching a title substring and reports `gcd_id`, publisher, year, cached issue count, and a live count of distinct covered issue numbers from `canonical_covers`. Use it before adding anything, especially for ambiguous titles with multiple volumes/years/editions — it's how the Malibu Mortal Kombat one-shots and both "Evil Ernie: Youth Gone Wild!" rows (1992 Malibu vs. 1993 Chaos!) got disambiguated this session.

2. **Add a target.** For a one-off or a small named batch, append `{name, publisher, year}` objects to `gap-manual.json` — match the `name`/`publisher` strings to what `lookupSeriesCandidates.js` reports (publisher must be the exact `resolved_publisher_cached` string, not a raw GCD variant) so the ComicVine-side publisher gate in `comicvine_api_to_supabase.py` has something to match against. A `volume_id` field is optional (used when the ComicVine volume is already known, e.g. from `resolveNeedsVolumeIdBacklog.js`); most entries don't have one. For a broad sweep across many series in one publisher/franchise, prefer letting `scripts/generateCoverGapTargets.js --mode=width` (or `depth`) pick them up automatically instead of hand-curating dozens of entries — see the gotcha below on why this doesn't catch everything.

3. **What happens next.** `cover-ingest.yml` runs hourly and works through `gap-priority.json` → `gap-featured.json` → `gap-manual.json` → `gap-pinned.json` → `gap-width.json` → `gap-depth.json` in that order, each via `python comicvine_api_to_supabase.py --targets <file> --skip-existing`. `--skip-existing` makes adding a target idempotent — it costs near-zero once already covered, so there's no harm in adding something that might already be picked up elsewhere.

4. **Known gotcha: `gcd_id`-less series can't be auto-pinned.** A series row created via a minimal-row path — `probeNewReleases.js`'s inline series creation, or `backfillMissingSeriesRows.js` (both build a row from an orphaned `canonical_covers` title with no `series_gcd_id` link) — has `gcd_id: null`. Several downstream scripts filter on `gcd_id IS NOT NULL`: `backfillSeriesComicvineVolumeId.js` (`.not("gcd_id", "is", null)`) and the ComicVine-volume-id backfill paths in `comicvine_api_to_supabase.py` (`"gcd_id": "not.is.null"`, lines ~952 and ~1003). A `gcd_id`-less row can still be ingested by name via `gap-manual.json`/`gap-priority.json` (those match by title/publisher/year, not `gcd_id`), but it can never get its `comicvine_volume_id` pinned by the normal automated backfill path. This is a known limitation, not something fixed here — flagging it for whoever eventually tackles it.

5. **Distinguishing backlog reasons in `needs_volume_id.json`.** As of the 2026-09-17 ingest-skip-bug fix, a genuine zero-title-match (ComicVine has nothing under that exact title) now correctly lands in `needs_volume_id.json` with `"reason": "no_title_match"` and an empty `candidates` list, instead of being silently marked done in `.ingest-done.json` forever with no trace anywhere. This is a distinct case from the ambiguous-match reasons (`multiple_candidates`, `multiple_same_start_year_tied`, etc.) which do have candidates to disambiguate from. `resolveNeedsVolumeIdBacklog.js` already only auto-resolves single-candidate entries, so it correctly leaves `no_title_match` rows alone — anyone auditing this backlog should expect to see both shapes and know they need different handling (a `--volume-id` pick for the ambiguous ones, real research into whether the target itself is wrong for the zero-match ones).
