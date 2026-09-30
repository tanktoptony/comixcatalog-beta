// Cover segments. All motion is slow and linear-ish: push-ins, pans, gentle
// staggered entrances. No spins, no flashes.

import React from "react";
import { AbsoluteFill, Img, interpolate } from "remotion";
import { brand, fonts } from "../brand.js";
import { Backdrop, CoverBackdrop, MissingAsset, NarrationBox, Panel, useAsset, useEntrance, useProgress } from "./primitives.jsx";

const COVER_ASPECT = 0.66; // US comic cover, width / height

// Camera moves. Framed moves keep the whole cover visible in its panel;
// pan/focus moves fill the frame and travel across the art.
const MOVES = {
  still: () => ({ scale: 1, x: 0, y: 0 }),
  slowPush: (p) => ({ scale: 1 + 0.07 * p, x: 0, y: 0 }),
  slowPull: (p) => ({ scale: 1.07 - 0.07 * p, x: 0, y: 0 }),
  driftLeft: (p) => ({ scale: 1.04, x: 22 - 44 * p, y: 0 }),
  driftRight: (p) => ({ scale: 1.04, x: -22 + 44 * p, y: 0 }),
};

// A single cover, full-height in a panel, over its own blurred art.
// treatment: still | slowPush | slowPull | driftLeft | driftRight | panDown | panUp | focus
export function CoverFull({ asset, treatment = "slowPush", focus, kicker, title, sub, captionAlign = "left" }) {
  if (treatment === "panDown" || treatment === "panUp" || treatment === "focus") {
    return <KenBurnsCover asset={asset} treatment={treatment} focus={focus} kicker={kicker} title={title} sub={sub} captionAlign={captionAlign} />;
  }
  const p = useProgress();
  const enter = useEntrance(0, 0, 0);
  const m = (MOVES[treatment] ?? MOVES.slowPush)(p);
  const h = 900;
  // With a caption, the cover moves to one side and the caption takes the
  // other, vertically centred beside it, so neither covers the other.
  const captioned = !!(title || kicker);
  const coverOnLeft = captionAlign !== "left";
  const offsetX = captioned ? (coverOnLeft ? -330 : 330) : 0;
  return (
    <AbsoluteFill>
      <CoverBackdrop asset={asset} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ transform: `translate(${offsetX + m.x}px, ${m.y + (1 - enter) * 24}px) scale(${m.scale})`, opacity: enter }}>
          <Panel asset={asset} width={Math.round(h * COVER_ASPECT)} height={h} fit="contain" />
        </div>
      </AbsoluteFill>
      {captioned && (
        <NarrationBox
          kicker={kicker}
          title={title}
          sub={sub}
          style={coverOnLeft ? { left: 1010, right: undefined, bottom: 420, maxWidth: 800 } : { left: 110, right: undefined, bottom: 420, maxWidth: 800 }}
        />
      )}
    </AbsoluteFill>
  );
}

// Full-frame travel across a cover's art. `focus` = { x, y, zoom } with x/y
// as 0..1 fractions of the cover: the camera eases from the whole-width view
// into that point.
export function KenBurnsCover({ asset, treatment = "panDown", focus, kicker, title, sub, captionAlign = "left" }) {
  const p = useProgress();
  const { src, path, missing } = useAsset(asset);
  const W = 1920;
  const coverH = W / COVER_ASPECT; // cover scaled to frame width
  const travel = coverH - 1080;
  let scale = 1;
  let x = 0;
  let y;
  if (treatment === "panUp") y = -travel * (1 - p);
  else if (treatment === "focus") {
    const f = { x: 0.5, y: 0.35, zoom: 1.6, ...focus };
    scale = interpolate(p, [0, 1], [1, f.zoom]);
    const cy = f.y * coverH;
    y = interpolate(p, [0, 1], [-(coverH / 2 - 540), -(cy * f.zoom - 540)]);
    x = interpolate(p, [0, 1], [0, -(f.x * W * f.zoom - 960)]);
    y = Math.min(0, Math.max(-(coverH * scale - 1080), y));
    x = Math.min(0, Math.max(-(W * scale - W), x));
  } else y = -travel * p;
  return (
    <AbsoluteFill style={{ backgroundColor: brand.bg, overflow: "hidden" }}>
      {missing ? (
        <MissingAsset path={path} />
      ) : (
        <Img
          src={src}
          style={{ position: "absolute", left: 0, top: 0, width: W, height: coverH, transformOrigin: "0 0", transform: `translate(${x}px, ${y}px) scale(${scale})` }}
        />
      )}
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(9,12,17,0.75) 0%, transparent 35%)" }} />
      <NarrationBox kicker={kicker} title={title} sub={sub} align={captionAlign} />
    </AbsoluteFill>
  );
}

function Labeled({ label, sub, children, width }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width }}>
      {children}
      {label && (
        <div style={{ marginTop: 26, fontFamily: fonts.display, fontWeight: 800, fontSize: 40, color: brand.text, textTransform: "uppercase", textAlign: "center", lineHeight: 1 }}>
          {label}
        </div>
      )}
      {sub && <div style={{ marginTop: 6, fontFamily: fonts.body, fontSize: 22, color: brand.textMuted, textAlign: "center" }}>{sub}</div>}
    </div>
  );
}

const itemOf = (a) => (typeof a === "string" ? { asset: a } : a);

// Two covers side by side: comparisons, before/after, a run's start and end.
export function CoverPair({ assets = [], kicker, title, sub }) {
  const p = useProgress();
  const items = assets.slice(0, 2).map(itemOf);
  const h = title ? 700 : 800;
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: title ? "flex-start" : "center", paddingTop: title ? 70 : 0 }}>
        <div style={{ display: "flex", gap: 120, transform: `scale(${1 + 0.03 * p})` }}>
          {items.map((it, i) => (
            <PairItem key={i} i={i} it={it} h={h} />
          ))}
        </div>
      </AbsoluteFill>
      <NarrationBox kicker={kicker} title={title} sub={sub} align="center" style={{ bottom: 60 }} />
    </AbsoluteFill>
  );
}

function PairItem({ it, i, h }) {
  const e = useEntrance(i, 8);
  return (
    <div style={{ opacity: e, transform: `translateY(${(1 - e) * 40}px)` }}>
      <Labeled label={it.label} sub={it.sub} width={Math.round(h * COVER_ASPECT)}>
        <Panel asset={it.asset} width={Math.round(h * COVER_ASPECT)} height={h} fit="contain" />
      </Labeled>
    </div>
  );
}

// A run at a glance. highlight = index to keep lit while the rest dim.
export function CoverGrid({ assets = [], columns, highlight, kicker, title, sub }) {
  const items = assets.map(itemOf);
  const n = items.length;
  const cols = columns ?? (n <= 5 ? n : n <= 8 ? 4 : n <= 10 ? 5 : 6);
  const rows = Math.ceil(n / cols);
  const areaH = title ? 700 : 900;
  const gap = 34;
  const h = Math.min((areaH - gap * (rows - 1)) / rows, ((1700 - gap * (cols - 1)) / cols) / COVER_ASPECT);
  const w = h * COVER_ASPECT;
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: title ? 190 : 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${w}px)`, gap }}>
          {items.map((it, i) => (
            <GridItem key={i} i={i} it={it} w={w} h={h} dim={highlight != null && highlight !== i} />
          ))}
        </div>
      </AbsoluteFill>
      <NarrationBox kicker={kicker} title={title} sub={sub} align="center" style={{ bottom: 60 }} />
    </AbsoluteFill>
  );
}

function GridItem({ it, i, w, h, dim }) {
  const e = useEntrance(i, 4);
  return (
    <div style={{ opacity: e * (dim ? 0.3 : 1), transform: `translateY(${(1 - e) * 30}px) scale(${0.96 + 0.04 * e})`, filter: dim ? "grayscale(0.7)" : "none" }}>
      <Panel asset={it.asset} width={w} height={h} fit="contain" style={{ borderWidth: 5, outlineWidth: 2 }} />
    </div>
  );
}

// Covers stacked, then fanned: "these all belong together".
export function CoverFan({ assets = [], kicker, title, sub, spread = 1 }) {
  const items = assets.map(itemOf);
  const n = items.length;
  const open = useEntrance(0, 0, 6);
  const p = useProgress();
  const h = 720;
  const w = h * COVER_ASPECT;
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: title ? 160 : 0 }}>
        <div style={{ position: "relative", width: w, height: h, transform: `scale(${1 + 0.03 * p})` }}>
          {items.map((it, i) => {
            const c = i - (n - 1) / 2;
            const rot = c * 7 * spread * open;
            const x = c * 150 * spread * open;
            const y = Math.abs(c) * 18 * open;
            return (
              <div key={i} style={{ position: "absolute", inset: 0, transform: `translate(${x}px, ${y}px) rotate(${rot}deg)`, transformOrigin: "50% 110%", zIndex: i }}>
                <Panel asset={it.asset} width={w} height={h} fit="contain" />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <NarrationBox kicker={kicker} title={title} sub={sub} align="center" style={{ bottom: 70 }} />
    </AbsoluteFill>
  );
}

// The "start here" recap: a labeled row of books on a shelf line.
export function StarterShelf({ items = [], kicker, title }) {
  const list = items.map(itemOf);
  const n = list.length;
  const h = n <= 4 ? 520 : n <= 6 ? 430 : 340;
  const w = h * COVER_ASPECT;
  return (
    <AbsoluteFill>
      <Backdrop />
      {(kicker || title) && (
        <div style={{ position: "absolute", top: 80, left: 0, right: 0, textAlign: "center" }}>
          {kicker && <div style={{ fontFamily: fonts.body, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: brand.gold, fontSize: 24 }}>{kicker}</div>}
          {title && <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 88, color: brand.text, textTransform: "uppercase", lineHeight: 1, marginTop: 10 }}>{title}</div>}
        </div>
      )}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 150 }}>
        <div style={{ display: "flex", gap: 40, alignItems: "flex-end" }}>
          {list.map((it, i) => (
            <ShelfItem key={i} i={i} it={it} w={w} h={h} />
          ))}
        </div>
        <div style={{ width: 1720, height: 10, background: brand.gold, marginTop: 0, boxShadow: `0 6px 0 ${brand.ink}` }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function ShelfItem({ it, i, w, h }) {
  const e = useEntrance(i, 6);
  return (
    <div style={{ opacity: e, transform: `translateY(${(1 - e) * 60}px)`, display: "flex", flexDirection: "column", alignItems: "center", width: w }}>
      {it.label && <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 30, color: brand.text, textTransform: "uppercase", textAlign: "center", lineHeight: 1, marginBottom: 6 }}>{it.label}</div>}
      {it.sub && <div style={{ fontFamily: fonts.body, fontSize: 18, color: brand.textMuted, textAlign: "center", marginBottom: 14 }}>{it.sub}</div>}
      <Panel asset={it.asset} width={w} height={h} fit="contain" style={{ borderWidth: 5, outlineWidth: 2, boxShadow: "none" }} />
    </div>
  );
}
