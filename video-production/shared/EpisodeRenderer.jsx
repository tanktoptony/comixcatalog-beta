// Turns a normalized timeline into Remotion Sequences.

import React, { useEffect, useState } from "react";
import { AbsoluteFill, Sequence, continueRender, delayRender, interpolate, useCurrentFrame } from "remotion";
import "@fontsource/big-shoulders/800.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import { brand } from "./brand.js";
import { EpisodeContext, SegmentContext, Backdrop } from "./components/primitives.jsx";
import { CoverFull, KenBurnsCover, CoverPair, CoverGrid, CoverFan, StarterShelf } from "./components/covers.jsx";
import { ChapterCard, QuoteCard, TitleCard, ComixCatalogCard, EndCard, PlaceholderCard } from "./components/cards.jsx";

// Timeline `type` -> component. Add a type here and it is usable from any
// episode's timeline.
export const SEGMENT_TYPES = {
  title: TitleCard,
  chapter: ChapterCard,
  cover: CoverFull,
  kenBurns: KenBurnsCover,
  pair: CoverPair,
  grid: CoverGrid,
  fan: CoverFan,
  shelf: StarterShelf,
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

export function EpisodeRenderer({ episodeId, timeline }) {
  useFontsReady();
  return (
    <EpisodeContext.Provider value={{ episodeId }}>
      <AbsoluteFill style={{ backgroundColor: brand.bg }}>
        <Backdrop />
        {timeline.segments.map((seg) => {
          const Component = SEGMENT_TYPES[seg.type];
          const { type, at, dur, id, start, end, from, durationInFrames, transition, transitionIn, transitionOut, fadeIn, fadeOut, note, ...props } = seg;
          return (
            <Sequence key={seg.id} from={seg.from} durationInFrames={seg.durationInFrames} name={`${seg.id} ${seg.type}${seg.title ? ` · ${seg.title}` : ""}`}>
              <SegmentContext.Provider value={{ durationInFrames: seg.durationInFrames }}>
                <Shell seg={seg}>
                  {Component ? <Component {...props} /> : <PlaceholderCard asset={`UNKNOWN_TYPE_${type}`} label={`Unknown segment type "${type}"`} />}
                </Shell>
              </SegmentContext.Provider>
            </Sequence>
          );
        })}
      </AbsoluteFill>
    </EpisodeContext.Provider>
  );
}
