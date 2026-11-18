// Channel sting from Ep 008 on (Tony 2026-11-18: no tagline, no Funkorama,
// keep the hexagon badge, flip through comic pages before the splash).
//
// An open comic lies on a dark desk. Seven leaves riffle right to left,
// faster each time; each leaf shows one interior page on its front and the
// next on its back. The last turn uncovers a "splash page" carrying the
// badge and wordmark. The camera then pushes into that page until it fills
// the frame, and the shot hands off to the full-frame splash, which is laid
// out to match the page exactly so the hand-off cannot be seen.
//
//   { type: "pageFlipSting", pages: [15 staticFile paths, portrait 0.65] }
//
// Pages: [0] the left page at the start, then front/back for each leaf.
// Sound is separate (audio.sting): public/<ep>/audio/STING_PAGEFLIP.wav,
// built by video-production/scripts/build-pageflip-sting.py, events aligned
// to LEAVES below.

import React, { useContext } from "react";
import { AbsoluteFill, Audio, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { SegmentContext } from "./primitives.jsx";

export const PH = 860;
export const PW = Math.round(PH * 0.65);
const SPINE_X = 960;
const BOOK_Y = 540 - PH / 2;
const TILT = 16;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
const inOut = Easing.bezier(0.45, 0, 0.35, 1);
const out = Easing.bezier(0.22, 1, 0.36, 1);

// [start frame, duration] at 30 fps. Each turn is quicker than the last and
// they overlap toward the end, like a thumb riffle.
export const LEAVES = [
  [0, 15],
  [10, 13],
  [18, 11],
  [25, 10],
  [31, 9],
  [36, 8],
  [41, 8],
];
const LAST_LAND = LEAVES[LEAVES.length - 1][0] + LEAVES[LEAVES.length - 1][1];
export const PUSH = [LAST_LAND - 2, LAST_LAND + 16];
export const SPLASH_IN = [PUSH[1] - 5, PUSH[1] + 1];
const FULL = 1080 / PH; // page height -> frame height

const paperBg = "radial-gradient(70% 55% at 50% 42%, #1b1f2a 0%, #0f121a 60%, #090b10 100%)";

// Badge + wordmark, centered in whatever box it sits in. `s` scales it so the
// page version and the full-frame version line up after the push.
function SplashContent({ s = 1, glint = -40 }) {
  return (
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26 * s }}>
      <div style={{ position: "relative", width: 300 * s, height: (300 * s * 886) / 786 }}>
        <Img src={staticFile("brand/badge-transparent.png")} style={{ width: "100%", height: "100%", filter: `drop-shadow(0 ${18 * s}px ${30 * s}px rgba(0,0,0,0.75))` }} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            WebkitMaskImage: `url(${staticFile("brand/badge-transparent.png")})`,
            WebkitMaskSize: "100% 100%",
            background: `linear-gradient(110deg, transparent ${glint - 10}%, rgba(255,255,255,0.55) ${glint}%, transparent ${glint + 10}%)`,
          }}
        />
      </div>
      <Img src={staticFile("brand/wordmark-transparent.png")} style={{ width: 400 * s, filter: `drop-shadow(0 ${8 * s}px ${16 * s}px rgba(0,0,0,0.7))` }} />
    </AbsoluteFill>
  );
}

function Page({ src, side }) {
  // Spine shade on the inner edge, a little paper sheen on the outer one.
  const inner = side === "right" ? "90deg" : "270deg";
  return (
    <AbsoluteFill style={{ backgroundColor: "#f4efe2", overflow: "hidden" }}>
      {src === "SPLASH" ? (
        <AbsoluteFill style={{ background: paperBg }}>
          <SplashContent />
        </AbsoluteFill>
      ) : (
        <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      )}
      <AbsoluteFill style={{ background: `linear-gradient(${inner}, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.12) 7%, rgba(0,0,0,0) 16%)` }} />
    </AbsoluteFill>
  );
}

function Leaf({ front, back, angle, z }) {
  // angle 0 = flat on the right, -180 = flat on the left.
  const lift = Math.sin((-angle * Math.PI) / 180); // 0 flat, 1 upright
  const frontShade = interpolate(-angle, [0, 90], [0, 0.45], clamp);
  const backShade = interpolate(-angle, [90, 180], [0.45, 0], clamp);
  const face = { position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };
  return (
    <div style={{ position: "absolute", left: SPINE_X, top: BOOK_Y, width: PW, height: PH, transformOrigin: "0 50%", transformStyle: "preserve-3d", transform: `translateZ(${z + lift * 2}px) rotateY(${angle}deg)` }}>
      <div style={face}>
        <Page src={front} side="right" />
        <AbsoluteFill style={{ backgroundColor: `rgba(0,0,0,${frontShade})` }} />
      </div>
      <div style={{ ...face, transform: "rotateY(180deg)" }}>
        <Page src={back} side="left" />
        <AbsoluteFill style={{ backgroundColor: `rgba(0,0,0,${backShade})` }} />
      </div>
    </div>
  );
}

// `sound` is only for the standalone preview composition; in an episode the
// sting audio comes from the timeline's audio plan.
export function PageFlipSting({ pages, sound }) {
  const frame = useCurrentFrame();
  const seg = useContext(SegmentContext);
  const cfg = useVideoConfig();
  const d = seg && seg.durationInFrames > 1 ? seg.durationInFrames : cfg.durationInFrames;
  const leaf = (k) => ({ front: pages[1 + 2 * k], back: pages[2 + 2 * k] });
  const n = LEAVES.length;
  const angles = LEAVES.map(([s, len]) => -180 * interpolate(frame, [s, s + len], [0, 1], { ...clamp, easing: inOut }));
  const landed = angles.reduce((acc, a, k) => (a <= -180 ? k : acc), -1);
  const firstWaiting = angles.findIndex((a) => a === 0);
  const leftSrc = landed >= 0 ? leaf(landed).back : pages[0];
  const rightSrc = firstWaiting >= 0 ? leaf(firstWaiting).front : "SPLASH";

  // Camera: slow drift during the riffle, then push into the right page.
  const push = interpolate(frame, PUSH, [0, 1], { ...clamp, easing: inOut });
  const drift = interpolate(frame, [0, PUSH[0]], [0.94, 1], clamp);
  const scale = drift + (FULL - 1) * push;
  const tx = -(PW / 2) * push * FULL;
  const tilt = TILT * (1 - push);
  const splash = interpolate(frame, SPLASH_IN, [0, 1], clamp);
  const glint = interpolate(frame, [SPLASH_IN[1] + 4, SPLASH_IN[1] + 26], [-20, 125], clamp);
  const settle = interpolate(frame, [SPLASH_IN[1], d], [1, 1.025], { ...clamp, easing: out });

  return (
    <AbsoluteFill style={{ backgroundColor: "#07080b", overflow: "hidden" }}>
      {sound && <Audio src={staticFile(sound)} />}
      <AbsoluteFill style={{ background: "radial-gradient(55% 65% at 50% 50%, #241f17 0%, #121010 55%, #07080b 100%)" }} />
      <AbsoluteFill style={{ perspective: 2600, perspectiveOrigin: "50% 40%" }}>
        <AbsoluteFill style={{ transformStyle: "preserve-3d", transform: `translateX(${tx}px) scale(${scale}) rotateX(${tilt}deg)` }}>
          {/* book shadow on the desk */}
          <div style={{ position: "absolute", left: SPINE_X - PW - 10, top: BOOK_Y + 24, width: PW * 2 + 20, height: PH, background: "rgba(0,0,0,0.7)", filter: "blur(28px)", opacity: 1 - push }} />
          <div style={{ position: "absolute", left: SPINE_X - PW, top: BOOK_Y, width: PW, height: PH }}>
            <Page src={leftSrc} side="left" />
          </div>
          <div style={{ position: "absolute", left: SPINE_X, top: BOOK_Y, width: PW, height: PH }}>
            <Page src={rightSrc} side="right" />
          </div>
          {angles.map((a, k) => (a < 0 && a > -180 ? <Leaf key={k} {...leaf(k)} angle={a} z={1 + (n - k) * 0.2} /> : null))}
        </AbsoluteFill>
      </AbsoluteFill>
      {splash > 0 && (
        <AbsoluteFill style={{ background: paperBg, opacity: splash }}>
          <AbsoluteFill style={{ transform: `scale(${settle})` }}>
            <SplashContent s={FULL} glint={glint} />
          </AbsoluteFill>
          <AbsoluteFill style={{ background: "radial-gradient(80% 80% at 50% 50%, transparent 60%, rgba(0,0,0,0.45) 100%)" }} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
