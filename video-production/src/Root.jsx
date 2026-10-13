import React from "react";
import { Composition } from "remotion";
import { EPISODES, assetFolder } from "../episodes.js";
import { normalizeTimeline } from "../shared/timeline.js";
import { EpisodeRenderer } from "../shared/EpisodeRenderer.jsx";
import { VIDEO, CHANNEL_INTRO } from "../shared/brand.js";
import { ThumbShelf, ThumbNotHere, ThumbFace } from "./Thumbnails.jsx";
import { THUMBNAILS_002 } from "./Thumbnails002.jsx";
import { THUMBNAILS_003 } from "./Thumbnails003.jsx";
import { THUMBNAILS_004 } from "./Thumbnails004.jsx";
import { ShortClip } from "./Shorts.jsx";
import { ChannelBanner } from "./Banner.jsx";
import { ChannelIntro, ChannelSting } from "./ChannelIntro.jsx";
import { FoundersStory } from "./FoundersStory.jsx";
import { SHORTS, END_CARD, shortRange } from "../shorts.js";
import { narrationWords as narrationWords001 } from "../episode-001/timeline.v3.js";
import { narrationWords as narrationWords002 } from "../episode-002/timeline.js";
import { narrationWords as narrationWords003 } from "../episode-003/timeline.js";
import { narrationWords as narrationWords004 } from "../episode-004/timeline.js";

const shortDetails = {
  "episode-001-v3": {
    words: narrationWords001,
    endCardTitle: "Where to Start Reading X-Men",
  },
  "episode-002": {
    words: narrationWords002,
    endCardTitle: "Jonathan Hickman's Comics You Might Have Missed",
  },
  "episode-003": {
    words: narrationWords003,
    endCardTitle: "Two Long Boxes and the Birth of ComixCatalog",
  },
  "episode-004": {
    words: narrationWords004,
    endCardTitle: "Coheed and Cambria: The Story Behind The Amory Wars",
  },
};

// YouTube thumbnails (scripts/thumbs.mjs).
export const THUMBNAILS = [
  ["Thumb001Shelf", ThumbShelf],
  ["Thumb001NotHere", ThumbNotHere],
  ["Thumb001Face", ThumbFace],
  ...THUMBNAILS_002,
  ...THUMBNAILS_003,
  ...THUMBNAILS_004,
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
        const ep = EPISODES.find((e) => e.id === s.episode);
        if (!ep) throw new Error(`${s.id}: episode not found: ${s.episode}`);
        const details = shortDetails[ep.id];
        if (!details) throw new Error(`${s.id}: short details not found for ${ep.id}`);
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
            defaultProps={{ episodeId: assetFolder(ep), timeline, from, to, hook: s.hook, words: details.words, endCardTitle: details.endCardTitle }}
          />
        );
      })}
      <Composition id="ChannelIntro" component={ChannelIntro} durationInFrames={CHANNEL_INTRO.frames} fps={VIDEO.fps} width={VIDEO.width} height={VIDEO.height} />
      <Composition id="ChannelSting" component={ChannelSting} durationInFrames={Math.round(2.5 * VIDEO.fps)} fps={VIDEO.fps} width={VIDEO.width} height={VIDEO.height} />
      <Composition id="FoundersStory" component={FoundersStory} durationInFrames={1} fps={30} width={1080} height={1920} defaultProps={{ left: 71 }} />
      <Composition id="ChannelBanner" component={ChannelBanner} durationInFrames={1} fps={30} width={2560} height={1440} />
      {THUMBNAILS.map(([id, component]) => (
        <Composition key={id} id={id} component={component} durationInFrames={1} fps={30} width={1280} height={720} />
      ))}
    </>
  );
}
