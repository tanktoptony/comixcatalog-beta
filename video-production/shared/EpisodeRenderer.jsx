// Turns a normalized timeline into Remotion Sequences.

import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import "@fontsource/big-shoulders/800.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import { brand } from "./brand.js";
import { EpisodeContext, SegmentContext, Backdrop, LogoBug, available } from "./components/primitives.jsx";
import { CoverFull, KenBurnsCover, MediaFull, CoverPair, CoverGrid, CoverFan, CoverStack, Triptych, StarterShelf, ShelfLater } from "./components/covers.jsx";
import { ChapterCard, QuoteCard, TitleCard, ComixCatalogCard, EndCard, PlaceholderCard, ScreenCapture } from "./components/cards.jsx";
import { withFallbacks, resolveAudio } from "./timeline.js";

// Timeline `type` -> component. Add a type here and it is usable from any
// episode's timeline.
export const SEGMENT_TYPES = {
  title: TitleCard,
  chapter: ChapterCard,
  cover: CoverFull,
  kenBurns: KenBurnsCover,
  media: MediaFull,
  pair: CoverPair,
  stack: CoverStack,
  triptych: Triptych,
  grid: CoverGrid,
  fan: CoverFan,
  shelf: StarterShelf,
  shelfLater: ShelfLater,
  screen: ScreenCapture,
  quote: QuoteCard,
  comixcatalog: ComixCatalogCard,
  end: EndCard,
  placeholder: PlaceholderCard,
};

// Short crossfade at each edge unless the segment asks for a cut.
function Shell({ seg, children }) {
  const frame = useCurrentFrame();
  const fadeIn = seg.transition === "cut" || seg.transitionIn === "cut" ? 0 : seg.fadeIn ?? 8;
  const fadeOut = seg.transition === "cut" || seg.transitionOut === "cut" ? 0 : seg.fadeOut ?? 8;
  const d = seg.durationInFrames;
  let opacity = 1;
  if (fadeIn > 0) opacity = Math.min(opacity, interpolate(frame, [0, fadeIn], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  if (fadeOut > 0) opacity = Math.min(opacity, interpolate(frame, [d - fadeOut, d], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}

function useFontsReady() {
  const [handle] = useState(() => delayRender("Loading brand fonts"));
  useEffect(() => {
    Promise.all([
      document.fonts.load("800 64px 'Big Shoulders'"),
      document.fonts.load("400 24px 'Inter'"),
      document.fonts.load("600 24px 'Inter'"),
      document.fonts.load("700 24px 'Inter'"),
    ]).then(() => continueRender(handle), (err) => {
      console.error("Font load failed", err);
      continueRender(handle);
    });
  }, [handle]);
}

// Narration, music bed and sting, from the episode's `audio` plan. Missing
// files are skipped (the asset report lists them), so a silent render still
// works.
export function EpisodeAudio({ audio, episodeId }) {
  const { fps, durationInFrames } = useVideoConfig();
  if (!audio) return null;
  const src = (a) => {
    const p = resolveAudio(episodeId, a?.asset, available);
    return p ? staticFile(p) : null;
  };
  const clampFade = (f, len, fadeIn, fadeOut, vol) => {
    let v = vol;
    if (fadeIn) v = Math.min(v, interpolate(f, [0, fadeIn * fps], [0, vol], { extrapolateRight: "clamp" }));
    if (fadeOut) v = Math.min(v, interpolate(f, [len - fadeOut * fps, len], [vol, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
    return v;
  };
  const narration = src(audio.narration);
  const music = src(audio.music);
  const sting = src(audio.sting);
  return (
    <>
      {narration &&
        (audio.narration.clips ?? [{ at: audio.narration.at ?? 0, from: 0, to: null }]).map((c, i) => (
          <Sequence key={i} from={Math.round(c.at * fps)} name={`Narration ${i + 1}`}>
            <Audio
              src={narration}
              volume={audio.narration.volume ?? 1}
              trimBefore={Math.round((c.from ?? 0) * fps)}
              {...(c.to != null ? { trimAfter: Math.round(c.to * fps) } : {})}
            />
          </Sequence>
        ))}
      {music && (
        <Audio
          src={music}
          loop={audio.music.loop ?? true}
          volume={(f) => clampFade(f, durationInFrames, audio.music.fadeIn, audio.music.fadeOut, audio.music.volume ?? 0.1)}
        />
      )}
      {sting && (
        <Sequence from={Math.round((audio.sting.at ?? 0) * fps)} durationInFrames={Math.round((audio.sting.dur ?? 8) * fps)} name="Sting">
          <Audio
            src={sting}
            volume={(f) => clampFade(f, Math.round((audio.sting.dur ?? 8) * fps), 0, audio.sting.fadeOut, audio.sting.volume ?? 0.35)}
          />
        </Sequence>
      )}
    </>
  );
}

export function EpisodeRenderer({ episodeId, timeline }) {
  useFontsReady();
  return (
    <EpisodeContext.Provider value={{ episodeId }}>
      <AbsoluteFill style={{ backgroundColor: brand.bg }}>
        <Backdrop />
        {timeline.segments.map((rawSeg) => {
          const seg = withFallbacks(rawSeg, episodeId, available);
          const Component = SEGMENT_TYPES[seg.type];
          const { type, at, dur, id, start, end, from, durationInFrames, transition, transitionIn, transitionOut, fadeIn, fadeOut, note, need, beat, fallback, usingFallbackFor, bug, ...props } = seg;
          return (
            <Sequence key={seg.id} from={seg.from} durationInFrames={seg.durationInFrames} name={`${seg.id} ${seg.type}${seg.title ? ` · ${seg.title}` : ""}`}>
              <SegmentContext.Provider value={{ durationInFrames: seg.durationInFrames }}>
                <Shell seg={seg}>
                  {Component ? <Component {...props} /> : <PlaceholderCard asset={`UNKNOWN_TYPE_${type}`} label={`Unknown segment type "${type}"`} />}
                  {bug && <LogoBug />}
                </Shell>
              </SegmentContext.Provider>
            </Sequence>
          );
        })}
        <EpisodeAudio audio={timeline.audio} episodeId={episodeId} />
      </AbsoluteFill>
    </EpisodeContext.Provider>
  );
}
