// Vertical Shorts / Reels cut from an episode (1080x1920), built natively
// for the phone: each segment's art fills the frame (multi-cover segments
// rapid-fire through their covers), every cut punches in with a flash, the
// hook pops at the top, and captions run 1-3 words at a time with the word
// being spoken in gold. Audio is the episode's own mix for the same range.
// Clip ranges are script phrases (shorts.js), so they re-time with the
// narration like everything else.

import React, { useEffect, useMemo, useState } from "react";
import { AbsoluteFill, Audio, Img, Sequence, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import "@fontsource/big-shoulders/800.css";
import "@fontsource/inter/700.css";
import { brand, fonts } from "../shared/brand.js";
import { EpisodeAudio } from "../shared/EpisodeRenderer.jsx";
import { EpisodeContext, Media, useAsset, available, Halftone } from "../shared/components/primitives.jsx";
import { withFallbacks, resolveAudio } from "../shared/timeline.js";
import { fixCaption } from "../episode-001/captionFixes.js";

const W = 1080;
const H = 1920;
const END_CARD = 2.6;

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
      WebkitTextStroke: `${Math.max(4, Math.round(size / 14))}px #000`,
      paintOrder: "stroke fill",
      textShadow: "0 8px 30px rgba(0,0,0,0.55)",
      ...style,
    }}
  >
    {children}
  </div>
);

// Every image a segment shows, in order.
function assetsOf(seg) {
  const list = seg.asset ? [seg.asset] : seg.assets ?? seg.items ?? [];
  return list.map((a) => (typeof a === "string" ? a : a?.asset)).filter(Boolean);
}

// One image, full-bleed: its own art blurred behind, the art itself cropped
// to the frame, punching in from 1.14x and then drifting closer.
function Shot({ asset, position, focus, len }) {
  const frame = useCurrentFrame();
  const { src, video } = useAsset(asset);
  const punch = interpolate(frame, [0, 7], [1.14, 1], { extrapolateRight: "clamp" });
  const drift = interpolate(frame, [0, Math.max(1, len)], [1, 1.07], { extrapolateRight: "clamp" });
  const objectPosition = focus ? `${focus.x * 100}% ${focus.y * 100}%` : position ?? "50% 35%";
  const zoom = focus?.zoom ? 1 + (focus.zoom - 1) * 0.5 : 1;
  const flash = interpolate(frame, [0, 5], [0.38, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: brand.bg }}>
      {src && !video && (
        <Img src={src} style={{ position: "absolute", inset: -100, width: W + 200, height: H + 200, objectFit: "cover", filter: "blur(50px) brightness(0.4)" }} />
      )}
      <AbsoluteFill style={{ transform: `scale(${punch * drift * zoom})`, transformOrigin: objectPosition }}>
        <Media asset={asset} box={{ w: W, h: H }} fit="cover" style={{ width: W, height: H, objectFit: "cover", objectPosition }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
}

// A segment with no art (chapter and title cards): the line itself, huge.
function TitleShot({ title }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 12, stiffness: 180 } });
  return (
    <AbsoluteFill style={{ background: `radial-gradient(70% 45% at 50% 42%, ${brand.blueBright}aa 0%, ${brand.blue} 45%, ${brand.bg} 100%)` }}>
      <Halftone opacity={0.1} size={12} />
      <AbsoluteFill style={{ display: "grid", placeItems: "center", padding: "0 70px" }}>
        <div style={{ transform: `scale(${0.6 + 0.4 * s})`, opacity: s, marginTop: -560 }}>
          {String(title ?? "")
            .split("\n")
            .map((line, i) => (
              <Stroke key={i} size={128} color={i === 0 ? brand.gold : "#fff"}>
                {line}
              </Stroke>
            ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// A segment's run of shots: multi-cover segments cycle fast (at least 8
// frames a cover), single images hold for the whole segment.
function SegmentShots({ seg, episodeId }) {
  const s = withFallbacks(seg, episodeId, available);
  const assets = assetsOf(s);
  const len = s.durationInFrames;
  if (!assets.length) return <TitleShot title={s.title} />;
  const per = Math.max(8, Math.floor(len / assets.length));
  const shown = assets.slice(0, Math.ceil(len / per));
  return (
    <>
      {shown.map((asset, i) => (
        <Sequence key={i} from={i * per} durationInFrames={i === shown.length - 1 ? len - i * per : per} layout="none">
          <AbsoluteFill>
            <Shot asset={asset} position={s.position} focus={s.focus} len={per} />
          </AbsoluteFill>
        </Sequence>
      ))}
      {s.title && s.type !== "chapter" && <Label text={s.title.replace(/\n/g, " ")} />}
    </>
  );
}

function Label({ text }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [4, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", top: 470, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: o }}>
      <div
        style={{
          background: brand.gold,
          color: "#000",
          fontFamily: fonts.display,
          fontWeight: 800,
          fontSize: 46,
          textTransform: "uppercase",
          padding: "10px 22px 6px",
          border: "4px solid #000",
          boxShadow: "6px 6px 0 #000",
          maxWidth: 900,
          textAlign: "center",
        }}
      >
        {text}
      </div>
    </div>
  );
}

// Transcript words -> display words (glue "X" + "-Men") -> caption chunks of
// up to 3 words, broken at punctuation and pauses. Times are episode seconds.
function buildChunks(words, voiceAt) {
  const disp = [];
  for (const w of words) {
    const prev = disp[disp.length - 1];
    if (prev && /^[-']/.test(w.w)) {
      prev.w += w.w;
      prev.e = w.e;
    } else disp.push({ w: w.w, s: w.s, e: w.e });
  }
  const chunks = [];
  let cur = [];
  disp.forEach((w, i) => {
    cur.push(w);
    const next = disp[i + 1];
    const text = cur.map((x) => x.w).join(" ");
    if (!next || cur.length >= 3 || /[.,!?;:]$/.test(w.w) || next.s - w.e > 0.35 || text.length > 16) {
      chunks.push(cur);
      cur = [];
    }
  });
  return chunks.map((ws, i) => {
    const fixed = fixCaption(ws.map((x) => x.w).join(" ")).split(" ");
    const parts = fixed.length === ws.length ? ws.map((x, j) => ({ ...x, w: fixed[j] })) : [{ w: fixed.join(" "), s: ws[0].s, e: ws.at(-1).e }];
    const nextStart = chunks[i + 1]?.[0]?.s ?? Infinity;
    return {
      s: voiceAt + ws[0].s,
      e: voiceAt + Math.min(nextStart, ws.at(-1).e + 0.5),
      words: parts.map((p) => ({ w: p.w.replace(/[.,;:]$/, ""), s: voiceAt + p.s })),
    };
  });
}

function Captions({ chunks, t }) {
  const { fps } = useVideoConfig();
  const c = chunks.find((x) => x.s <= t && t < x.e);
  if (!c) return null;
  const sinceStart = (t - c.s) * fps;
  const pop = spring({ frame: sinceStart, fps, config: { damping: 14, stiffness: 260 } });
  let active = -1;
  c.words.forEach((w, i) => {
    if (w.s <= t) active = i;
  });
  return (
    <div style={{ position: "absolute", top: 1130, left: 50, right: 50, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 26px", transform: `scale(${0.85 + 0.15 * pop})` }}>
      {c.words.map((w, i) => (
        <Stroke key={i} size={124} color={i === active ? brand.gold : "#fff"} style={{ transform: i === active ? "scale(1.08)" : "none" }}>
          {w.w}
        </Stroke>
      ))}
    </div>
  );
}

export function ShortClip({ episodeId, timeline, from, to, hook, words = [] }) {
  useFonts();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = from + frame / fps;
  const fromF = Math.round(from * fps);
  const toF = Math.round(to * fps);
  const voiceAt = timeline.audio?.narration?.at ?? 0;
  const chunks = useMemo(() => buildChunks(words, voiceAt), [words, voiceAt]);
  const segs = timeline.segments.filter((s) => s.from + s.durationInFrames > fromF && s.from < toF);
  const endCardAt = durationInFrames - Math.round(END_CARD * fps);
  const endOpacity = interpolate(frame, [endCardAt, endCardAt + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const hookPop = spring({ frame, fps, config: { damping: 10, stiffness: 200 } });
  const progress = Math.min(1, frame / Math.max(1, endCardAt));
  const stingPath = resolveAudio(episodeId, timeline.audio?.sting?.asset, available);

  return (
    <EpisodeContext.Provider value={{ episodeId }}>
      <AbsoluteFill style={{ backgroundColor: brand.bg }}>
        {segs.map((seg) => (
          <Sequence key={seg.id} from={seg.from - fromF} durationInFrames={seg.durationInFrames} layout="none">
            <AbsoluteFill>
              <SegmentShots seg={seg} episodeId={episodeId} />
            </AbsoluteFill>
          </Sequence>
        ))}

        {/* Legibility: dark at the top for the hook, and behind the captions. */}
        <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.6) 68%, rgba(0,0,0,0.2) 85%)" }} />

        <div style={{ position: "absolute", top: 130, left: 0, right: 0, display: "flex", justifyContent: "center", transform: `scale(${0.5 + 0.5 * hookPop}) rotate(-1.5deg)`, opacity: Math.min(1, hookPop * 1.5) }}>
          <div style={{ background: "#000", border: `6px solid ${brand.gold}`, boxShadow: "10px 10px 0 rgba(0,0,0,0.5)", padding: "22px 34px 16px", maxWidth: 960 }}>
            <Stroke size={88} color={brand.gold} style={{ WebkitTextStroke: "0", textShadow: "none" }}>{hook}</Stroke>
          </div>
        </div>

        {frame < endCardAt && <Captions chunks={chunks} t={t} />}

        <div style={{ position: "absolute", top: 0, left: 0, height: 12, width: W * progress, background: brand.gold }} />

        <Sequence from={-fromF} durationInFrames={toF} layout="none">
          <EpisodeAudio audio={timeline.audio} episodeId={episodeId} />
        </Sequence>
        {stingPath && (
          <Sequence from={endCardAt} layout="none">
            <Audio src={staticFile(stingPath)} volume={(f) => interpolate(f, [0, 50, 78], [0.3, 0.3, 0], { extrapolateRight: "clamp" })} />
          </Sequence>
        )}

        <AbsoluteFill style={{ opacity: endOpacity, background: `radial-gradient(70% 45% at 50% 45%, ${brand.blueBright} 0%, ${brand.blue} 45%, ${brand.bg} 100%)`, display: "grid", placeItems: "center" }}>
          <div style={{ padding: "0 70px", display: "grid", justifyItems: "center", gap: 40 }}>
            <Img src={staticFile("brand/badge-transparent.png")} style={{ width: 170, height: 170 }} />
            <Stroke size={118} color={brand.gold}>Full video on the channel</Stroke>
            <div style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 46, color: brand.text, textAlign: "center" }}>Where to Start Reading X-Men</div>
            <div style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 40, color: brand.gold, textAlign: "center" }}>comixcatalog.com</div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </EpisodeContext.Provider>
  );
}
