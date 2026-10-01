# Episode 001: rights and Content ID review

Reviewed 2026-10-01 against the V3 cut (`timeline.v3.js`). Not legal advice; this is what is in the video, where it came from, and the practical YouTube risk.

**How YouTube treats this:** a Content ID *claim* is not a strike. The usual outcome is that the rights holder (Disney for the cartoon) takes the ad revenue from the video, or blocks it in some countries. A *strike* comes from a manual copyright takedown, which is rare for short, commentary-style use. You can dispute a claim citing fair use; disputes are reviewed by the claimant.

**Fair-use position:** the video is commentary and recommendation about specific comics. Covers and stills are shown while discussing the exact book or character, briefly, with original narration over them, and the video doesn't substitute for buying or watching the originals. That's a strong position for the comic art and a reasonable one for short cartoon clips.

## What's in the cut (non-cover assets, by on-screen time)

| Asset | Where from | On screen | Risk | Notes |
|---|---|---|---|---|
| `extras/GIF_TAS_INTRO_END.mp4` (1992 X-Men opening titles) | Tony supplied, from the 1992 cartoon | 4.2 s, once | **Highest** | Video-only (no audio track; renders muted), but Content ID can match video alone, and the TAS opening is the most-uploaded, most-registered clip in the show. Most likely source of a claim. **Safer swap:** cut it and hold on `TAS_TEAM_1992` key art over `stock/RETRO_TV` (one-line change in `timeline.v3.js`). |
| `extras/GIF_GAMBIT_CARDS`, `GIF_PHOENIX`, `GIF_SENTINEL` (cartoon GIFs) | GIF sites (MakeAGIF watermark hidden by framing) | 5.1 s, 3.0 s, 5.7 s | Medium-low | Short, silent, low-resolution. Could match; less likely than the intro. Swap for stills if you want zero cartoon footage. |
| `extras/TAS_TEAM_1992`, `TAS_GAMBIT_ROGUE`, `TAS_WOLVERINE` (cartoon stills) | Official key art / screenshots | 19.3 s total | Low | Still images are rarely Content ID-matched. |
| `extras/COLOSSUS_*`, `PHOENIX_OFFICIAL`, `DOFP_SENTINEL_OFFICIAL` | Marvel.com / official promo art | ~29 s total | Low | Stills, used while discussing the character. |
| `extras/GOD_LOVES_MAN_KILLS`, `GLMK_CONTEXT`, all `covers/*` | ComicVine / ComixCatalog catalog | Most of the video | Low | Cover art shown while reviewing that exact book: the core fair-use case. |
| `stock/RETRO_TV`, `KID_BROWSING_COMICS`, `COMIC_PAGE_FLIP` | Pexels (videos 6976087, 8343352, 7310973) | ~20 s | None | Pexels license: free, no attribution required. |
| `screenshots/CC_*` | ComixCatalog (ours) | ~12 s | None | |
| Music: "Rollin at 5", "Funkorama" | Kevin MacLeod, incompetech.com | Bed under the whole video; title sting | None if credited | CC BY 4.0: **the credit must be in the description** (see `~/Desktop/episode-001-assets/audio/MUSIC_CREDITS.txt`). His catalog isn't enrolled in Content ID. |
| Fonts (Big Shoulders, Inter) | Fontsource / Google Fonts | | None | SIL Open Font License. |
| Narration, script | Tony | | None | |

Removed from V2 and not in V3: the Channing Tatum still (a film still of a real actor, more sensitive than cartoon art).

## Recommendation

1. Keep the comic covers and stills as they are.
2. Decide on the 1992 intro clip: keep it (accept a possible claim on ad revenue; disputable) or swap to the key-art version before upload. It's the one asset most likely to cause a claim.
3. The three cartoon GIFs are fine to keep; swap them for stills only if you want to rule out claims entirely.
4. Paste the music credit into the description.
5. Upload as **unlisted first** and wait for YouTube's copyright check (it runs during processing and shows under Checks) before publishing. If a claim appears, you can trim the matched segment in YouTube Studio's editor without re-uploading.
