// Candidate replacements for the channel sting (src/ChannelIntro.jsx Logo):
// Tony 2026-11-18 found the blue burst + halftone + badge slam "too cliche
// comic website". Three directions, all 2.5 s, no flash, no shake:
//   StingSpotlight  one of the episode's covers lit like an auction lot
//   StingCoverWall  the episode's covers as a drifting wall behind the name
//   StingFoil       the name as gold foil stamped on dark board, a light glint
// Each takes `covers` (staticFile paths) so the card changes per episode.

import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import "@fontsource/big-shoulders/800.css";
import "@fontsource/inter/600.css";
import { brand, fonts } from "../brand.js";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const FOIL = "linear-gradient(100deg, #8a6a1f 0%, #e9c766 22%, #fff3c4 38%, #d8b04b 52%, #8f6d22 70%, #f1d27a 88%, #a98226 100%)";

function Name({ size = 150, t, glint = null }) {
  // Wordmark set in the brand face: COMIX in warm white, CATALOG in gold foil.
  const foil = {
    backgroundImage: glint == null ? FOIL : `linear-gradient(100deg, transparent ${glint - 8}%, rgba(255,255,255,0.95) ${glint}%, transparent ${glint + 8}%), ${FOIL}`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };
  return (
    <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: size, lineHeight: 0.9, letterSpacing: "0.04em", textTransform: "uppercase", opacity: t, transform: `translateY(${(1 - t) * 24}px)` }}>
      <span style={{ color: "#f3efe4" }}>Comix</span>
      <span style={foil}>Catalog</span>
    </div>
  );
}

function Tagline({ tagline, t, color = brand.textMuted, size = 30 }) {
  return (
    <div style={{ fontFamily: fonts.body, fontWeight: 600, fontSize: size, letterSpacing: "0.42em", textTransform: "uppercase", color, opacity: t, transform: `translateY(${(1 - t) * 12}px)` }}>
      {tagline}
    </div>
  );
}

function Rule({ w, t }) {
  return <div style={{ height: 2, width: w * t, background: "linear-gradient(90deg, rgba(216,176,75,0), #d8b04b 20%, #f1d27a 50%, #d8b04b 80%, rgba(216,176,75,0))" }} />;
}

export function StingSpotlight({ covers, tagline = "Catalog. Collect. Connect." }) {
  const frame = useCurrentFrame();
  const { durationInFrames: d } = useVideoConfig();
  const lift = interpolate(frame, [0, 26], [0, 1], { ...clamp, easing: ease });
  const words = interpolate(frame, [10, 34], [0, 1], { ...clamp, easing: ease });
  const tag = interpolate(frame, [22, 42], [0, 1], { ...clamp, easing: ease });
  const sweep = interpolate(frame, [6, 60], [-30, 130], clamp);
  const drift = interpolate(frame, [0, d], [1.0, 1.03]);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(42% 70% at 27% 52%, #2a2418 0%, #14110c 45%, #07080a 100%)" }}>
      <AbsoluteFill style={{ left: 200, width: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", transform: `perspective(1800px) rotateY(${10 - 4 * lift}deg) translateY(${(1 - lift) * 40}px) scale(${drift})`, opacity: lift }}>
          <Img src={staticFile(covers[0])} style={{ height: 760, display: "block", borderRadius: 4, boxShadow: "0 60px 120px rgba(0,0,0,0.85), 0 18px 40px rgba(40,26,6,0.7)" }} />
          <div style={{ position: "absolute", inset: 0, borderRadius: 4, background: `linear-gradient(115deg, transparent ${sweep - 18}%, rgba(255,244,214,0.22) ${sweep}%, transparent ${sweep + 18}%)` }} />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ left: 930, display: "flex", flexDirection: "column", justifyContent: "center", gap: 34 }}>
        <Name size={150} t={words} />
        <Rule w={760} t={tag} />
        <Tagline tagline={tagline} t={tag} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function StingCoverWall({ covers, tagline = "Catalog. Collect. Connect." }) {
  const frame = useCurrentFrame();
  const { durationInFrames: d } = useVideoConfig();
  const words = interpolate(frame, [6, 30], [0, 1], { ...clamp, easing: ease });
  const tag = interpolate(frame, [18, 40], [0, 1], { ...clamp, easing: ease });
  const wall = interpolate(frame, [0, 18], [0, 1], clamp);
  const pan = interpolate(frame, [0, d], [0, -90]);
  const cols = 9, rows = 3, w = 300, gap = 22;
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([r, c, covers[(r * cols + c * 2 + r) % covers.length]]);
  return (
    <AbsoluteFill style={{ backgroundColor: "#07080a", overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `rotate(-7deg) translate(${-260 + pan}px, -170px)`, opacity: wall }}>
        {cells.map(([r, c, src], i) => (
          <Img key={i} src={staticFile(src)} style={{ position: "absolute", left: c * (w + gap) + (r % 2) * 150, top: r * (w * 1.52 + gap), width: w, height: w * 1.52, objectFit: "cover", borderRadius: 3, filter: "saturate(0.85)" }} />
        ))}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(60% 55% at 50% 52%, rgba(7,8,10,0.92) 0%, rgba(7,8,10,0.78) 45%, rgba(7,8,10,0.45) 100%)" }} />
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 34 }}>
        <Name size={176} t={words} />
        <Rule w={900} t={tag} />
        <Tagline tagline={tagline} t={tag} color="#cfc7b4" />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function StingFoil({ tagline = "Catalog. Collect. Connect." }) {
  const frame = useCurrentFrame();
  const press = interpolate(frame, [0, 22], [0, 1], { ...clamp, easing: ease });
  const tag = interpolate(frame, [18, 38], [0, 1], { ...clamp, easing: ease });
  const glint = interpolate(frame, [20, 62], [-10, 115], clamp);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(70% 80% at 50% 45%, #1a2032 0%, #0d111b 55%, #05070b 100%)" }}>
      <svg width="1920" height="1080" style={{ position: "absolute", inset: 0, opacity: 0.35, mixBlendMode: "overlay" }}>
        <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40 }}>
        <div style={{ position: "relative", transform: `scale(${1.04 - 0.04 * press})`, filter: `drop-shadow(0 ${2 * press}px 0 rgba(0,0,0,0.9)) drop-shadow(0 18px 30px rgba(0,0,0,${0.6 * press}))` }}>
          <Name size={200} t={press} glint={glint} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 28, opacity: tag }}>
          <div style={{ width: 120, height: 1, background: "#d8b04b" }} />
          <Tagline tagline={tagline} t={tag} color="#bfae80" size={28} />
          <div style={{ width: 120, height: 1, background: "#d8b04b" }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
