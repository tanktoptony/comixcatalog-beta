# Episode 006 status

Character Dossier 001: Doctor Doom. Channel episode 6, first of a repeatable "Character Dossier" format. Brief: `Downloads/ComixCatalog_Doom_Dossier_Production_Brief.md` (2026-10-25). Tony is writing the script; Claude runs everything else. Rendering is paused until the approvals below are in.

## Done (2026-10-25)

- `RESEARCH.md`: issue-level fact-check of V0.1 plus sourced feats to expand it to 15 to 20 min. Marvel's six-stat power grid confirmed from Marvel.com's own page data. Four V0.1 lines need fixing (listed there): the FF #60 ending (Reed baits Doom into Galactus's barrier), Secret Wars 1984 (Doom drains Galactus first, then the Beyonder), 1984 doesn't "establish" the habit (FF #57 did), and the Triumph and Torment setup (contest, gauntlets off, runner-up's boon).
- `SHOTS.md`: shot alignment sheet against V0.1's beats, with assets, holds, and a scan list. Becomes the line-by-line `timeline.js` once the recording lands.
- `SHORTS.md`: three standalone Shorts scripts (Iron Man vs. sorcery; Silver Surfer heist; why God Emperor Doom doesn't count).
- 46 ComicVine covers in `Desktop/YouTube/episode-006-assets/covers` (sources.json beside them), checked on a contact sheet, synced to `public/episode-006/`.
- Dossier card: `shared/components/dossier.jsx` + `episode-006/dossier-001.js` (data) + `src/Dossier006.jsx`. Front, back, 3D flip, sorcery medallion, temporary-power overlays (cosmic, Beyonder, God Emperor), layered PNG stills, `dossier` timeline segment. `npm run dossier:006` renders the 5 s reveal and the cosmic overlay; `npm run dossier:006:stills` renders the stills and layers.

## Waiting on Tony

1. Script: fold the four fixes into the draft; record per chapter (`01-cold-open.wav` ...) plus the three Shorts.
2. Card front art: pick one (FF #57 Kirby mask, FF #5, Books of Doom 2025 TPB, Doom 2024 #1), or say if he wants commissioned original art later.
3. Sorcery score: approve the rubric in RESEARCH.md section 6 and a number (proposed 5), or keep UNRATED.
4. Scans: which of the books in the SHOTS.md scan list he owns (reprints count). Every scan has a cover fallback.

## Open, Claude's side

- Triumph and Torment (1989) has no issue row in the catalog, and Emperor Doom isn't linked to ComicVine. Fix before the collector's corner names them on ComixCatalog.
- Captures: Marvel.com Doom profile (power grid source), ComixCatalog series pages for the five essentials, collection page for the CTA.
- Thumbnail: card frame + Doom silhouette, working copy "DOOM: POWER PROFILE".
- Branch `agent/episode-006` is stacked on `agent/episode-005` (PR #360, still open).

## Build steps once audio lands

Same as Ep 005: `audio/approved/` per-section wavs, transcribe, hand-written timeline from SHOTS.md (count text-only shots before the first full render, budget 8), 45 s preview, full render, digital-zero scan, Shorts, thumbnails, package to `Desktop/YouTube/episode-006-youtube`, upload page.
