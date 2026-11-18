// Channel sting from Ep 008 on (Tony 2026-11-18: no tagline, no Funkorama,
// keep the hexagon badge, flip through comic pages before the splash;
// v2 same day: slower, more finished).
//
// An open comic lies on a dark surface under a warm lamp. Seven leaves turn
// right to left, the first two slowly, then a riffle. Each leaf bends as it
// turns (strips hinged on each other), throws a shadow on the page below and
// darkens as it turns away from the light. The last turn uncovers a navy page
// printed with the badge. The lamp goes down on everything else and the camera
// pushes into that page until its edges are gone; the badge lifts off the page
// on the music hit and the wordmark rises in under it.
//
//   { type: "pageFlipSting", pages: [15 staticFile paths, portrait 0.65] }
//
// Pages: [0] the left page at the start, then front/back for each leaf.
// Sound is separate (audio.sting): public/<ep>/audio/STING_PAGEFLIP.wav, built
// by video-production/scripts/build-pageflip-sting.py from the timing below.

import React, { useContext } from "react";
import { AbsoluteFill, Audio, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { SegmentContext } from "./primitives.jsx";

export const PH = 820;
export const PW = Math.round(PH * 0.65);
const SPINE_X = 960;
const BOOK_Y = 540 - PH / 2 + 12;
const STRIPS = 14;
const SW = PW / STRIPS;
const NAVY = "#10141f";
const PAPER = "#f2ecdd";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
const inOut = Easing.bezier(0.45, 0, 0.3, 1);
const out = Easing.bezier(0.22, 1, 0.36, 1);

// [start frame, duration] at 30 fps: two unhurried turns, then a riffle.
// build-pageflip-sting.py mirrors these numbers.
export const LEAVES = [
  [6, 24],
  [26, 18],
  [40, 15],
  [52, 12],
  [61, 11],
  [69, 10],
  [76, 10],
];
export const LAST_LAND = LEAVES[LEAVES.length - 1][0] + LEAVES[LEAVES.length - 1][1]; // 86
const DIM = [LAST_LAND + 4, LAST_LAND + 22]; // lamp down on everything but the badge page
export const PUSH = [LAST_LAND - 2, LAST_LAND + 26]; // camera into the page
export const HIT = PUSH[1]; // badge lifts, music hit (frame 112)
const WORD = [HIT, HIT + 16];
const GLINT = [HIT + 6, HIT + 30];
const S_END = 1.45; // page scale when the push ends
const BADGE_W = 300; // on screen at the end
const BADGE_H = (BADGE_W * 886) / 786;
const WORD_W = 400;
const WORD_H = (WORD_W * 419) / 896;
const GAP = 30;

// A full page (art + spine shade) drawn at page size; strips show a slice of it.
function PageArt({ src, side }) {
  const inner = side === "right" ? "90deg" : "270deg";
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: PW, height: PH, backgroundColor: PAPER, overflow: "hidden" }}>
      <Img src={staticFile(src)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(${inner}, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.14) 6%, rgba(0,0,0,0) 15%)` }} />
    </div>
  );
}

// The navy page printed with the badge. `spine` fades the gutter shade out
// as the lamp goes down so the page edge disappears into the navy.
function SplashPage({ spine }) {
  const w = BADGE_W / S_END;
  return (
    <div style={{ position: "absolute", inset: 0, backgroundColor: NAVY, overflow: "hidden" }}>
      <Img
        src={staticFile("brand/badge-transparent.png")}
        style={{ position: "absolute", left: PW / 2 - w / 2, top: PH / 2 - (w * 886) / 786 / 2, width: w, filter: `drop-shadow(0 ${4 / S_END}px ${6 / S_END}px rgba(0,0,0,0.6))` }}
      />
      <div style={{ position: "absolute", inset: 0, opacity: spine, background: "linear-gradient(90deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.15) 6%, rgba(0,0,0,0) 15%)" }} />
    </div>
  );
}

// Brightness of a face at world angle phi (0 flat right, -180 flat left).
function faceShade(phi, front) {
  const t = front ? -phi / 90 : (180 + phi) / 90; // 0 flat, 1 edge-on
  return 0.55 * Math.min(1, Math.max(0, t)) ** 1.3;
}
function faceSheen(phi, front) {
  const c = front ? -38 : -142;
  return 0.16 * Math.exp(-(((phi - c) / 16) ** 2));
}

// One leaf: STRIPS strips, each hinged on the previous one, so the free edge
// lags behind the spine edge and the page bends.
function Leaf({ front, back, angle, bend, z }) {
  const steps = [];
  const tri = (STRIPS * (STRIPS - 1)) / 2;
  for (let i = 0; i < STRIPS; i++) steps.push(i === 0 ? angle : (bend * i) / tri);
  const phis = steps.reduce((acc, d) => [...acc, (acc.length ? acc[acc.length - 1] : 0) + d], []);
  let node = null;
  for (let i = STRIPS - 1; i >= 0; i--) {
    const face = { position: "absolute", top: 0, height: PH, width: SW + 1, overflow: "hidden", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };
    const edge = i === STRIPS - 1;
    node = (
      <div
        key={i}
        style={{
          position: "absolute",
          left: i === 0 ? 0 : SW,
          top: 0,
          width: SW,
          height: PH,
          transformOrigin: "0 50%",
          transformStyle: "preserve-3d",
          transform: i === 0 ? `translateZ(${z}px) rotateY(${steps[0]}deg)` : `rotateY(${steps[i]}deg)`,
        }}
      >
        <div style={{ ...face, left: 0 }}>
          <div style={{ position: "absolute", left: -i * SW, top: 0 }}>
            <PageArt src={front} side="right" />
          </div>
          <div style={{ position: "absolute", inset: 0, backgroundColor: `rgba(0,0,0,${faceShade(phis[i], true)})` }} />
          <div style={{ position: "absolute", inset: 0, backgroundColor: `rgba(255,248,230,${faceSheen(phis[i], true)})` }} />
          {edge && <div style={{ position: "absolute", right: 1, top: 0, bottom: 0, width: 2, background: "rgba(255,255,255,0.35)" }} />}
        </div>
        <div style={{ ...face, left: -1, transform: "rotateY(180deg)" }}>
          <div style={{ position: "absolute", left: -(PW - (i + 1) * SW) + 1, top: 0 }}>
            <PageArt src={back} side="left" />
          </div>
          <div style={{ position: "absolute", inset: 0, backgroundColor: `rgba(0,0,0,${faceShade(phis[i], false)})` }} />
          <div style={{ position: "absolute", inset: 0, backgroundColor: `rgba(255,248,230,${faceSheen(phis[i], false)})` }} />
        </div>
        {node}
      </div>
    );
  }
  return <div style={{ position: "absolute", left: SPINE_X, top: BOOK_Y, width: PW, height: PH, transformStyle: "preserve-3d" }}>{node}</div>;
}

// Page edges under each half, so the book has some thickness.
function Stack({ side, fade }) {
  const layers = [0, 1, 2, 3, 4, 5];
  return layers.reverse().map((k) => (
    <div
      key={k}
      style={{
        position: "absolute",
        left: side === "left" ? SPINE_X - PW - k * 1.1 : SPINE_X + k * 1.1,
        top: BOOK_Y + k * 1.6,
        width: PW,
        height: PH,
        backgroundColor: k === 5 ? "#8d8574" : `hsl(43, 22%, ${88 - k * 3.5}%)`,
        opacity: fade,
      }}
    />
  ));
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
  const prog = LEAVES.map(([s, len]) => interpolate(frame, [s, s + len], [0, 1], { ...clamp, easing: inOut }));
  const angles = prog.map((p) => -180 * p);
  const landed = angles.reduce((acc, a, k) => (a <= -180 ? k : acc), -1);
  const firstWaiting = angles.findIndex((a) => a === 0);
  const leftSrc = landed >= 0 ? leaf(landed).back : pages[0];
  const rightSrc = firstWaiting >= 0 ? leaf(firstWaiting).front : "SPLASH";

  // Shadow each turning leaf throws on the page under it.
  let shadeR = 0;
  let extR = 0;
  let shadeL = 0;
  let extL = 0;
  angles.forEach((a) => {
    if (a >= 0 || a <= -180) return;
    const r = (-a * Math.PI) / 180;
    if (-a < 90) {
      shadeR = Math.max(shadeR, 0.42 * Math.sin(r));
      extR = Math.max(extR, PW * Math.cos(r) + 60 * Math.sin(r));
    } else {
      shadeL = Math.max(shadeL, 0.42 * Math.sin(r));
      extL = Math.max(extL, PW * -Math.cos(r) + 60 * Math.sin(r));
    }
  });

  // Camera: slow dolly with a little roll during the turns, then into the page.
  const dim = interpolate(frame, DIM, [0, 1], { ...clamp, easing: inOut });
  const push = interpolate(frame, PUSH, [0, 1], { ...clamp, easing: inOut });
  const drift = interpolate(frame, [0, PUSH[0]], [1, 1.08], { ...clamp, easing: Easing.out(Easing.quad) });
  const s = drift * (1 - push) + S_END * push;
  const tx = -s * (PW / 2) * push;
  const ty = -s * (BOOK_Y + PH / 2 - 540) * push;
  const tilt = interpolate(frame, [0, PUSH[0]], [22, 15], clamp) * (1 - push);
  const roll = interpolate(frame, [0, PUSH[0]], [-2.2, 0], { ...clamp, easing: Easing.out(Easing.quad) });

  // After the push the badge is redrawn in screen space (same size and place),
  // then lifts on the hit while the wordmark rises in.
  const pushDone = frame >= PUSH[1];
  const lift = interpolate(frame, [HIT, HIT + 14], [0, 1], { ...clamp, easing: out });
  const word = interpolate(frame, WORD, [0, 1], { ...clamp, easing: out });
  const glint = interpolate(frame, GLINT, [-25, 125], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const settle = interpolate(frame, [HIT, d], [1, 1.03], clamp);
  const rise = (BADGE_H + GAP + WORD_H) / 2 - BADGE_H / 2; // badge moves up to make room
  const glow = interpolate(frame, [PUSH[1], HIT + 20], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ backgroundColor: "#08080a", overflow: "hidden" }}>
      {sound && <Audio src={staticFile(sound)} />}
      {/* surface under a warm lamp */}
      <AbsoluteFill style={{ background: "radial-gradient(58% 70% at 50% 44%, #2c251c 0%, #1a1611 45%, #0b0a0a 100%)" }} />
      <AbsoluteFill style={{ backgroundColor: NAVY, opacity: dim }} />

      <AbsoluteFill style={{ perspective: 2400, perspectiveOrigin: "50% 38%" }}>
        <AbsoluteFill style={{ transformStyle: "preserve-3d", transform: `translateX(${tx}px) translateY(${ty}px) scale(${s}) rotateZ(${roll}deg) rotateX(${tilt}deg)` }}>
          {/* contact + soft shadow */}
          <div style={{ position: "absolute", left: SPINE_X - PW - 30, top: BOOK_Y + 40, width: PW * 2 + 60, height: PH, background: "rgba(0,0,0,0.75)", filter: "blur(40px)", opacity: 1 - dim }} />
          <div style={{ position: "absolute", left: SPINE_X - PW - 4, top: BOOK_Y + 8, width: PW * 2 + 8, height: PH + 4, background: "rgba(0,0,0,0.8)", filter: "blur(6px)", opacity: 1 - dim }} />
          <Stack side="left" fade={(1 - dim) ** 2} />
          <Stack side="right" fade={(1 - dim) ** 2} />

          <div style={{ position: "absolute", left: SPINE_X - PW, top: BOOK_Y, width: PW, height: PH, overflow: "hidden" }}>
            <PageArt src={leftSrc} side="left" />
            <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: extL, background: `linear-gradient(270deg, rgba(0,0,0,${shadeL}) 0%, rgba(0,0,0,${shadeL * 0.6}) 70%, rgba(0,0,0,0) 100%)` }} />
            <div style={{ position: "absolute", inset: 0, backgroundColor: NAVY, opacity: dim }} />
          </div>
          <div style={{ position: "absolute", left: SPINE_X, top: BOOK_Y, width: PW, height: PH, overflow: "hidden" }}>
            {rightSrc === "SPLASH" ? <SplashPage spine={1 - dim} /> : <PageArt src={rightSrc} side="right" />}
            <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: extR, background: `linear-gradient(90deg, rgba(0,0,0,${shadeR}) 0%, rgba(0,0,0,${shadeR * 0.6}) 70%, rgba(0,0,0,0) 100%)` }} />
          </div>
          {/* lamp falloff across the spread (under the turning leaves) */}
          <div style={{ position: "absolute", left: SPINE_X - PW, top: BOOK_Y, width: PW * 2, height: PH, transform: "translateZ(0.5px)", opacity: 1 - dim, background: "radial-gradient(75% 85% at 50% 30%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.32) 100%)" }} />

          {angles.map((a, k) =>
            a < 0 && a > -180 ? (
              <Leaf key={k} {...leaf(k)} angle={a} bend={Math.min(62 * Math.sin(Math.PI * prog[k]), -a * 0.9)} z={1 + (n - k) * 0.25} />
            ) : null
          )}
        </AbsoluteFill>
      </AbsoluteFill>

      {pushDone && (
        <AbsoluteFill style={{ backgroundColor: NAVY }}>
          <AbsoluteFill style={{ opacity: glow, background: "radial-gradient(38% 50% at 50% 47%, #1f2840 0%, rgba(16,20,31,0) 100%)" }} />
          <AbsoluteFill style={{ transform: `scale(${settle})` }}>
            <div style={{ position: "absolute", left: 960 - BADGE_W / 2, top: 540 - BADGE_H / 2 - rise * word, width: BADGE_W, height: BADGE_H, transform: `scale(${1 + 0.05 * lift})` }}>
              <Img
                src={staticFile("brand/badge-transparent.png")}
                style={{ width: "100%", height: "100%", filter: `drop-shadow(0 ${4 + 18 * lift}px ${6 + 26 * lift}px rgba(0,0,0,${0.6 + 0.15 * lift}))` }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  WebkitMaskImage: `url(${staticFile("brand/badge-transparent.png")})`,
                  WebkitMaskSize: "100% 100%",
                  background: `linear-gradient(110deg, transparent ${glint - 12}%, rgba(255,255,255,0.5) ${glint}%, transparent ${glint + 12}%)`,
                }}
              />
            </div>
            <Img
              src={staticFile("brand/wordmark-transparent.png")}
              style={{
                position: "absolute",
                left: 960 - WORD_W / 2,
                top: 540 + (BADGE_H + GAP + WORD_H) / 2 - WORD_H + 24 * (1 - word),
                width: WORD_W,
                opacity: word,
                filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.7))",
              }}
            />
          </AbsoluteFill>
          <AbsoluteFill style={{ background: "radial-gradient(85% 85% at 50% 50%, transparent 55%, rgba(0,0,0,0.5) 100%)", opacity: glow }} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
