# Ep 009 status

- Topic: The Amory Wars Part 3, In Keeping Secrets of Silent Earth: 3. Target Sun Nov 29, 2026.
- Research sheet: RESEARCH.md (Desktop copy: Desktop/YouTube/amory-wars-part-3/RESEARCH-for-GPT.md).
- 2026-11-21: Tony sent the script (SCRIPT.md, Shorts in SHORTS.md). One edit: "the first thing we hear is" became "the first words we hear are" (in his own sample the Hello Apollo line comes after about 29 s of music).

## Pipeline (venv: .worktrees/video-ep-pipeline/video-production/.venv, `-I`)
1. `episode-009/build_voice.py` -> Desktop/YouTube/episode-009-assets/audio/voice/NN - name.wav + .words.json (HeyGen clone, cached per chunk). Respellings: "A Lot of Nothing I/XI" -> One/Eleven, 21:13 -> "twenty-one thirteen", C2E2, S.S. Neverender.
2. `episode-009/build_audio.py` -> public/episode-009/audio/VOICE_PROGRAM.wav (speech -14.2 dBFS RMS, peak -1.4) and MUSIC_PROGRAM.wav (Double Drift bed at Ep 008's level, ducked under the sting and every clip, plus 13 song clips of 4.5-4.8 s), narration.words.js, audio-plan.json. 16:12.9 total.
3. `episode-009/stage_assets.py` -> public/episode-009 + sizes.js, then `node scripts/build-asset-index.mjs`.
4. `episode-009/timeline.js`: 206 shots, 0 text-only cards (only the end card), all anchors resolve. Song clips show the track list with that song lit. Page-flip sting flips IKSSE:3 covers (no interiors online).
5. Preview: `node scripts/render.mjs episode-009 --preview`. Full render only after Tony says go.

## Song clips
- Tony's OBS recording (Videos/2026-11-21 09-44-40.mp4, black video, audio only) copied to episode-009-assets/audio/iksse3-track-samples.wav and split at his ~1.3 s pauses into audio/clips/ (15 files) for him to check by ear.
- Only "Cuts Marked in the March of Men" is confirmed by a lyric; the rest follow album order. Whisper can't read the singing. Open: is clip 01b (64.6-84.2 s) still The Ring in Return or the title track's start?
- The Ring in Return clip is the "Hello Apollo, where should I begin?" line (sample 59.6-64.1 s, words at 61.9-63.9).

## Checks done
- Whisper medium.en diff, every section and Short: only number formatting and spelling ("2003", "never ender", "back end"). A full-file pass seemed to drop a phrase in 12; a focused pass hears it word for word.
- Flag for Tony's ears: in 15 both Whisper models hear "an additions tab" for "an editions tab".
- Facts: all match RESEARCH.md. Outro features checked live 11-21 (Add issues I own, Printable checklist, + Add to pull list, editions page tabs). Variant covers read off the art: #1 v01 "Convention exclusive limited to 500", #5 v "New York Comic Con 2010", #9 v "C2E2 exclusive limited to 300".
- QC: assets pass, text cards pass; retake warnings are the clip gaps and the script's own repeats.
