// Vertical Shorts / Reels cut from an episode (1080x1920). The 16:9 episode
// render sits in the middle, a hook line on top, big captions below (the
// script's exact words, timed to the voice), and a "full video" card at the
// end. Clip ranges are script phrases (shorts.js), so they re-time with the
// narration like everything else.

import React, { useEffect, useState } from "react";
import { AbsoluteFill, Img, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import "@fontsource/big-shoulders/800.css";
import "@fontsource/inter/700.css";
import { brand, fonts } from "../shared/brand.js";
import { EpisodeRenderer } from "../shared/EpisodeRenderer.jsx";

const W = 1080;
const VIDEO_H = Math.round((W * 9) / 16); // 608

function useFonts() {
  const [h] = useState(() => delayRender("short fonts"));
  useEffect(() => {
    Promise.all([document.fonts.load("800 90px 'Big Shoulders'"), document.fonts.load("700 40px 'Inter'")]).then(
      () => continueRender(h),
      () => continueRender(h)
    );
  }, [h]);
}

const Stroke = ({ children, size, color = "#fff", style }) => (
  <div
    style={{
      fontFamily: fonts.display,
      fontWeight: 800,
      fontSize: size,
      lineHeight: 0.95,
      textTransform: "uppercase",
      color,
      textAlign: "center",
      WebkitTextStroke: `${Math.max(4, Math.round(size / 16))}px #000`,
      paintOrder: "stroke fill",
      ...style,
    }}
  >
    {children}
  </div>
);

export function ShortClip({ episodeId, timeline, from, to, hook, captions = [] }) {
  useFonts();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = from + frame / fps;
  const cap = t < to ? captions.find((c) => c.s <= t && t < c.e) : null;
  const endCardAt = durationInFrames - Math.round(2.6 * fps);
  const endOpacity = interpolate(frame, [endCardAt, endCardAt + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: `radial-gradient(80% 50% at 50% 45%, ${brand.blueBright}44 0%, transparent 70%), linear-gradient(180deg, ${brand.blue} 0%, ${brand.bg} 55%)` }}>
      <div style={{ position: "absolute", top: 210, left: 60, right: 60 }}>
        <Stroke size={92} color={brand.gold}>{hook}</Stroke>
      </div>

      <div style={{ position: "absolute", top: 600, left: 0, width: W, height: VIDEO_H, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.6)" }}>
        <div style={{ width: 1920, height: 1080, transform: `scale(${W / 1920})`, transformOrigin: "0 0" }}>
          <Sequence from={-Math.round(from * fps)} durationInFrames={Math.round(to * fps)}>
            <EpisodeRenderer episodeId={episodeId} timeline={timeline} />
          </Sequence>
        </div>
      </div>

      {cap && (
        <div style={{ position: "absolute", top: 1290, left: 70, right: 70 }}>
          <Stroke size={70}>{cap.t}</Stroke>
        </div>
      )}

      <Img src={staticFile("brand/badge-transparent.png")} style={{ position: "absolute", left: (W - 90) / 2, bottom: 150, width: 90, height: 90 }} />

      <AbsoluteFill style={{ opacity: endOpacity, background: "rgba(9,12,17,0.92)", display: "grid", placeItems: "center" }}>
        <div style={{ padding: "0 80px" }}>
          <Stroke size={80} color={brand.gold}>Full video on the channel</Stroke>
          <div style={{ marginTop: 34, fontFamily: fonts.body, fontWeight: 700, fontSize: 40, color: brand.text, textAlign: "center" }}>
            Where to Start Reading X-Men
          </div>
          <div style={{ marginTop: 22, fontFamily: fonts.body, fontWeight: 700, fontSize: 34, color: brand.gold, textAlign: "center" }}>comixcatalog.com</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
