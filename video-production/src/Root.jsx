import React from "react";
import { Composition } from "remotion";
import { EPISODES, assetFolder } from "../episodes.js";
import { normalizeTimeline } from "../shared/timeline.js";
import { EpisodeRenderer } from "../shared/EpisodeRenderer.jsx";
import { VIDEO } from "../shared/brand.js";

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
    </>
  );
}
