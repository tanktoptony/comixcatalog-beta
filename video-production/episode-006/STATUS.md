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

- 2026-10-26 The edit: `build_audio.py` (program audio: light de-ess, -13 dBFS speech, continuous Rollin at 5 bed, Funkorama sting), `timeline.js` (246 shots, about 4.9 s each, no text-only cards; Marvel.com captures with ads blanked and the address shown, live ComixCatalog pages, the card with slam, meter fill, A/B/C context and power-up overlays). The sting says "Catalog. Collect. Connect." (Episodes 001 to 005 keep their "Comics. No homework." line.) Tony liked the 45 s preview but flagged zooms landing on nothing (Doom's midsection); every cover zoom now uses `zoomTo` and was checked on a simulated crop sheet.
- 2026-10-26 Shorts edit (`shorts-timeline.js`, `build_shorts_audio.py`), thumbnails (`src/Thumbnails006.jsx`), upload package (`package.mjs` -> `Desktop/YouTube/episode-006-youtube`: PACKAGE.md, captions.srt, 12 chapters).

## Waiting on Tony

Nothing blocking. Optional: keep or drop the 02b Avengers: Doomsday line (default: keep, it's in the cut).

## Open, Claude's side

- Full render (`npm run render:006`), digital-zero scan, then the vertical card stills with overlays for the Shorts (frames from the render), `npm run shorts:006`, `npm run thumbs` for Thumb006*, re-run `node episode-006/package.mjs`, upload page.
- Catalog: Triumph and Torment (1989) has two duplicate series rows (e4376985..., 4a6ab5ef...); the description links the first.
- Branch `agent/episode-006` is stacked on `agent/episode-005` (PR #360, still open).
