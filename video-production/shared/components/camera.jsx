// Tony on camera (Ep 007 on). The clip's audio lives in the episode's voice
// program, so the picture is muted here and seeks to `clipAt` seconds into the
// clip: cutaways can interrupt a take and the camera comes back in sync.

import React from "react";
import { AbsoluteFill, OffthreadVideo, useVideoConfig } from "remotion";
import { useAsset, MissingAsset, NarrationBox } from "./primitives.jsx";

export function CameraShot({ asset, clipAt = 0, zoom = 1, position = "50% 50%", kicker, title, sub }) {
  const { fps } = useVideoConfig();
  const { src, path, missing } = useAsset(asset);
  if (missing) return <MissingAsset path={path} />;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: position }}>
        <OffthreadVideo src={src} muted trimBefore={Math.round(clipAt * fps)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      {(title || kicker) && <NarrationBox kicker={kicker} title={title} sub={sub} />}
    </AbsoluteFill>
  );
}
