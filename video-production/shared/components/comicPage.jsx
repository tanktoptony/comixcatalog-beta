// Comic-page thumbnail kit (1280x720 stills). Tony, 2026-11-02: the navy and
// gold title cards were all starting to look the same. Thumbnails now read as
// a comic page first (real art in panels, white gutters, lettered captions and
// balloons) and the brand shrinks to one small corner bar.

import React, { useEffect, useState } from "react";
import { AbsoluteFill, Img, continueRender, delayRender, staticFile } from "remotion";
import "@fontsource/bangers/400.css";
import "@fontsource/big-shoulders/800.css";
import { brand, fonts } from "../brand.js";
import { available } from "./primitives.jsx";
import { resolveAsset } from "../timeline.js";

export const PAGE = { paper: "#f7f2e4", ink: "#0a0a0a", line: 7 };
export const lettering = "'Bangers', 'Impact', sans-serif";

export function useComicFonts() {
  const [h] = useState(() => delayRender("comic fonts"));
  useEffect(() => {
    Promise.all([document.fonts.load("400 90px 'Bangers'"), document.fonts.load("800 40px 'Big Shoulders'")])
      .then(() => continueRender(h), () => continueRender(h));
  }, [h]);
}

// art(EP, [path, width, height, trimTop]) -> what a Panel needs. trimTop is
// the share of the image a panel may never show from the top (a cover's logo
// and credits), so a panel reads as interior art. A missing file fails the
// render instead of leaving an empty panel.
export function art(episode, [asset, width, height, trimTop = 0]) {
  const file = resolveAsset(episode, asset, available);
  if (!file) throw new Error(`thumbnail art missing: ${episode}/${asset} (sync it into public/)`);
  return { src: staticFile(file), size: [width, height], trimTop };
}

// Cream page with faint print dots. Everything else sits on it.
export function Paper({ children }) {
  return <AbsoluteFill style={{ backgroundColor: PAGE.paper }}>
    <AbsoluteFill style={{ backgroundImage: "radial-gradient(circle, rgba(0,0,0,.07) 1.1px, transparent 1.5px)", backgroundSize: "6px 6px" }} />
    {children}
  </AbsoluteFill>;
}

function bounds(points) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// A panel is a polygon in canvas pixels with an ink border. The art covers
// the polygon's bounding box; `focus` is the point of the source image (0 to 1)
// to center on and `zoom` scales past a plain cover fit.
export function Panel({ points, image, focus = [0.5, 0.5], zoom = 1, children }) {
  const b = bounds(points);
  const [sw, sh] = image.size;
  const trim = sh * image.trimTop;
  const fit = Math.max(b.w / sw, b.h / (sh - trim)) * zoom;
  const dw = sw * fit, dh = sh * fit;
  const left = Math.min(b.x, Math.max(b.x + b.w - dw, b.x + b.w / 2 - focus[0] * dw));
  const top = Math.min(b.y - trim * fit, Math.max(b.y + b.h - dh, b.y + b.h / 2 - focus[1] * dh));
  const poly = points.map(([x, y]) => `${x}px ${y}px`).join(", ");
  return <>
    <AbsoluteFill style={{ clipPath: `polygon(${poly})` }}>
      <Img src={image.src} style={{ position: "absolute", left, top, width: dw, height: dh }} />
      {children}
    </AbsoluteFill>
    <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
      <polygon points={points.map((p) => p.join(",")).join(" ")} fill="none" stroke={PAGE.ink} strokeWidth={PAGE.line} strokeLinejoin="miter" />
    </svg>
  </>;
}

const line = (l) => (typeof l === "string" ? { text: l } : l);

// Narration caption: lettered box, gold by default (the site's --x-gold).
export function Caption({ lines, size = 84, pos, rotate = -2, bg = brand.gold, color = PAGE.ink }) {
  return <div style={{ position: "absolute", ...pos, transform: `rotate(${rotate}deg)`, background: bg, border: `5px solid ${PAGE.ink}`, boxShadow: `7px 7px 0 ${PAGE.ink}`, padding: "12px 24px 4px" }}>
    {lines.map(line).map((l, i) => <div key={i} style={{ fontFamily: lettering, fontSize: l.size ?? size, lineHeight: 0.95, letterSpacing: ".015em", color: l.color ?? color, whiteSpace: "nowrap" }}>{l.text}</div>)}
  </div>;
}

// Speech balloon: an ellipse at x,y,w,h with a tail ending at `tail`. Drawn
// twice (outline pass, then fill pass) so the tail joins without a seam.
export function Balloon({ x, y, w, h, tail, lines, size = 64, color = PAGE.ink }) {
  const cx = x + w / 2, cy = y + h / 2;
  const dx = tail[0] - cx, dy = tail[1] - cy, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, base = Math.min(w, h) * 0.16;
  const bx = cx + ux * Math.min(w, h) * 0.3, by = cy + uy * Math.min(w, h) * 0.3;
  const tri = `${bx - uy * base},${by + ux * base} ${bx + uy * base},${by - ux * base} ${tail[0]},${tail[1]}`;
  const shape = (props) => <>
    <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} {...props} />
    <polygon points={tri} {...props} />
  </>;
  return <>
    <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <g transform="translate(7 7)">{shape({ fill: PAGE.ink })}</g>
      {shape({ fill: "#fff", stroke: PAGE.ink, strokeWidth: 12, strokeLinejoin: "round" })}
      {shape({ fill: "#fff" })}
    </svg>
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", paddingTop: size * 0.08 }}>
      {lines.map(line).map((l, i) => <div key={i} style={{ fontFamily: lettering, fontSize: l.size ?? size, lineHeight: 0.98, letterSpacing: ".015em", color: l.color ?? color, whiteSpace: "nowrap" }}>{l.text}</div>)}
    </div>
  </>;
}

// The brand, kept to one small bar in a corner: badge, series, ComixCatalog.
export function CornerBar({ title, sub, pos = { left: 0, top: 0 }, scale = 1 }) {
  return <div style={{ position: "absolute", ...pos, transform: `scale(${scale})`, transformOrigin: "left top", display: "flex", alignItems: "stretch", height: 66, boxShadow: `6px 6px 0 ${PAGE.ink}`, border: `4px solid ${PAGE.ink}` }}>
    <div style={{ background: brand.blue, display: "flex", alignItems: "center", padding: "0 8px" }}>
      <Img src={staticFile("brand/badge-transparent.png")} style={{ height: 52, width: "auto" }} />
    </div>
    <div style={{ background: brand.bg, borderLeft: `6px solid ${brand.gold}`, padding: "6px 16px 2px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 30, lineHeight: 0.95, color: "#fff", textTransform: "uppercase", letterSpacing: ".02em", whiteSpace: "nowrap" }}>{title}</div>
      <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 17, lineHeight: 1.1, color: brand.gold, textTransform: "uppercase", letterSpacing: ".14em", whiteSpace: "nowrap" }}>{sub}</div>
    </div>
  </div>;
}
