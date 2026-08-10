# Cover Ingestion — Next Steps

**Companion to:** [docs/cover-ingestion-audit-findings.md](./cover-ingestion-audit-findings.md) (the evidence this list is built from).
**Status (2026-08-10):** Punch list, not started. Ranked by leverage, not by order-you-must-do-them.

---

## Punch list

**1. Fix `needs_volume_id.json` persistence (small, highest leverage).** Add it to the `actions/cache` path (or a commit step) in `cover-ingest.yml`. Right now this is the actual bottleneck on width/depth ever producing a new cover — the ambiguous-match backlog can't be reviewed because it evaporates every 6 hours. One workflow-file edit unblocks the review mechanism.

**2. Decide what to do about the done-ledger's 72.5% wrong rate (bigger, needs a decision first).** Two different fixes, not the same problem:
- Going forward: tighten the done-mark so a target only counts as done when its per-issue upload actually succeeded, not just "the loop didn't crash."
- Backward: the 1,240+ already-done entries need a re-verification pass to find which ones are silently incomplete (the 5 zero-cover cases found in the audit are probably the tip of it).

**3. Fix `ingestStatus.js`'s intermittent null-count bug (small).** Stop trusting any single run of it until this lands — it's actively misleading right now.

**4. Quantify the publisher-corruption backlog properly (small-medium).** Reuse the ingester's own `_norm_publisher()`/alias logic instead of the audit's ad hoc string match — that's what actually answers "how many of the 7,448 flagged rows are really wrong."

**5. Design the weekly-Wednesday cadence (the founder's actual stated ask, still fully undesigned).** Move off the every-6-hours cron toward a deliberate weekly pass timed to US new-release day, per the original spec's §5.

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
Item 1 (persist `needs_volume_id.json`) is still worth doing first — it's the only way any of this becomes reviewable instead of evaporating. But by itself it only resolves Class A. Class B needs incremental, evidence-based alias-table additions (small, ongoing). Class C needs a way to mark a target "not ComicVine's fault" so it stops being re-attempted forever.
