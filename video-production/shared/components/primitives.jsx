// Building blocks every segment component uses: the backdrop, a comic-panel
// framed image, the narration-box caption, full-frame media, and the
// missing-asset placeholder.

import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Gif } from "@remotion/gif";
import { brand, fonts } from "../brand.js";
import { assetPath, isVideo, resolveAsset } from "../timeline.js";
import assetIndex from "../generated/assetIndex.json";

export const available = new Set(assetIndex.files);

export const EpisodeContext = React.createContext({ episodeId: "" });
// Length of the segment being drawn, so camera moves span the segment and
// not the whole episode.
export const SegmentContext = React.createContext({ durationInFrames: 1 });

// { src, path, missing, video } for a timeline asset reference.
export function useAsset(asset) {
  const { episodeId } = React.useContext(EpisodeContext);
  if (!asset) return { src: null, path: null, missing: false, video: false };
  const path = resolveAsset(episodeId, asset, available);
  return path
    ? { src: staticFile(path), path, missing: false, video: isVideo(path) }
    : { src: null, path: assetPath(episodeId, asset), missing: true, video: false };
}

// Image, animated GIF or muted video, whichever the asset turned out to be.
// GIFs render frame-accurately through @remotion/gif (a plain <img> would
// animate on wall-clock time and render nondeterministically); they draw to
// a canvas, so they take the pixel box they fill (default: the full frame).
export function Media({ asset, style, box = { w: 1920, h: 1080 }, fit = "cover", gifRate = 1 }) {
  const { src, path, missing, video } = useAsset(asset);
  if (missing) return <MissingAsset path={path} />;
  if (/\.gif$/i.test(path)) return <Gif src={src} width={box.w} height={box.h} fit={fit} style={style} loopBehavior="loop" playbackRate={gifRate} />;
  return video ? <OffthreadVideo src={src} muted style={style} /> : <Img src={src} style={style} />;
}

// Charcoal field, faint halftone, soft vignette. Static on purpose: motion
// belongs to the covers, not the wallpaper. `field` swaps the base color
// (black for "on black", deep red for House of M); `tint` colors the glow.
export function Backdrop({ tint = brand.blue, field = brand.bg, glow = 0.33, children }) {
  const a = Math.round(glow * 255).toString(16).padStart(2, "0");
  const b = Math.round(glow * 0.6 * 255).toString(16).padStart(2, "0");
  return (
    <AbsoluteFill style={{ backgroundColor: field }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 18% 12%, ${tint}${a} 0%, transparent 55%), radial-gradient(ellipse at 85% 95%, ${tint}${b} 0%, transparent 50%)`,
        }}
      />
      <Halftone />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
      {children}
    </AbsoluteFill>
  );
}

export function Halftone({ opacity = 0.07, size = 9 }) {
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `radial-gradient(circle, rgba(255,255,255,${opacity}) 1.3px, transparent 1.7px)`,
        backgroundSize: `${size}px ${size}px`,
      }}
    />
  );
}

// A cover's own art, blurred and darkened, as the field behind it.
export function CoverBackdrop({ asset }) {
  const { src, missing, video } = useAsset(asset);
  if (missing || video) return <Backdrop />;
  return (
    <AbsoluteFill style={{ backgroundColor: brand.bg, overflow: "hidden" }}>
      <Img
        src={src}
        style={{ position: "absolute", inset: -80, width: "calc(100% + 160px)", height: "calc(100% + 160px)", objectFit: "cover", filter: "blur(42px) brightness(0.32) saturate(1.1)" }}
      />
      <Halftone opacity={0.06} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)" }} />
    </AbsoluteFill>
  );
}

// An image inside a comic-panel border: heavy ink line, thin paper gutter.
export function Panel({ asset, width, height, style, imgStyle, fit = "cover" }) {
  return (
    <div
      style={{
        width,
        height,
        boxSizing: "border-box",
        border: `7px solid ${brand.ink}`,
        outline: `3px solid ${brand.offwhite}`,
        boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
        overflow: "hidden",
        background: brand.surface,
        position: "relative",
        ...style,
      }}
    >
      <Media asset={asset} box={{ w: Math.round(width), h: Math.round(height) }} fit={fit} style={{ width: "100%", height: "100%", objectFit: fit, display: "block", ...imgStyle }} />
    </div>
  );
}

// Clearly a development placeholder. Never a stand-in image.
export function MissingAsset({ path }) {
  const name = String(path ?? "").split("/").pop();
  return (
    <AbsoluteFill
      style={{
        background: `repeating-linear-gradient(45deg, #1a0508 0 22px, #2a0a10 22px 44px)`,
        border: `4px dashed ${brand.red}`,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontFamily: fonts.body, fontWeight: 600, color: "#ffb3be", fontSize: 30, textAlign: "center", lineHeight: 1.3, wordBreak: "break-word" }}>
        [MISSING: {name}]
      </div>
    </AbsoluteFill>
  );
}

// Narration-box caption: paper box, ink border, hard offset shadow.
export function NarrationBox({ kicker, title, sub, align = "left", delay = 8, style }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  if (!title && !kicker) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: align === "left" ? 110 : align === "center" ? "50%" : undefined,
        right: align === "right" ? 110 : undefined,
        bottom: 96,
        transform: `${align === "center" ? "translateX(-50%) " : ""}translateY(${(1 - p) * 30}px)`,
        opacity: p,
        maxWidth: 1100,
        ...style,
      }}
    >
      {kicker && (
        <div
          style={{
            display: "inline-block",
            background: brand.gold,
            color: brand.ink,
            fontFamily: fonts.body,
            fontWeight: 700,
            fontSize: 22,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            padding: "6px 14px",
            border: `4px solid ${brand.ink}`,
            borderBottom: "none",
          }}
        >
          {kicker}
        </div>
      )}
      {title && (
        <div
          style={{
            background: brand.offwhite,
            color: brand.ink,
            border: `5px solid ${brand.ink}`,
            boxShadow: `10px 10px 0 ${brand.ink}`,
            padding: "14px 26px 16px",
            fontFamily: fonts.display,
            fontWeight: 800,
            fontSize: title.length > 40 ? 50 : 64,
            lineHeight: 1,
            textTransform: "uppercase",
            letterSpacing: "0.01em",
          }}
        >
          {title}
          {sub && (
            <div style={{ fontFamily: fonts.body, fontWeight: 600, fontSize: 26, textTransform: "none", marginTop: 8, letterSpacing: 0 }}>
              {sub}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Recommendation number: large gold numeral, per the episode's brand notes.
export function Numeral({ n, style }) {
  const e = useEntrance(0, 0, 2);
  if (n == null) return null;
  return (
    <div
      style={{
        position: "absolute",
        fontFamily: fonts.display,
        fontWeight: 800,
        fontSize: 300,
        lineHeight: 0.8,
        color: brand.gold,
        WebkitTextStroke: `6px ${brand.ink}`,
        textShadow: `12px 12px 0 ${brand.ink}`,
        opacity: e,
        transform: `translateY(${(1 - e) * 30}px)`,
        ...style,
      }}
    >
      {n}
    </div>
  );
}

// Small ComixCatalog bug, lower right. Only where the blueprint allows it.
export function LogoBug() {
  return (
    <div style={{ position: "absolute", right: 48, bottom: 40, display: "flex", alignItems: "center", gap: 12, opacity: 0.9 }}>
      <Img src={staticFile("brand/badge-transparent.png")} style={{ height: 64, width: "auto" }} />
    </div>
  );
}

// 0 -> 1 across the segment, eased, for slow camera moves.
export function useProgress() {
  const frame = useCurrentFrame();
  const { durationInFrames } = React.useContext(SegmentContext);
  return interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => t * t * (3 - 2 * t),
  });
}

// Staggered entrance for item i of a group.
export function useEntrance(i, stagger = 5, delay = 4) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay - i * stagger, fps, config: { damping: 200 } });
}
