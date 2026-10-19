# Episode 005 status

The Amory Wars, Part 2: The Second Stage Turbine Blade, track by track. Channel episode 5, second Coheed episode. Target publish Sun Nov 1, 2026; Shorts Tue Nov 3, Thu Nov 5, Sat Nov 7.

## Done (2026-10-19)

- `SCRIPT.md` draft 3: 15 section recordings plus 3 standalone Shorts. About 2,900 words of narration (around 20 min) plus about 2.5 min of album excerpts.
- `RESEARCH.md`: every factual line sourced; the handoff's track-level `[VERIFY]` notes resolved from the lyric sheet; 3 lines left for Tony to keep or cut.
- `episode.json`: titles, chapters by track, books with ComixCatalog series ids, tags, description intro, pinned comment, credits, Shorts copy and schedule.
- Analytics brief applied: no logo or channel intro before the story; the hook and the "what's different" promise land inside 30 s; one subscribe ask (section 15) naming the Sunday plus Tue/Thu/Sat schedule; one ComixCatalog ask (section 14) naming only live features (series and issue pages, collection, wantlist, free signup).

## Waiting on Tony

- Voice: `01-cold-open.wav` to `15-ending.wav`, plus `short-01-cast-list.wav`, `short-02-the-couple.wav`, `short-03-jesse.wav`, in `Downloads/episode-005-voice/`.
- Album audio: Tony's own copy of the 10 SSTB tracks (WAV, FLAC or MP3), same folder. Original 2002 track 10 with the hidden IRO-Bot, or the 2005 reissue plus its "Everything Evil (Demo)".
- Optional page photos for the `[SCAN optional]` cues. Every shot has a cover fallback.

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
