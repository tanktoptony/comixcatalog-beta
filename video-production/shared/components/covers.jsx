// Cover segments. All motion is slow: push-ins, pans, gentle staggered
// entrances, card-stack slides. No spins, no flashes, no starbursts.

import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { brand, fonts } from "../brand.js";
import { Backdrop, CoverBackdrop, Media, NarrationBox, Numeral, Panel, useAsset, useEntrance, useProgress, SegmentContext } from "./primitives.jsx";

export const COVER_ASPECT = 0.66; // US comic cover, width / height

const FRAMED_MOVES = {
  still: () => ({ scale: 1, x: 0 }),
  slowPush: (p) => ({ scale: 1 + 0.07 * p, x: 0 }),
  gentlePush: (p) => ({ scale: 1 + 0.03 * p, x: 0 }),
  slowPull: (p) => ({ scale: 1.07 - 0.07 * p, x: 0 }),
  driftLeft: (p) => ({ scale: 1.04, x: 22 - 44 * p }),
  driftRight: (p) => ({ scale: 1.04, x: -22 + 44 * p }),
};
const FULL_FRAME = new Set(["panDown", "panUp", "focus", "focusOut", "panAcross"]);

// A single cover. Framed treatments show the whole cover in a panel over its
// own blurred art; full-frame treatments travel across the art itself.
export function CoverFull({ asset, treatment = "slowPush", focus, kicker, title, sub, number, captionAlign = "left" }) {
  if (FULL_FRAME.has(treatment)) {
    return <KenBurnsCover asset={asset} treatment={treatment} focus={focus} kicker={kicker} title={title} sub={sub} number={number} captionAlign={captionAlign} />;
  }
  const p = useProgress();
  const enter = useEntrance(0, 0, 0);
  const m = (FRAMED_MOVES[treatment] ?? FRAMED_MOVES.slowPush)(p);
  const h = 900;
  // With a caption, the cover moves to one side and the caption takes the
  // other, vertically centred beside it, so neither covers the other.
  const captioned = !!(title || kicker || number != null);
  const coverOnLeft = captionAlign !== "left";
  const offsetX = captioned ? (coverOnLeft ? -330 : 330) : 0;
  const textLeft = coverOnLeft ? 1010 : 110;
  return (
    <AbsoluteFill>
      <CoverBackdrop asset={asset} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ transform: `translate(${offsetX + m.x}px, ${(1 - enter) * 24}px) scale(${m.scale})`, opacity: enter }}>
          <Panel asset={asset} width={Math.round(h * COVER_ASPECT)} height={h} fit="contain" />
        </div>
      </AbsoluteFill>
      {number != null && <Numeral n={number} style={{ left: textLeft - 10, top: 150 }} />}
      {(title || kicker) && (
        <NarrationBox kicker={kicker} title={title} sub={sub} style={{ left: textLeft, right: undefined, bottom: number != null ? 300 : 420, maxWidth: 800 }} />
      )}
    </AbsoluteFill>
  );
}

// Full-frame travel across a cover's art, the cover scaled to frame width.
//   panDown / panUp   top-to-bottom (or reverse) across the whole cover
//   focus             whole-width view easing into focus {x, y, zoom}
//   focusOut          start on focus {x, y, zoom}, pull back to the whole width
//   panAcross         hold a zoomed band at focus.y and travel left to right
export function KenBurnsCover({ asset, treatment = "panDown", focus, kicker, title, sub, number, captionAlign = "left" }) {
  const p = useProgress();
  const W = 1920;
  const coverH = W / COVER_ASPECT;
  const f = { x: 0.5, y: 0.35, zoom: 1.6, ...focus };
  let scale = 1;
  let x = 0;
  let y;
  const clampXY = () => {
    y = Math.min(0, Math.max(-(coverH * scale - 1080), y));
    x = Math.min(0, Math.max(-(W * scale - W), x));
  };
  if (treatment === "panUp") y = -(coverH - 1080) * (1 - p);
  else if (treatment === "panDown") y = -(coverH - 1080) * p;
  else if (treatment === "panAcross") {
    scale = f.zoom;
    y = -(f.y * coverH * scale - 540);
    x = -(W * scale - W) * (f.reverse ? 1 - p : p);
    clampXY();
  } else {
    const t = treatment === "focusOut" ? 1 - p : p;
    scale = interpolate(t, [0, 1], [1, f.zoom]);
    y = interpolate(t, [0, 1], [-(coverH / 2 - 540), -(f.y * coverH * f.zoom - 540)]);
    x = interpolate(t, [0, 1], [0, -(f.x * W * f.zoom - 960)]);
    clampXY();
  }
  return (
    <AbsoluteFill style={{ backgroundColor: brand.bg, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: coverH, transformOrigin: "0 0", transform: `translate(${x}px, ${y}px) scale(${scale})` }}>
        <Media asset={asset} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(9,12,17,0.75) 0%, transparent 35%)" }} />
      {number != null && <Numeral n={number} style={{ left: 100, bottom: 250 }} />}
      <NarrationBox kicker={kicker} title={title} sub={sub} align={captionAlign} />
    </AbsoluteFill>
  );
}

// Broadcast-TV grade over full-frame media: scanlines, a faint RGB mask,
// lifted blacks, and a rounded tube edge falling off to black. Reads as
// "what was on the set", without pretending a still is inside a TV prop.
function CrtGrade() {
  const frame = useCurrentFrame();
  // Slow rolling brightness band, the way a camera sees a CRT refresh.
  const bandY = ((frame * 6) % 1400) - 200;
  return (
    <>
      <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0 2px, transparent 2px 4px)" }} />
      <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(255,0,0,0.035) 0 1px, rgba(0,255,0,0.035) 1px 2px, rgba(0,0,255,0.035) 2px 3px)" }} />
      <AbsoluteFill style={{ background: `linear-gradient(to bottom, transparent ${bandY}px, rgba(255,255,255,0.045) ${bandY + 90}px, transparent ${bandY + 180}px)` }} />
      <AbsoluteFill style={{ backgroundColor: "rgba(20,24,30,0.08)" }} />
      <AbsoluteFill style={{ borderRadius: 70, boxShadow: "inset 0 0 0 26px #000, inset 0 0 160px 60px rgba(0,0,0,0.85)" }} />
    </>
  );
}

// Full-frame image or footage (TAS stills, stock texture, screenshots).
// `position` is the CSS object-position for the cover-fit crop ("50% 15%"
// keeps a face near the top of a portrait still). `inset` puts another asset
// on a screen inside the shot, e.g. a TAS still on a retro TV: rect is in
// frame pixels after the cover fit; if the inset asset is missing, the screen
// is left as shot.
export function MediaFull({ asset, treatment = "slowPush", position = "50% 50%", zoom = 1, inset, crt = false, gifRate = 1, kicker, title, sub, captionAlign = "left" }) {
  const p = useProgress();
  const { video } = useAsset(asset);
  const insetAsset = useAsset(inset?.asset);
  const scale = video || treatment === "still" ? 1 : treatment === "slowPull" ? 1.06 - 0.06 * p : 1 + 0.06 * p;
  const x = treatment === "panAcross" ? -60 + 120 * p : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: brand.bg, overflow: "hidden" }}>
      <AbsoluteFill style={{ transformOrigin: position, transform: `translateX(${x}px) scale(${(treatment === "panAcross" ? 1.1 : scale) * zoom})` }}>
        <Media asset={asset} gifRate={gifRate} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: position, filter: crt ? "saturate(1.25) contrast(0.92) brightness(1.05)" : undefined }} />
        {crt && (
          <AbsoluteFill style={{ mixBlendMode: "screen", opacity: 0.35 }}>
            <Media asset={asset} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: position, filter: "blur(10px) brightness(0.9)" }} />
          </AbsoluteFill>
        )}
        {inset && !insetAsset.missing && (
          <div style={{ position: "absolute", left: inset.rect.x, top: inset.rect.y, width: inset.rect.w, height: inset.rect.h, borderRadius: inset.radius ?? 36, overflow: "hidden", opacity: inset.opacity ?? 0.92 }}>
            <Media asset={inset.asset} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "saturate(1.15) contrast(1.05)" }} />
            <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0 2px, transparent 2px 4px)", boxShadow: "inset 0 0 60px rgba(0,0,0,0.65)" }} />
          </div>
        )}
      </AbsoluteFill>
      {crt && <CrtGrade />}
      {(title || kicker) && <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(9,12,17,0.7) 0%, transparent 35%)" }} />}
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

// Two images side by side. Items may set `aspect` (16/9 for an animation
// still beside a cover). `field`/`tint` recolor the background; `float`
// adds a very slight drift.
export function CoverPair({ assets = [], kicker, title, sub, field, tint, float = false }) {
  const p = useProgress();
  const frame = useCurrentFrame();
  const items = assets.slice(0, 2).map(itemOf);
  const hasLabels = items.some((it) => it.label);
  let h = title ? 680 : hasLabels ? 760 : 820;
  const gap = 110;
  const totalW = items.reduce((s, it) => s + h * (it.aspect ?? COVER_ASPECT), 0) + gap;
  if (totalW > 1700) h = h * (1700 - gap) / (totalW - gap);
  return (
    <AbsoluteFill>
      <Backdrop field={field} tint={tint} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: title ? 170 : 0 }}>
        <div style={{ display: "flex", gap, alignItems: "center", transform: `scale(${1 + 0.03 * p})` }}>
          {items.map((it, i) => (
            <PairItem key={i} i={i} it={it} h={h} bob={float ? Math.sin((frame + i * 40) / 38) * 6 : 0} />
          ))}
        </div>
      </AbsoluteFill>
      <NarrationBox kicker={kicker} title={title} sub={sub} align="center" style={{ bottom: 60 }} />
    </AbsoluteFill>
  );
}

function PairItem({ it, i, h, bob }) {
  const e = useEntrance(i, 8);
  const w = Math.round(h * (it.aspect ?? COVER_ASPECT));
  return (
    <div style={{ opacity: e, transform: `translateY(${(1 - e) * 40 + bob}px)` }}>
      <Labeled label={it.label} sub={it.sub} width={w}>
        <Panel asset={it.asset} width={w} height={Math.round(h)} fit={it.aspect ? "cover" : "contain"} imgStyle={it.position ? { objectPosition: it.position } : undefined} />
      </Labeled>
    </div>
  );
}

// A run at a glance. highlight = index kept lit while the rest dim.
export function CoverGrid({ assets = [], columns, highlight, kicker, title, sub, field, tint, push = 0.02 }) {
  const p = useProgress();
  const items = assets.map(itemOf);
  const n = items.length;
  const cols = columns ?? (n <= 5 ? n : n <= 8 ? 4 : n <= 10 ? 5 : 6);
  const rows = Math.ceil(n / cols);
  const areaH = title ? 700 : 940;
  const gap = rows > 2 ? 22 : 34;
  const h = Math.min((areaH - gap * (rows - 1)) / rows, ((1720 - gap * (cols - 1)) / cols) / COVER_ASPECT);
  const w = h * COVER_ASPECT;
  return (
    <AbsoluteFill>
      <Backdrop field={field} tint={tint} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: title ? 190 : 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${w}px)`, gap, transform: `scale(${1 + push * p})` }}>
          {items.map((it, i) => (
            <GridItem key={i} i={i} it={it} w={w} h={h} dim={highlight != null && highlight !== i} stagger={n > 8 ? 2 : 4} />
          ))}
        </div>
      </AbsoluteFill>
      <NarrationBox kicker={kicker} title={title} sub={sub} align="center" style={{ bottom: 60 }} />
    </AbsoluteFill>
  );
}

function GridItem({ it, i, w, h, dim, stagger }) {
  const e = useEntrance(i, stagger);
  const thin = h < 300;
  return (
    <div style={{ opacity: e * (dim ? 0.3 : 1), transform: `translateY(${(1 - e) * 30}px) scale(${0.96 + 0.04 * e})`, filter: dim ? "grayscale(0.7)" : "none" }}>
      <Panel asset={it.asset} width={w} height={h} fit="contain" style={{ borderWidth: thin ? 3 : 5, outlineWidth: thin ? 1 : 2 }} />
    </div>
  );
}

// Covers stacked, then fanned: "these all belong together".
export function CoverFan({ assets = [], kicker, title, sub, spread = 1, field, tint }) {
  const items = assets.map(itemOf);
  const n = items.length;
  const open = useEntrance(0, 0, 6);
  const p = useProgress();
  const h = 720;
  const w = h * COVER_ASPECT;
  const s = spread * (n > 4 ? 0.8 : 1);
  return (
    <AbsoluteFill>
      <Backdrop field={field} tint={tint} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: title ? 160 : 0 }}>
        <div style={{ position: "relative", width: w, height: h, transform: `scale(${1 + 0.03 * p})` }}>
          {items.map((it, i) => {
            const c = i - (n - 1) / 2;
            return (
              <div key={i} style={{ position: "absolute", inset: 0, transform: `translate(${c * 150 * s * open}px, ${Math.abs(c) * 18 * open}px) rotate(${c * 7 * s * open}deg)`, transformOrigin: "50% 110%", zIndex: i }}>
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

// Card-stack sequence: each cover slides in over the last, which steps back.
// Reads as turning through a stack, not as a slideshow.
export function CoverStack({ assets = [], kicker, title, sub, field, tint }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = React.useContext(SegmentContext);
  const items = assets.map(itemOf);
  const n = items.length;
  const slot = durationInFrames / n;
  const h = 820;
  const w = h * COVER_ASPECT;
  return (
    <AbsoluteFill>
      <Backdrop field={field} tint={tint} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: title ? 150 : 0 }}>
        <div style={{ position: "relative", width: w, height: h }}>
          {items.map((it, i) => {
            const landed = (j) =>
              j === 0 ? 1 : interpolate(frame, [j * slot, j * slot + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: (t) => 1 - Math.pow(1 - t, 3) });
            const inP = landed(i);
            // How far the covers above this one have landed on it.
            let depth = 0;
            for (let j = i + 1; j < n; j += 1) depth += landed(j);
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: i,
                  opacity: inP,
                  transform: `translate(${(1 - inP) * 700 - depth * 46}px, ${-depth * 10}px) rotate(${(1 - inP) * 6 - depth * 1.5}deg) scale(${1 - depth * 0.04})`,
                  filter: `brightness(${1 - Math.min(depth, 4) * 0.12})`,
                }}
              >
                <Panel asset={it.asset} width={w} height={h} fit="contain" />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <NarrationBox kicker={kicker} title={title} sub={sub} align="center" style={{ bottom: 60 }} />
    </AbsoluteFill>
  );
}

// Three tall detail crops side by side, each drifting slowly.
// items: [{ asset, focus: { x, y, zoom } }]
export function Triptych({ items = [], kicker, title, sub }) {
  const p = useProgress();
  const list = items.map(itemOf);
  const pw = 520;
  const ph = 860;
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 36, paddingBottom: title ? 150 : 0 }}>
        {list.map((it, i) => (
          <TriptychPanel key={i} i={i} it={it} p={p} pw={pw} ph={ph} />
        ))}
      </AbsoluteFill>
      <NarrationBox kicker={kicker} title={title} sub={sub} align="center" style={{ bottom: 60 }} />
    </AbsoluteFill>
  );
}

function TriptychPanel({ it, i, p, pw, ph }) {
  const e = useEntrance(i, 5);
  const f = { x: 0.5, y: 0.4, zoom: 2.2, ...it.focus };
  const imgW = pw * f.zoom;
  const imgH = imgW / COVER_ASPECT;
  const x = Math.min(0, Math.max(-(imgW - pw), -(f.x * imgW - pw / 2)));
  const y = Math.min(0, Math.max(-(imgH - ph), -(f.y * imgH - ph / 2) + (i % 2 ? 1 : -1) * 30 * (p - 0.5)));
  return (
    <div style={{ width: pw, height: ph, position: "relative", overflow: "hidden", border: `7px solid ${brand.ink}`, outline: `3px solid ${brand.offwhite}`, opacity: e, transform: `translateY(${(1 - e) * 30}px)`, boxSizing: "border-box" }}>
      <div style={{ position: "absolute", left: x, top: y, width: imgW, height: imgH }}>
        <Media asset={it.asset} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    </div>
  );
}

// The starter shelf: a labeled row of books on a shelf line. An item with no
// asset is an empty numbered slot, for building the shelf up over the video.
export function StarterShelf({ items = [], kicker, title, numbered = false, slots }) {
  const list = items.map(itemOf);
  while (slots && list.length < slots) list.push({});
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
            <ShelfItem key={i} i={i} it={it} w={w} h={h} number={numbered ? i + 1 : null} />
          ))}
        </div>
        <div style={{ width: 1720, height: 10, background: brand.gold, boxShadow: `0 6px 0 ${brand.ink}` }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function ShelfItem({ it, i, w, h, number }) {
  const e = useEntrance(i, it.asset ? 6 : 10);
  return (
    <div style={{ opacity: e, transform: `translateY(${(1 - e) * 60}px)`, display: "flex", flexDirection: "column", alignItems: "center", width: w }}>
      {it.label && <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 30, color: brand.text, textTransform: "uppercase", textAlign: "center", lineHeight: 1, marginBottom: 6 }}>{it.label}</div>}
      {it.sub && <div style={{ fontFamily: fonts.body, fontSize: 18, color: brand.textMuted, textAlign: "center", marginBottom: 14 }}>{it.sub}</div>}
      {it.asset ? (
        <Panel asset={it.asset} width={w} height={h} fit="contain" style={{ borderWidth: 5, outlineWidth: 2, boxShadow: "none" }} />
      ) : (
        <div style={{ width: w, height: h, boxSizing: "border-box", border: `4px dashed ${brand.line}`, background: "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {number != null && <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: h * 0.42, color: brand.gold, opacity: 0.85 }}>{number}</div>}
        </div>
      )}
    </div>
  );
}

// The finished shelf in front, the books to read later behind it.
export function ShelfLater({ items = [], later = [], laterLabel = "Later", title }) {
  const p = useProgress();
  const front = items.map(itemOf);
  const back = later.map(itemOf);
  const squeeze = 1 - 0.14 * p;
  const reveal = interpolate(p, [0.15, 0.55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fh = 380;
  const bh = 460;
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 260 }}>
        <div style={{ display: "flex", gap: 30, opacity: 0.45 * reveal, transform: `translateY(${(1 - reveal) * 40}px)`, filter: "grayscale(0.35)" }}>
          {back.map((it, i) => (
            <Panel key={i} asset={it.asset} width={bh * COVER_ASPECT} height={bh} fit="contain" style={{ boxShadow: "none" }} />
          ))}
        </div>
        <div style={{ marginTop: 18, fontFamily: fonts.body, fontWeight: 700, fontSize: 26, letterSpacing: "0.2em", textTransform: "uppercase", color: brand.gold, opacity: reveal }}>{laterLabel}</div>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 110 }}>
        <div style={{ display: "flex", gap: 30 * squeeze, alignItems: "flex-end", transform: `scale(${squeeze})`, transformOrigin: "50% 100%" }}>
          {front.map((it, i) => (
            <Panel key={i} asset={it.asset} width={fh * COVER_ASPECT} height={fh} fit="contain" style={{ borderWidth: 5, outlineWidth: 2 }} />
          ))}
        </div>
        <div style={{ width: 1500 * squeeze, height: 10, background: brand.gold, boxShadow: `0 6px 0 ${brand.ink}` }} />
      </AbsoluteFill>
      {title && <NarrationBox title={title} align="center" style={{ bottom: undefined, top: 60 }} />}
    </AbsoluteFill>
  );
}
