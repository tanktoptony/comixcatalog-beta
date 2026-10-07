// Channel bumper that opens every episode: ~7.4 s of quick cuts on the
// beat of "Funkorama" (about 101 BPM, first hit at 0.76 s), ending on the
// logo. Webcam slots use Tony's clips when they exist
// (public/episode-001/broll/TONY_1..3, any video format) and fall back to
// stock footage until then.

import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import "@fontsource/big-shoulders/800.css";
import "@fontsource/inter/700.css";
import { brand, fonts, CHANNEL_INTRO } from "../shared/brand.js";
import { EpisodeContext, Halftone, useAsset, available } from "../shared/components/primitives.jsx";
import { resolveAudio } from "../shared/timeline.js";

const FIRST_HIT = 0.76;
const BEAT = 0.595;
const beat = (n) => FIRST_HIT + n * BEAT;
const cover = (n) => ({ kind: "cover", src: `brand/banner/${n}.jpg` });
const clip = (asset, fallback, from = 1) => ({ kind: "clip", asset, fallback, from });

// [start seconds, shot]. Half-beat cuts in the last bar build into the logo.
const SHOTS = [
  [0, clip("broll/TONY_1", "stock/KID_BROWSING_COMICS", 2)],
  [beat(0), cover("action-comics-1")],
  [beat(1), cover("the-amazing-spider-man-1")],
  [beat(2), clip("broll/TONY_2", "stock/COMIC_PAGE_FLIP", 1)],
  [beat(3), cover("giant-size-x-men-1")],
  [beat(4), cover("detective-comics-27")],
  [beat(5), clip("broll/TONY_3", "stock/RETRO_TV", 1)],
  [beat(6), cover("watchmen-1")],
  [beat(6.5), cover("star-wars-1")],
  [beat(7), cover("teenage-mutant-ninja-turtles-1")],
  [beat(7.5), cover("spawn-1")],
];
const LOGO_AT = beat(8);

function useFonts() {
  const [h] = useState(() => delayRender("intro fonts"));
  useEffect(() => {
    Promise.all([document.fonts.load("800 200px 'Big Shoulders'"), document.fonts.load("700 40px 'Inter'")]).then(
      () => continueRender(h),
      () => continueRender(h)
    );
  }, [h]);
}

function Hit({ children, tilt = 0 }) {
  const frame = useCurrentFrame();
  const punch = interpolate(frame, [0, 6], [1.18, 1], { extrapolateRight: "clamp" });
  const shake = frame < 5 ? Math.sin(frame * 2.7) * (5 - frame) * 2.2 : 0;
  const flash = interpolate(frame, [0, 4], [0.55, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translate(${shake}px, ${-shake * 0.6}px) scale(${punch}) rotate(${tilt}deg)` }}>{children}</AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
}

function CoverShot({ src, tilt }) {
  return (
    <Hit tilt={tilt}>
      <Img src={staticFile(src)} style={{ position: "absolute", inset: -120, width: 2160, height: 1320, objectFit: "cover", filter: "blur(46px) brightness(0.45) saturate(1.2)" }} />
      <Halftone opacity={0.08} size={10} />
      <AbsoluteFill style={{ display: "grid", placeItems: "center" }}>
        <Img src={staticFile(src)} style={{ height: 940, borderRadius: 12, boxShadow: "0 40px 90px rgba(0,0,0,0.75), 0 0 0 5px #000" }} />
      </AbsoluteFill>
    </Hit>
  );
}

function ClipShot({ asset, fallback, from }) {
  const { fps } = useVideoConfig();
  const own = useAsset(asset);
  const alt = useAsset(fallback);
  const pick = !own.missing && own.video ? own : alt;
  return (
    <Hit>
      {pick.src && pick.video ? (
        <OffthreadVideo src={pick.src} muted trimBefore={Math.round((own === pick ? 0 : from) * fps)} style={{ width: 1920, height: 1080, objectFit: "cover" }} />
      ) : (
        <AbsoluteFill style={{ backgroundColor: brand.bg }} />
      )}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
    </Hit>
  );
}

export function Logo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slam = spring({ frame, fps, config: { damping: 11, stiffness: 190 } });
  const words = spring({ frame: frame - 5, fps, config: { damping: 14, stiffness: 170 } });
  const tag = interpolate(frame, [12, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const flash = interpolate(frame, [0, 6], [0.8, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: `radial-gradient(60% 50% at 50% 50%, ${brand.blueBright} 0%, ${brand.blue} 45%, ${brand.bg} 100%)` }}>
      <Halftone opacity={0.1} size={12} />
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 50 }}>
        <Img src={staticFile("brand/badge-transparent.png")} style={{ width: 330, height: 330, transform: `scale(${2.2 - 1.2 * slam}) rotate(${(1 - slam) * -25}deg)`, filter: "drop-shadow(0 20px 50px rgba(0,0,0,0.7))" }} />
        <div style={{ display: "grid", gap: 16, opacity: Math.min(1, words * 1.4), transform: `translateX(${(1 - words) * 80}px)` }}>
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 190, lineHeight: 0.86, textTransform: "uppercase", color: "#fff" }}>
            Comix<span style={{ color: brand.gold }}>Catalog</span>
          </div>
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 70, textTransform: "uppercase", color: brand.gold, letterSpacing: "0.03em", opacity: tag }}>
            Comics. No homework.
          </div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
}

export function ChannelIntro({ episodeId = "episode-001" }) {
  useFonts();
  const { fps, durationInFrames } = useVideoConfig();
  const sting = resolveAudio(episodeId, "audio/MUSIC_STING", available);
  const f = (s) => Math.round(s * fps);
  return (
    <EpisodeContext.Provider value={{ episodeId }}>
      <AbsoluteFill style={{ backgroundColor: brand.bg }}>
        {SHOTS.map(([at, shot], i) => {
          const end = i + 1 < SHOTS.length ? SHOTS[i + 1][0] : LOGO_AT;
          return (
            <Sequence key={i} from={f(at)} durationInFrames={f(end) - f(at)} layout="none">
              <AbsoluteFill>{shot.kind === "cover" ? <CoverShot src={shot.src} tilt={i % 2 ? 3 : -3} /> : <ClipShot {...shot} />}</AbsoluteFill>
            </Sequence>
          );
        })}
        <Sequence from={f(LOGO_AT)} layout="none">
          <AbsoluteFill>
            <Logo />
          </AbsoluteFill>
        </Sequence>
        {sting && (
          <Audio src={staticFile(sting)} volume={(fr) => interpolate(fr, [0, durationInFrames - 20, durationInFrames], [0.9, 0.9, 0], { extrapolateRight: "clamp" })} />
        )}
      </AbsoluteFill>
    </EpisodeContext.Provider>
  );
}

export const CHANNEL_INTRO_FRAMES = CHANNEL_INTRO.frames;

// A compact brand hit for the post-cold-open transition. It intentionally
// uses the same logo animation and Funkorama sting as the full legacy intro.
export function ChannelSting({ episodeId = "episode-001" }) {
  useFonts();
  const sting = resolveAudio(episodeId, "audio/MUSIC_STING", available);
  return (
    <EpisodeContext.Provider value={{ episodeId }}>
      <AbsoluteFill style={{ backgroundColor: brand.bg }}>
        <Logo />
        {sting && <Audio src={staticFile(sting)} volume={0.9} />}
      </AbsoluteFill>
    </EpisodeContext.Provider>
  );
}
