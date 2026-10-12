# Episode 003 production status

Recorded by Tony on 2026-10-09 (OBS, 20:06), voice-over only. Cut, packaged and rendered on 2026-10-12. Tony uploads and schedules in YouTube Studio himself; nothing is published from this repo.

## How it was built

| Step | What | Where |
|---|---|---|
| Audio | Raw OBS take had no gate dropouts or suppression holes. Level to -15 dBFS speech plus a plain look-ahead peak limiter at -1.5 dBFS. No EQ, compression, noise reduction or gate (Tony rejected the Ep 002 cleanup chain). | `voice.py level` -> `public/episode-003/audio/NARRATION_LEVELED.wav` |
| Transcript | small.en for the whole take; medium.en on the shaky spots (names, retakes) | `narration.words.js`, `transcript/` |
| Edit | Last clean take of each paragraph; paragraph numbers and directions read aloud cut ("P13, done over", "Scratch that last line"); joins snapped to silence and pinned by hand where Whisper drifted (P6, P9 retake, Scud and Cerebus false starts, "humbling") | `build-edit.mjs` -> `narration.edit.js`; `voice.py render` -> `NARRATION_EDITED.wav` (8:05) |
| Fact check | Live site re-checked 2026-10-12. Milk & Cheese went live after recording, so both "still isn't on ComixCatalog" lines are cut (`MILK_CHEESE_LINES` in build-edit.mjs) and the "fixed now" montage shows its live page. Scud: only the 2008 Image run. Cerebus searchable since 10-05, Malibu since 09-17. Marketplace: beta, offers by message, no checkout. | |
| Visuals | Real covers (ComicVine, `Desktop/YouTube/episode-003-assets/sources.json`) and live comixcatalog.com screenshots (promo bar cropped). No B-roll: the OBS file is face-cam only and the episode is voice-over only. | `timeline.js` |
| Sting | 2.5 s ChannelSting after the cold open in a real narration gap (`insertGap`); Funkorama from its first downbeat (7.10 s), bed ducked under it | `timeline.js`, `shared/EpisodeRenderer.jsx` |
| Package | PACKAGE.md, captions.srt (spelling fixes), Shorts titles and schedule | `package.mjs` -> `Desktop/YouTube/episode-003-youtube/` |

Corey: Tony confirmed 2026-10-12 that naming him is fine.

## Rebuild

```
node episode-003/build-edit.mjs
python episode-003/voice.py render public/episode-003/audio/NARRATION_LEVELED.wav episode-003/narration.edit.js public/episode-003/audio/NARRATION_EDITED.wav
npm run index && node scripts/render.mjs episode-003
npm run shorts:003
npm run thumbs:003
node episode-003/package.mjs
```

Never run another Remotion or headless-browser job while a full render runs.
