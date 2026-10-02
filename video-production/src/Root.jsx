import React from "react";
import { Composition } from "remotion";
import { EPISODES, assetFolder } from "../episodes.js";
import { normalizeTimeline } from "../shared/timeline.js";
import { EpisodeRenderer } from "../shared/EpisodeRenderer.jsx";
import { VIDEO } from "../shared/brand.js";
import { ThumbShelf, ThumbNotHere, ThumbFace } from "./Thumbnails.jsx";
import { ShortClip } from "./Shorts.jsx";
import { ChannelBanner } from "./Banner.jsx";
import { SHORTS, END_CARD, shortRange } from "../shorts.js";
import { narrationWords } from "../episode-001/timeline.v3.js";

// YouTube thumbnails (scripts/thumbs.mjs).
export const THUMBNAILS = [
  ["Thumb001Shelf", ThumbShelf],
  ["Thumb001NotHere", ThumbNotHere],
  ["Thumb001Face", ThumbFace],
];

export function Root() {
  return (
    <>
      {EPISODES.map((ep) => {
        const timeline = normalizeTimeline(ep, VIDEO.fps);
        return (
          <Composition
            key={ep.compositionId}
            id={ep.compositionId}
            component={EpisodeRenderer}
            durationInFrames={timeline.durationInFrames}
            fps={VIDEO.fps}
            width={VIDEO.width}
            height={VIDEO.height}
            defaultProps={{ episodeId: assetFolder(ep), timeline }}
          />
        );
      })}
      {SHORTS.map((s) => {
        const ep = EPISODES.find((e) => e.id === "episode-001-v3");
        const timeline = normalizeTimeline(ep, VIDEO.fps);
        const { from, to } = shortRange(ep, s);
        return (
          <Composition
            key={s.id}
            id={s.id}
            component={ShortClip}
            durationInFrames={Math.round((to - from + END_CARD) * VIDEO.fps)}
            fps={VIDEO.fps}
            width={1080}
            height={1920}
            defaultProps={{ episodeId: assetFolder(ep), timeline, from, to, hook: s.hook, words: narrationWords }}
          />
        );
      })}
      <Composition id="ChannelBanner" component={ChannelBanner} durationInFrames={1} fps={30} width={2560} height={1440} />
      {THUMBNAILS.map(([id, component]) => (
        <Composition key={id} id={id} component={component} durationInFrames={1} fps={30} width={1280} height={720} />
      ))}
    </>
  );
}
