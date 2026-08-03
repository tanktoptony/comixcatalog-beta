# Archive — 2026-08 repo cleanup pass

Files moved here during the pre-launch documentation/repo cleanup (2026-08-03), not deleted. Nothing here was removed from git history — `git log --follow <path>` recovers full history for any of these.

| File | Moved from | Why archived |
|---|---|---|
| `PHASE1_AUDIT.md` | `docs/north-star/PHASE1_AUDIT.md` | Audits Phase 1 against the North Star reference. CLAUDE.md marks Phase 1 COMPLETE (May 2026). The audit still has ~60 unchecked-box/P1 markers that read as open blockers to anyone skimming it — that's now misleading, not current status. Historical record of the Phase 1 gap analysis; not a live checklist. |
| `gcd_scraper_to_supabase.py` | repo root | CLAUDE.md documents this as dead code: it scrapes comics.org HTML, which is fully Cloudflare-walled (confirmed May 19, 2026 audit — every request returns `Cf-Mitigated: challenge` regardless of headers). It never successfully wrote a row. CLAUDE.md itself says "treat as dead code pending removal." Kept here in case the Cloudflare wall ever lifts or the approach is revisited. |
| `_topps_overrides_snippet.txt` | repo root | No references anywhere in the codebase (`scripts/`, `src/`, `*.py`) as of 2026-08-03. Appears to be a manually-curated one-off snippet from past Topps Comics data work. `scripts/buildToppsTargets.js` is the live Topps pipeline and doesn't touch this file. |
| `_topps_uuids.txt` | repo root | Same as above — zero code references, orphaned root file. |

Do not treat anything in this folder as current status or an active pipeline. If you need to resurrect one of these, verify against current code and data first — none of it has been re-checked since it was archived.
