# Episode 006 status

The Power Index · Power Profile #001: Doctor Doom. Channel episode 6, first of the recurring "The Power Index" series (renamed from "Character Dossier" 2026-10-26). "Card Back" is the recurring segment name for the stats and collector info. Brief: `Downloads/ComixCatalog_Doom_Dossier_Production_Brief.md` (2026-10-25).

## Done

- 2026-10-25 `RESEARCH.md`: issue-level fact-check of V0.1 plus sourced feats. Marvel's six-stat power grid confirmed from Marvel.com's own page data. Four V0.1 fixes: the FF #60 ending (Reed baits Doom into Galactus's barrier), Secret Wars 1984 (Doom drains Galactus first, then the Beyonder), 1984 doesn't "establish" the habit (FF #57 did), and the Triumph and Torment setup (contest, gauntlets off, runner-up's favor).
- 2026-10-25 `SHOTS.md`: shot alignment sheet against V0.1's beats, with a scan list. Becomes the line-by-line `timeline.js` once the voice lands.
- 2026-10-25 Covers from ComicVine in `Desktop/YouTube/episode-006-assets/covers` (sources.json beside them), synced to `public/episode-006/`. Blood Hunt #4 and #5 added 10-26.
- 2026-10-25 Power Profile card (code still named dossier): `shared/components/dossier.jsx` + `episode-006/dossier-001.js` + `src/Dossier006.jsx`. `npm run dossier:006` renders the 5 s reveal and the cosmic overlay; `npm run dossier:006:stills` renders the stills and layers.
- 2026-10-26 `SCRIPT.md` draft 1: 12 recordings plus 3 standalone Shorts, about 2,770 words (about 19 min). Folds in the four fixes, the feats from RESEARCH.md, and Blood Hunt 2024 (Doom takes the Sorcerer Supreme title, confirmed on Marvel.com). The Shorts moved in here from the old SHORTS.md. No `[VERIFY]` lines left: the Secret Wars 2015 #9 admission is paraphrased, not quoted.

- 2026-10-26 Tony liked the script and answered: both personal lines kept, sorcery 5 (card data updated), voice from his HeyGen clone. Series renamed to The Power Index (episode: Power Profile #001: Doctor Doom; segment: Card Back). Card front/back relabeled, reveal clips re-rendered; only the 6 narration paragraphs that said "dossier" were re-voiced.
- 2026-10-26 Voice: `build_voice.py` sends each SCRIPT.md paragraph through Tony's HeyGen clone (cached per paragraph, so edits only pay for changed paragraphs). 16 files in `Desktop/YouTube/episode-006-assets/audio/` (`NN - name.wav` + `.words.json` word timings; `02b` is the optional Avengers: Doomsday line, date re-checked 10-26), plus `NARRATION_COMBINED.wav` (sections 01 to 12, 19.7 min, leveled).

## Waiting on Tony

Nothing blocking. Optional: page photos from the scan list (every shot has a cover fallback); keep or drop the 02b Avengers: Doomsday line (default: keep).

## Open, Claude's side

- Before the collector's corner captures: Triumph and Torment (1989) has no issue row in the catalog and Emperor Doom isn't linked to ComicVine. Fix so the collector's corner captures work. The section 11 CTA matches the live /start page copy ("Catalog your books... see what's missing").
- Captures: Marvel.com Doom profile (power grid, armor paragraph, Tony Stark line), ComixCatalog series pages for the five essentials, the Fantastic Four (1961) owned-issues view for the CTA.
- Thumbnail: card frame + Doom silhouette, working copy "DOOM: POWER PROFILE".
- Branch `agent/episode-006` is stacked on `agent/episode-005` (PR #360, still open).

## Build steps once audio lands

Same as Ep 005: per-section audio in `audio/`, transcribe, hand-written timeline from SCRIPT.md's SHOW lines and SHOTS.md (count text-only shots before the first full render, budget 8), 45 s preview, full render, digital-zero scan, Shorts, thumbnails, package to `Desktop/YouTube/episode-006-youtube`, upload page.
