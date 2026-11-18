# Ep 008 status

- Topic: The Nice House on the Lake / The Nice House by the Sea (wildcard). Target Sun Nov 22, 2026; Shorts Tue/Thu/Sat.
- Research sheet: RESEARCH.md (Desktop copy: Desktop/YouTube/nice-house/RESEARCH-for-GPT.md). Catalog check: CATALOG-CHECK.md.
- 2026-11-17: Tony sent SCRIPT.md and chose not to record. Whole script (ON CAMERA lines too) voiced with his HeyGen clone; bookshelf moments are covers/pages.

## Pipeline (run with the venv at .worktrees/video-ep-pipeline/video-production/.venv, `-I`)
1. `episode-008/build_voice.py` -> Desktop/YouTube/episode-008-assets/audio/NN - name.wav + .words.json (cached per chunk in audio/tts). Respellings: Tynion = "Tie-nin" (/ˈtaɪnən/), C2E2, Angoulême, Bellaire, years as words.
2. `episode-008/build_audio.py` -> public/episode-008/audio/VOICE_PROGRAM.wav (speech -14.0 dBFS RMS, Ep 7 is -14.2), narration.words.js, audio-plan.json. Bed + sting copied from public/episode-007/audio.
3. `episode-008/stage_assets.py` -> public/episode-008/{covers,art,photos,screens} + sizes.js. Then `node scripts/build-asset-index.mjs`.
4. `episode-008/timeline.js`: 162 shots, 0 text-only cards, anchors resolve. Every zoom checked on rendered first/last stills; one still per shot reviewed.
5. Preview: `node scripts/render.mjs episode-008 --preview` -> episode-008/output/episode-008-preview.mp4. Full render only after Tony says go.

## Checks done
- Whisper (medium.en, chunk-free, no prev-text conditioning) diffed every section against the script: no misreads, no repeats, no long gaps.
- Facts in the script all match RESEARCH.md; the cover symbol claims checked on the covers (#3 lights 3rd, #7 7th, #6 adds a lit hexagon, #12 adds one more).

## Notes
- covers/lake-01-v17 is shown on the "second printing" line uncaptioned: it matches Bleeding Cool's description (distressed version of the main cover) but ComicVine doesn't label it.
- Tynion photo: Gage Skidmore, CC BY-SA 2.0 (Wikimedia Commons), credited on screen; goes in the description credits too.
- Shorts: SHORTS.md drafts, waiting on Tony's OK before voicing.
- 2026-11-18 sting: Tony retired the blue-burst logo card, its tagline and Funkorama, and kept the hexagon badge. New `pageFlipSting` segment (shared/components/pageFlipSting.jsx): 7 interior pages riffle in an open comic (episode-008/sting.js, interiors only, spoiler-safe), and the last turn reveals the badge + wordmark splash page, which the camera pushes into. Sound: scripts/build-pageflip-sting.py builds STING_PAGEFLIP.wav from CC0 flips (Voltiment555, OpenGameArt; Desktop/YouTube/sfx/voltiment-bookflip) plus a synthesized thump. Slot is 3.0 s (build_audio STING), sting at 9.76 s, episode 12:27.3. Preview: Desktop/YouTube/episode-008-youtube/sting-options/sting-pageflip.mp4. The half-res episode preview still has the old sting.
- 2026-11-18 sting music: Tony wants music too. Under the flips: the closing bars of "Production Theme Intro [Epic Orchestra]" by nene (OpenGameArt, CC0; Desktop/YouTube/sfx/nene-production-intro), final hit on the badge (file 9.04 s -> sting 2.07 s), ring-out 1.6 s past the picture. STING_PAGEFLIP.wav is 4.6 s; timeline sting dur 4.6, fadeOut 0.3. Episode mix around the sting: loudest -17 dBFS RMS (100 ms), no zero runs, peak -1.0. Decision (Tony left it to us): each episode's sting flips through that episode's comic (episode-NNN/sting.js).
