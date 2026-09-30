// Text and brand cards: chapter breaks, quotes, the ComixCatalog plug, the
// episode open and the end card. Copy always comes from the timeline.

import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { brand, fonts } from "../brand.js";
import { Backdrop, Halftone, Panel, useAsset, useEntrance, useProgress } from "./primitives.jsx";

// Chapter break styled as a narration box on a Cyclops-blue field.
export function ChapterCard({ kicker, title, sub }) {
  const e = useEntrance(0, 0, 2);
  const p = useProgress();
  return (
    <AbsoluteFill style={{ background: `linear-gradient(135deg, ${brand.blue} 0%, #061045 60%, ${brand.bg} 100%)` }}>
      <Halftone opacity={0.08} size={10} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ transform: `scale(${0.97 + 0.03 * e + 0.02 * p})`, opacity: e, maxWidth: 1500, textAlign: "left" }}>
          {kicker && (
            <div style={{ display: "inline-block", background: brand.gold, color: brand.ink, border: `5px solid ${brand.ink}`, borderBottom: "none", padding: "8px 20px", fontFamily: fonts.body, fontWeight: 700, fontSize: 30, letterSpacing: "0.16em", textTransform: "uppercase" }}>
              {kicker}
            </div>
          )}
          <div style={{ background: brand.offwhite, color: brand.ink, border: `6px solid ${brand.ink}`, boxShadow: `16px 16px 0 ${brand.ink}`, padding: "26px 44px 30px", fontFamily: fonts.display, fontWeight: 800, fontSize: 124, lineHeight: 0.95, textTransform: "uppercase" }}>
            {title}
            {sub && <div style={{ fontFamily: fonts.body, fontWeight: 600, fontSize: 36, lineHeight: 1.25, textTransform: "none", marginTop: 16 }}>{sub}</div>}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// A pulled line: the narration's thesis, a creator quote, a rule of thumb.
export function QuoteCard({ text, attribution, asset }) {
  const e = useEntrance(0, 0, 4);
  const a = useEntrance(1, 12, 4);
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 90, padding: "0 140px" }}>
        {asset && (
          <div style={{ opacity: e }}>
            <Panel asset={asset} width={460} height={Math.round(460 / 0.66)} fit="contain" />
          </div>
        )}
        <div style={{ borderLeft: `10px solid ${brand.gold}`, paddingLeft: 48, opacity: e, transform: `translateX(${(1 - e) * 30}px)`, maxWidth: asset ? 1000 : 1400 }}>
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: text?.length > 90 ? 76 : 96, lineHeight: 1.02, color: brand.text, textTransform: "uppercase" }}>
            {text}
          </div>
          {attribution && (
            <div style={{ marginTop: 28, fontFamily: fonts.body, fontWeight: 600, fontSize: 30, color: brand.gold, opacity: a, letterSpacing: "0.04em" }}>
              {attribution}
            </div>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// Episode open: number, title, faint cover wall behind.
export function TitleCard({ kicker, title, sub, assets = [] }) {
  const e = useEntrance(0, 0, 4);
  const s = useEntrance(1, 14, 4);
  const p = useProgress();
  return (
    <AbsoluteFill style={{ backgroundColor: brand.bg, overflow: "hidden" }}>
      <AbsoluteFill style={{ flexDirection: "row", flexWrap: "wrap", gap: 18, opacity: 0.42, transform: `translateX(${-60 * p}px) rotate(-4deg) scale(1.2)`, alignContent: "center", justifyContent: "center" }}>
        {assets.map((a, i) => (
          <WallCover key={i} asset={a} />
        ))}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, ${brand.bg}f2 0%, ${brand.bg}b3 45%, ${brand.bg}66 100%)` }} />
      <Halftone opacity={0.06} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 160px" }}>
        {kicker && <div style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 30, letterSpacing: "0.22em", color: brand.gold, textTransform: "uppercase", opacity: e }}>{kicker}</div>}
        <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 132, lineHeight: 0.95, color: brand.text, textTransform: "uppercase", marginTop: 18, opacity: e, transform: `translateY(${(1 - e) * 24}px)` }}>
          {title}
        </div>
        {sub && <div style={{ fontFamily: fonts.body, fontWeight: 600, fontSize: 36, color: brand.textMuted, marginTop: 26, opacity: s }}>{sub}</div>}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function WallCover({ asset }) {
  const { src } = useAsset(asset);
  if (!src) return null;
  return <Img src={src} style={{ width: 200, height: 303, objectFit: "cover", border: `4px solid ${brand.ink}` }} />;
}

function Logo({ height }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
      <Img src={staticFile("brand/badge-transparent.png")} style={{ height, width: "auto" }} />
      <Img src={staticFile("brand/wordmark-transparent.png")} style={{ height: height * 0.78, width: "auto" }} />
    </div>
  );
}

// The ComixCatalog plug. `screenshot` shows a site capture in a browser frame.
export function ComixCatalogCard({ title, sub, screenshot, url = "comixcatalog.com" }) {
  const e = useEntrance(0, 0, 4);
  const s = useEntrance(1, 10, 4);
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ flexDirection: screenshot ? "row" : "column", alignItems: "center", justifyContent: "center", gap: screenshot ? 90 : 40, padding: "0 120px" }}>
        <div style={{ opacity: e, transform: `translateY(${(1 - e) * 20}px)`, display: "flex", flexDirection: "column", alignItems: screenshot ? "flex-start" : "center", maxWidth: screenshot ? 700 : 1400 }}>
          <Logo height={screenshot ? 120 : 170} />
          {title && <div style={{ marginTop: 40, fontFamily: fonts.display, fontWeight: 800, fontSize: 76, lineHeight: 1, color: brand.text, textTransform: "uppercase", textAlign: screenshot ? "left" : "center" }}>{title}</div>}
          {sub && <div style={{ marginTop: 18, fontFamily: fonts.body, fontWeight: 400, fontSize: 32, lineHeight: 1.35, color: brand.textMuted, textAlign: screenshot ? "left" : "center" }}>{sub}</div>}
          <div style={{ marginTop: 30, fontFamily: fonts.body, fontWeight: 700, fontSize: 34, color: brand.gold, letterSpacing: "0.04em" }}>{url}</div>
        </div>
        {screenshot && (
          <div style={{ opacity: s, transform: `translateX(${(1 - s) * 40}px)`, borderRadius: 14, overflow: "hidden", border: `2px solid ${brand.line}`, boxShadow: "0 30px 80px rgba(0,0,0,0.6)", background: brand.surface }}>
            <div style={{ height: 40, background: brand.surface2, display: "flex", alignItems: "center", gap: 10, padding: "0 16px" }}>
              {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />)}
            </div>
            <div style={{ position: "relative", width: 860, height: 540 }}>
              <Panel asset={screenshot} width={860} height={540} style={{ border: "none", outline: "none", boxShadow: "none" }} />
            </div>
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// End card. Leaves the right half clear for YouTube end-screen elements.
export function EndCard({ title, sub, url = "comixcatalog.com" }) {
  const e = useEntrance(0, 0, 4);
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 140, opacity: e }}>
        <Logo height={120} />
        {title && <div style={{ marginTop: 44, fontFamily: fonts.display, fontWeight: 800, fontSize: 96, lineHeight: 0.95, color: brand.text, textTransform: "uppercase", maxWidth: 820 }}>{title}</div>}
        {sub && <div style={{ marginTop: 20, fontFamily: fonts.body, fontSize: 32, color: brand.textMuted, maxWidth: 780, lineHeight: 1.35 }}>{sub}</div>}
        <div style={{ marginTop: 30, fontFamily: fonts.body, fontWeight: 700, fontSize: 34, color: brand.gold }}>{url}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// A segment whose visual does not exist yet at all (not just a file).
export function PlaceholderCard({ asset, label }) {
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", width: 1280, height: 720 }}>
          <Panel asset={asset} width={1280} height={720} />
        </div>
        {label && <div style={{ marginTop: 30, fontFamily: fonts.body, fontSize: 28, color: brand.textMuted }}>{label}</div>}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
