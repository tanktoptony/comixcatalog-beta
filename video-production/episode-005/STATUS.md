# Episode 005 status

The Amory Wars, Part 2: The Second Stage Turbine Blade, track by track. Channel episode 5, second Coheed episode. Target publish Sun Nov 1, 2026; Shorts Tue Nov 3, Thu Nov 5, Sat Nov 7.

## Done (2026-10-19)

- `SCRIPT.md` draft 3: 15 section recordings plus 3 standalone Shorts. About 2,900 words of narration (around 20 min) plus about 2.5 min of album excerpts.
- `RESEARCH.md`: every factual line sourced; the handoff's track-level `[VERIFY]` notes resolved from the lyric sheet; 3 lines left for Tony to keep or cut.
- `episode.json`: titles, chapters by track, books with ComixCatalog series ids, tags, description intro, pinned comment, credits, Shorts copy and schedule.
- Analytics brief applied: no logo or channel intro before the story; the hook and the "what's different" promise land inside 30 s; one subscribe ask (section 15) naming the Sunday plus Tue/Thu/Sat schedule; one ComixCatalog ask (section 14) naming only live features (series and issue pages, collection, wantlist, free signup).

## Built (2026-10-19, after the voice landed)

- Voice: 18 files from `Desktop/YouTube/episode-005-assets/audio` (15 sections + 3 Shorts). Transcribed with faster-whisper small.en; every section matches the script (Tony reworded part of 13).
- `build_audio.py` -> VOICE_PROGRAM.wav + narration.words.js + audio-plan.json (17:56, song-intro and swell slots). `build_music.py [album dir]` -> MUSIC_PROGRAM.wav. `final_mix.py` sums the stems onto a rendered mp4 with `-c:v copy` (no re-render when only music changes).
- `timeline.js`: 268 shots; new `tracklist` segment type (TrackListCard). `shorts-timeline.js` + `build_shorts_audio.py`: standalone Shorts on one clock. `fixWords.js` fixes Whisper spellings for captions. `package.mjs` writes the Desktop package.

## Shipped to Desktop (2026-10-19)

- `Desktop/YouTube/episode-005-youtube`: episode-005.mp4 (17:08, render + final_mix with Track 1 clip), captions.srt, PACKAGE.md, 2 thumbnails, 3 Shorts. Upload page: https://claude.ai/artifact/QTSaiNJLyRVQA2KZ83SUAJ
- Album: Tony had no copy; he screen-captured Track 1 (`audio/album/`). Clips are 5 s max, one per song; Rollin at 5 runs under the voice. More captures: drop the audio in `audio/album/`, `MUSIC_OUT=MUSIC_ALBUM.wav build_music.py <album dir>`, then `final_mix.py` (no re-render).
- Narration says "Knowledge, Beast and Inferno"; on-screen cards say "The Knowledge, the Beast, the Inferno" (Tony's fix). He kept the recorded line.

## Music plan

- Each track chapter opens with 8 to 12 s of that song at full level, then the song sits under the voice as the bed. Same leveling as Ep 003 (voice about 12 dB over the bed), measured on the render.
- Track 1 plays whole (0:54). The Everything Evil and God Send Conspirator pianos come up between paragraphs, because the script points at them.
- Content ID: expect claims from the label on the main episode. Claims don't count as strikes; usually ads still run with revenue going to the rights holder, and a claimant can block the video in some countries. Short excerpts under commentary keep the exposure low.
- Shorts render without album audio. If a song turns up in YouTube's Shorts "Add sound" picker when uploading, use it there (it's licensed for Shorts).

## Build steps once audio lands

1. `npm run ep -- 005 init`, copy recordings into `audio/approved/`, `npm run ep -- 005 audio`, `npm run ep -- 005 transcribe`.
2. Pre-build `music-bed.wav` from the album tracks (one continuous file, the ducking baked into section boundaries). Don't loop mp3s in Remotion.
3. Hand-written line-by-line `timeline.js` from the `SHOW:` lines (no filler rotation). Live ComixCatalog captures plus a Wayback capture of the 2002 SSTB page.
4. `Thumbnails005.jsx`: A = album art + 2007 #1, "10 SONGS. ONE STORY."; B = lyric names card, "THE SONGS NAME NAMES".
5. 45 s preview render, then full render, digital-zero scan, then `package.mjs` to `Desktop/YouTube/episode-005-youtube`, Shorts, upload page.
