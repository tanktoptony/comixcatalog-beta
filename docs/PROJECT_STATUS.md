# ComixCatalog — Project Status

**Last verified:** 2026-08-03 (data counts below were queried live against production Supabase this pass; everything else is dated at its source)
**Owner:** founder (Anthony)
**Authority:** canonical for "what exists right now." If this contradicts CLAUDE.md, `docs/north-star/`, or any spec under `docs/`, this file wins — see `docs/README.md` for the full authority order.

This is not a roadmap and not a pitch. It's a snapshot. Update `Last verified` whenever you re-check a section; don't let stale numbers sit here uncorrected.

---

## 1. What's live

- Comic database: search, series pages, issue pages, GCD-backed metadata.
- Collection manager: grading (raw/slabbed, CGC/CBCS/PGX, cert numbers), notes, purchase price, per-item user cover photos.
- Public collector profiles (`/u/[username]`).
- Stripe subscriptions: Free and Collector Pro tiers are wired (`isPro` flag, upgrade/cancel flows).
- PDF export (`/api/export/pdf`), gated behind Pro.
- Automated valuation (`auto_market_value`) — **partially live, see §3**.
- Weekly GitHub Actions cron: cover-cache refresh + featured-gap regeneration (`.github/workflows/weekly-refresh.yml`).
- Instagram auto-post bot (`.github/workflows/instagram-post.yml`).

**Not live:** marketplace / peer-to-peer selling. `/marketplace` and `/sell` are stub pages. No Stripe Connect, no listings, no orders. Per the formal launch plan (`reports/ComixCatalog-Formal-Launch-Plan.pdf`), marketplace transaction fees are explicitly deferred past the September subscription launch — don't describe it as available in any user-facing copy.

---

## 2. Data scale (live-queried 2026-08-03)

| Table | Row count | Note |
|---|---|---|
| `series` | 217,766 | canonical, app-facing |
| `gcd_issues` | 2,514,965 | raw GCD mirror |
| `canonical_covers` | 106,983 | up from ~63k noted in CLAUDE.md's body text (Phase 2 body copy is stale — the header/strategy-plan number of "~90-96k" was closer) |
| `market_comps` | 6,054 | **see §3 — CLAUDE.md says this table is empty; it isn't** |
| `user_collections` | 681 | real usage, pre-launch beta scale |
| `comics` (user/local-contributed) | 755,401 | **flagged below — CLAUDE.md says ~140 after May 2026 dedupe** |
| `profiles` | 17 | all 17 currently show `is_pro = true` and `is_founding_collector = true` |

Coverage metrics (live):
- Series with a year (`year_start_cached` set): 85.5% — matches CLAUDE.md's last recorded figure.
- Series with a featured cover: 3.9% (CLAUDE.md's last recorded figure was 2.6% as of May 21 — improved, doc just hasn't been updated).
- `canonical_covers` with `gcd_issue_id` set: 44,882 / 106,983 (42%).
- `canonical_covers` with `series_gcd_id` set: 87,276 / 106,983 (82%).

**Investigated 2026-08-04 — the dedupe was partial, and the “~140” figure was not the post-dedupe table count.** `scripts/dedupeComicsByContent.js` is a manually invoked, one-time migration (`--apply` enables writes; no workflow schedules it). It deleted only rows that its conservative title + issue + optional-year matcher could map unambiguously to `gcd_issues`; unmatched rows were intentionally retained. Live read-only counts show 755,401 rows, of which 755,250 predate the dedupe commit, 755,161 have a non-null `gcd_id`, 755,311 have a null `series_title`, and 755,192 have a null `created_by`. Only 151 rows were created on or after 2026-05-16, and all 151 have a real `created_by`, so later ingestion cannot explain the 755k residue. The named ingestion paths also do not write `comics`: `cover-ingest.yml` runs `comicvine_api_to_supabase.py`, whose default/used target is `canonical_covers`, while `gap-probe.yml` only updates `gap-manual.json`. Conclusion: roughly 755k legacy-shaped rows survived the May content match; they were not reintroduced afterward. The script would be broadly idempotent if rerun, but a new dry-run/dedupe decision is intentionally deferred because its deletes and collection rewiring are high-risk.

## 3. Valuation pipeline — corrects CLAUDE.md

CLAUDE.md (both the Data Sources section and the Track B roadmap item) states `market_comps` is "currently empty," blocked on eBay Marketplace Insights API approval. **That's no longer accurate.**

Verified live:
- `EBAY_API=browse` in `.env.local` — the pipeline is running against eBay's Browse API (active/asking listings), not Insights (completed sales).
- `scripts/fetchEbayComps.js` already handles this correctly: when not in Insights mode it labels rows `source = "ebay-listed"` instead of `"ebay"` (`scripts/fetchEbayComps.js:198`).
- All 6,054 `market_comps` rows currently in production have `source = "ebay-listed"` — i.e., these are **asking prices, not sold comps.**
- The library UI (`src/app/library/page.js:1740-1766`) already discloses this honestly: it renders `"asking, N listings"` (not `"auto, N sales"`) when `comp_source === "ebay-listed"`, with a tooltip reading *"Asking prices, not sold — typically skew high. Sold-comp data unlocks when our Marketplace Insights access lands."*

**Net assessment:** the valuation pipeline is further along than CLAUDE.md suggests, and the asking-vs-sold labeling the formal launch plan requires ("Valuations with source labels: 100%") is already implemented in the one place checked. This is good news, not a regression — but CLAUDE.md needs a follow-up correction (not done in this pass — it has unrelated uncommitted edits in progress; don't touch it mid-edit). Still awaiting real Marketplace Insights (sold-comp) approval as of this writing.

## 4. Roadmap phase (per CLAUDE.md, not independently re-verified beyond §2/§3 above)

Phase 2 — Revenue Engine is current. Three tracks:
- **Track A (covers):** structural linking shipped; global structural-link repair + exception review still open (`reports/canonical-cover-link-repair-*.json` shows repeated repair runs 2026-08-01/02 — in progress).
- **Track B (valuation):** see §3 — further along than documented, still blocked on Insights approval for true sold-comp data.
- **Track C (revenue convergence):** Stripe wired, PDF export exists and is Pro-gated, grading UI shipped. Formal launch plan puts "PDF and subscription convergence" at 78% and "valuation pipeline" at 68% readiness as of 2026-08-01.

## 5. Known blockers going into the Aug 31–Sep 11 launch window

See `docs/LAUNCH_CHECKLIST.md` for the authoritative, evidence-tracked list. Headline items from the formal launch plan's own readiness scoring (2026-08-01): valuation pipeline (68%) and PDF/subscription convergence (78%) are the two tracks furthest from done.

## 6. External dependencies

- **eBay Marketplace Insights API** — application submitted, approval not guaranteed (per formal launch plan, "Production approval is not guaranteed"). Browse API is the working fallback, already labeled correctly (§3).
- **ComicVine API** — free tier only, ~200 req/hour ceiling. Constrains cover-ingestion throughput.
- **Stripe** — test + live keys both present in `.env.local`; mode-sensitivity has caused bugs before (`stripe_customer_id` under the wrong mode).
- **GCD data** — `gcd_issues`/`gcd_series` are a static mirror from an earlier bulk dump; no live incremental sync yet (see `docs/gcd-incremental-sync-plan.md`, status: planning).

## 7. Operational state

- Git: single contributor, commits go straight to `main`, no open-PR review workflow currently in use.
- GitHub Actions: `weekly-refresh.yml`, `cover-ingest.yml`, `gap-probe.yml`, `instagram-post.yml` — all scheduled/cron-triggered, not PR-triggered. No CI runs on push/PR today.
- Working tree as of this writing has unrelated in-progress edits (CLAUDE.md, several `src/app` layout/page files, two scripts) — not part of this cleanup, left untouched.
