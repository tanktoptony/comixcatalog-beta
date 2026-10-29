# ComixCatalog: Project Status

**Last verified:** 2026-10-14
**Owner:** founder (Anthony)
**Authority:** canonical for "what exists right now." If this contradicts CLAUDE.md, `docs/north-star/`, or any spec under `docs/`, this file wins. See `docs/README.md` for the full authority order.

This is not a roadmap or a pitch. It is a snapshot. Update `Last verified` whenever a section is checked. Do not leave stale numbers here.

---

## 1. What's live

- Comic database with search, series pages, Discogs-style issue pages, and GCD-backed metadata.
- Collection manager with raw and slabbed grading, cert numbers, notes, purchase price, and per-copy photos.
- Public collector profiles at `/u/[username]`.
- One-way follows, follower notifications, invite auto-follows, suggested collectors, and public member search at `/people`.
- The free collector toolkit and Collector+ supporter tier. Collector+ costs $4/month or $36/year. Legacy Collector Pro remains for founders, comped users, and admins but is not sold.
- PDF export at `/api/export/pdf`. It is free for all collectors.
- Automated valuations based on active eBay asking prices. They are labeled as asking prices, not sold comps.
- Weekly cover and catalog maintenance, recurring cover ingest, sitemap warming, and Instagram posting workflows.

**Marketplace:** Public listing and off-platform messaging remain available. Marketplace transactions PRs a through g are live in Stripe test mode for an allowlist of three accounts. This includes orders, Stripe Connect onboarding, checkout, shipping, order threads, email, feedback, disputes, refunds, chargebacks, admin tools, and fraud limits. PR h, which changes public copy, is held until go-live. Do not describe checkout or buyer protection as generally available.

---

## 2. Data scale

The older August table counts have not been re-queried in this pass. Do not use them as current production totals.

Current counts verified during the Oct 12 to Oct 14 work:

| Table | Row count | Note |
|---|---:|---|
| `issue_printings` | about 417,000 | GCD barcodes and printing records used by scan matching |
| `key_issues` | 2,094 | Hand-curated and ComicVine-backed key issue records |
| `series_links` | 5,625 | GCD continuations and collected-edition links |
| `series_editions` | rebuilt weekly | Edition/special → work links, rebuilt weekly from `issue_reprints` |

The GCD dump import adds creators, story credits, reprints, editions, and related issue detail. A full import with `--resume` is running on Oct 14. Final import counts are not available yet.

The March GCD import's garbled accented text was repaired from the GCD dump on Oct 14 (`scripts/repairGarbledTextFromDump.js`). About 60 rows remain: GCD-deleted records and Greek-script names.

## 3. Catalog, scanning, and search

- Stack scanning has one review step and keeps issue details in the same flow.
- Live barcode scanning accepts full UPCs and main-code-only phone reads. GCD barcode data is stored in `issue_printings`.
- The barcode tab is hidden for members while barcode coverage and matching are still being completed.
- Series search uses `search_series_by_relevance_v2`. The slower v1 RPC was removed.
- Each search term's ranked result is stored in `search_term_cache`.
- Series card cover choices are stored on each series. Missing choices are claimed and resolved without recalculating every visible card.
- Equal title matches are ranked by GCD reprint count before issue count. The reprint-count backfill reads the GCD dump directly.
- Series pages and header search load independent sections in parallel. The main search page shows eight compact series cards.

## 4. Issue and series detail

- Issue pages use a Discogs-style layout with identifiers, editions, contents, creator credits, notes, reprints, and copies for sale.
- Issue URLs keep the selected edition while work-level sections join through the base issue.
- Series pages show when a run continues in another series or is collected elsewhere. These relationships come from `series_links`.
- Edition and special series are mapped to their underlying works in `series_editions`, rebuilt weekly from issue-level reprint data with a title fallback.
- `/api/search/series?works=1` folds editions into their work and returns an `editions` summary; the header search dropdown opts in.
- The full GCD dump import is still in progress. Do not treat test-load counts in the vision spec as final production counts.

## 5. Marketplace transactions

The transaction build is implemented through PR g and restricted to three allowlisted accounts in Stripe test mode:

- PR a: order reservations, transitions, and audit history.
- PR b: seller accounts, Stripe Connect onboarding, eligibility, and seller tiers.
- PR c: checkout sessions, Stripe webhooks, payout sweeps, and transfers.
- PR d: receipts, shipping, delivery, order threads, and lifecycle email.
- PR e: double-blind feedback, seller ratings, and seller standing.
- PR f: disputes, refunds, chargebacks, and two-factor-protected admin order tools.
- PR g: buyer limits, checkout cooldowns, payment warnings, and shared-card flags.

PR h is the public-copy switch. It is held until checkout goes live. The transaction flag remains allowlist-only, and Collector+ subscriptions remain separate from marketplace Stripe test mode.

## 6. External dependencies

- **eBay:** The Browse API supplies active asking prices. Sold-comp data is still unavailable.
- **ComicVine:** The free-tier request ceiling constrains cover ingest.
- **Stripe:** Collector+ subscriptions and marketplace transactions use separate configuration. Marketplace transactions are in test mode for the allowlist.
- **GCD:** Incremental syncs continue, and a full dump import with `--resume` is running on Oct 14.

### Local cover-ingest policy

`scripts/ingest-loop.ps1` is manual extra throughput. It is not a durable service. Do not install it as a Windows Scheduled Task. GitHub Actions is the durable ingest path.

## 7. Operational state

- Non-trivial work uses branches, PRs, and separate worktrees for concurrent sessions. See `docs/operations/engineering-workflow.md`.
- PR CI runs scoped lint, cover-match tests, build, and `docs:check`.
- Applied migration files are records. Duplicate migration numbers and the rule for new numbers are documented in `docs/operations/engineering-workflow.md`.
- `npm run report:engineering` produces the on-demand git-native engineering report.
