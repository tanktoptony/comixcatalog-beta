// A comic page that turns on screen (Ep 007, Batman #5's sideways labyrinth):
// it sits as printed, then at `turnAt` (0..1 of the segment) rotates by `deg`
// and grows to fill the frame the new way round, the way a reader turns the book.

import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CoverBackdrop, NarrationBox, Panel, SegmentContext } from "./primitives.jsx";

export function RotatePage({ asset, size = [1987, 3056], deg = 90, turnAt = 0.35, kicker, title, sub }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { durationInFrames } = React.useContext(SegmentContext);
  const [w0, h0] = size;
  const turned = Math.abs(deg) % 180 === 90;
  // Fit as printed, then fit the turned page (its width becomes the height).
  const sA = Math.min(1600 / w0, 960 / h0);
  const sB = turned ? Math.min(1800 / h0, 1000 / w0) : sA;
  const t = spring({ frame: frame - Math.round(turnAt * durationInFrames), fps, config: { damping: 18, stiffness: 70, mass: 1.1 } });
  const rot = interpolate(t, [0, 1], [0, deg]);
  const s = interpolate(t, [0, 1], [sA, sB]);
  const drift = 1 + 0.03 * (frame / durationInFrames);
  return (
    <AbsoluteFill>
      <CoverBackdrop asset={asset} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ transform: `rotate(${rot}deg) scale(${s * drift})`, width: w0 + 14, height: h0 + 14 }}>
          <Panel asset={asset} width={w0 + 14} height={h0 + 14} fit="contain" />
        </div>
      </AbsoluteFill>
      <NarrationBox kicker={kicker} title={title} sub={sub} />
    </AbsoluteFill>
  );
}
