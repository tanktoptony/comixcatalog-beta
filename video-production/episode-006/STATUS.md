# Episode 006 status

Character Dossier 001: Doctor Doom. Channel episode 6, first of a repeatable "Character Dossier" format. Brief: `Downloads/ComixCatalog_Doom_Dossier_Production_Brief.md` (2026-10-25). Rendering is paused until the script is approved and the voice lands.

## Done

- 2026-10-25 `RESEARCH.md`: issue-level fact-check of V0.1 plus sourced feats. Marvel's six-stat power grid confirmed from Marvel.com's own page data. Four V0.1 fixes: the FF #60 ending (Reed baits Doom into Galactus's barrier), Secret Wars 1984 (Doom drains Galactus first, then the Beyonder), 1984 doesn't "establish" the habit (FF #57 did), and the Triumph and Torment setup (contest, gauntlets off, runner-up's favor).
- 2026-10-25 `SHOTS.md`: shot alignment sheet against V0.1's beats, with a scan list. Becomes the line-by-line `timeline.js` once the voice lands.
- 2026-10-25 Covers from ComicVine in `Desktop/YouTube/episode-006-assets/covers` (sources.json beside them), synced to `public/episode-006/`. Blood Hunt #4 and #5 added 10-26.
- 2026-10-25 Dossier card: `shared/components/dossier.jsx` + `episode-006/dossier-001.js` + `src/Dossier006.jsx`. `npm run dossier:006` renders the 5 s reveal and the cosmic overlay; `npm run dossier:006:stills` renders the stills and layers.
- 2026-10-26 `SCRIPT.md` draft 1: 12 recordings plus 3 standalone Shorts, about 2,770 words (about 19 min). Folds in the four fixes, the feats from RESEARCH.md, and Blood Hunt 2024 (Doom takes the Sorcerer Supreme title, confirmed on Marvel.com). The Shorts moved in here from the old SHORTS.md. No `[VERIFY]` lines left: the Secret Wars 2015 #9 admission is paraphrased, not quoted.

## Waiting on Tony

1. Script: read draft 1, mark changes or OK it.
2. `[TONY]` lines: had the Marvel Universe cards as a kid? Read Triumph and Torment before this episode? Keep or cut.
3. Sorcery: 5 (as written) or UNRATED (alt line is in section 05).
4. Voice: Claude generates the read from his HeyGen clone (`scripts/tts-heygen.py`, one call per paragraph, cached) once the script is OK'd, or Tony records/generates it himself.

Defaults unless he says otherwise: card front art A (FF #57 Kirby mask); scans use the cover fallbacks.

## Open, Claude's side

- Before the read: Triumph and Torment (1989) has no issue row in the catalog and Emperor Doom isn't linked to ComicVine. Fix so the collector's corner captures work. Check each CTA feature in section 11 ("catalog your books, mark what you own, see what you're still missing") on the live site.
- Captures: Marvel.com Doom profile (power grid, armor paragraph, Tony Stark line), ComixCatalog series pages for the five essentials, the Fantastic Four (1961) owned-issues view for the CTA.
- Thumbnail: card frame + Doom silhouette, working copy "DOOM: POWER PROFILE".
- Branch `agent/episode-006` is stacked on `agent/episode-005` (PR #360, still open).

## Build steps once audio lands

Same as Ep 005: per-section audio in `audio/`, transcribe, hand-written timeline from SCRIPT.md's SHOW lines and SHOTS.md (count text-only shots before the first full render, budget 8), 45 s preview, full render, digital-zero scan, Shorts, thumbnails, package to `Desktop/YouTube/episode-006-youtube`, upload page.
