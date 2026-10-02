# ComixCatalog video production

Deterministic Remotion renders for ComixCatalog YouTube videos. Isolated from
the website: its own `package.json` and `node_modules`, and nothing in `src/`
imports from here.

## Setup

```
cd video-production
npm install
npm run sync:001      # copy covers from ~/Desktop/episode-001-assets + logos from the site repo
```

`sync` copies every folder beside `covers/` in the source directory as well, so
dropping `tas/` or `screenshots/` folders into `~/Desktop/episode-001-assets/`
and re-running it brings them in. Copied art lands in `public/<episode>/` and is
gitignored.

## Commands

| Command | What it does |
|---|---|
| `npm run studio` | Remotion Studio: scrub the timeline, see segment names |
| `npm run render:001:preview` | 960x540 fast render to `episode-001/output/episode-001-visual-track-preview.mp4` |
| `npm run render:001` | 1920x1080 H.264 (CRF 18, BT.709) to `episode-001/output/episode-001-visual-track.mp4` |
| `npm run render:demo` | Component reel, every segment type on the real covers |
| `npm run index` | Rebuild the asset index and each episode's `output/<id>-missing-assets.json` |
| `npm test` | Timeline engine tests |

## How an episode is built

An episode is data: `episode-00X/timeline.js` exports `{ id, duration, nudges, segments }`.
Each segment has an editorial `at` time (`"4:05"` or seconds), a `type`, and props.
It runs until the next segment's `at` unless it sets `dur`.

Segment types (`shared/EpisodeRenderer.jsx`):

| type | component | key props |
|---|---|---|
| `title` | TitleCard | `kicker`, `title`, `sub`, `assets` (faint cover wall) |
| `chapter` | ChapterCard | `kicker`, `title`, `sub` |
| `cover` | CoverFull / KenBurnsCover | `asset`, `treatment` (`still`, `slowPush`, `slowPull`, `driftLeft`, `driftRight`, `panDown`, `panUp`, `focus` + `focus: {x, y, zoom}`), `kicker`, `title`, `sub`, `captionAlign` |
| `pair` | CoverPair | `assets: [{asset, label, sub}] x2`, `title` |
| `grid` | CoverGrid | `assets`, `columns`, `highlight` (index kept lit) |
| `fan` | CoverFan | `assets`, `spread` |
| `shelf` | StarterShelf | `items: [{asset, label, sub}]`, `kicker`, `title` |
| `quote` | QuoteCard | `text`, `attribution`, `asset` |
| `comixcatalog` | ComixCatalogCard | `title`, `sub`, `screenshot` |
| `end` | EndCard | `title`, `sub` (right half left clear for YouTube end screens) |
| `placeholder` | PlaceholderCard | `asset`, `label` |

Every segment crossfades 8 frames in and out; set `transition: "cut"` (or
`fadeIn` / `fadeOut` frames) to change that.

## Retiming against the narration

Timestamps are editorial targets. After laying the track under the final
narration in Descript, fix drift with `nudges` instead of editing every `at`:

```js
nudges: [{ from: "6:10", by: 1.5 }, { from: "11:00", by: -0.75 }],
```

Every segment starting at or after `from` moves by `by` seconds.

## Missing assets

Any asset referenced in a timeline but not in `public/` renders as a red
striped `[MISSING: file]` card, never a substitute image, and is listed in
`<episode>/output/<episode>-missing-assets.json` with the segments using it.
Add the file, re-run `sync`, and it appears.

## Brand

Colors come from the site's `globals.css` tokens (`shared/brand.js`). Fonts are
Big Shoulders (display, same family the site uses) and Inter, bundled via
fontsource so renders do not depend on network fonts. The site's logo PNGs sit
on an opaque background, so `sync` derives transparent versions; the wordmark is
cropped above its "marketplace" tagline.

## Episode 001 V3: voice, music, word-synced cuts (2026-10-01)

V3 (`episode-001/timeline.v3.js`) is the finished-video path: narration and music are mixed in by Remotion, and every shot is anchored to the phrase it illustrates instead of a timecode.

1. Record the narration (phone voice memo is fine) and save it as `~/Desktop/episode-001-assets/audio/NARRATION.m4a` (or .wav/.mp3).
2. `npm run sync:001`
3. Word timestamps: `python scripts/transcribe.py public/episode-001/audio/NARRATION.m4a episode-001/narration.words.js` (local faster-whisper; needs `pip install faster-whisper numpy`).
4. `npm run render:001:v3:preview`, then `npm run render:001:v3` for 1080p.

`npm run index` prints any anchor phrase the transcript couldn't find (it's placed between its neighbours rather than guessed). Prefer plain words over proper nouns in anchors. The current `narration.words.js` is from a Windows text-to-speech scratch track, for timing only. Music: Kevin MacLeod (CC BY 4.0, credit in the description). Rights review: `episode-001/RIGHTS_AND_CONTENT_ID.md`.

### Upload package, thumbnails, Shorts

- `npm run package:001`: writes ~/Desktop/episode-001-youtube (PACKAGE.md with titles, description with chapters and utm-tagged links, tags, pinned comment, upload checklist; captions.srt in the script's exact words) and `episode-001/captions.generated.js` for the Shorts. Run it after every re-transcription.
- `npm run thumbs:001`: renders `src/Thumbnails.jsx` (A shelf, B not-here/start-here, C face; C needs `extras/TONY_FACE`).
- `npm run shorts:001`: renders the vertical cuts in `shorts.js` (ranges are script phrases).
- Tony's on-camera ComixCatalog spot: set `SPOT` in `timeline.v3.js` to the clip and its length; the narrated paragraph is cut and everything after shifts.
