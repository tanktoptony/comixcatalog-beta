// YouTube thumbnails for Episode 001 (1280x720 stills). Rendered by
// scripts/thumbs.mjs. Built to read at phone size: three words or fewer of
// big type, high contrast, one clear idea per variant.

import React, { useEffect, useState } from "react";
import { AbsoluteFill, Img, continueRender, delayRender, staticFile } from "remotion";
import "@fontsource/big-shoulders/800.css";
import "@fontsource/inter/700.css";
import { brand, fonts } from "../shared/brand.js";
import { available } from "../shared/components/primitives.jsx";
import { resolveAsset } from "../shared/timeline.js";

const EP = "episode-001";
const cover = (name) => `covers/${name}.jpg`;
const C = {
  x1: cover("x-men-001-1963"),
  x129: cover("x-men-129-1980"),
  x141: cover("x-men-141-1981"),
  x14: cover("x-men-014-1992"),
  hom1: cover("house-of-m-001-2005"),
  glmk: "extras/GOD_LOVES_MAN_KILLS",
};

function useFonts() {
  const [h] = useState(() => delayRender("thumb fonts"));
  useEffect(() => {
    Promise.all([document.fonts.load("800 120px 'Big Shoulders'"), document.fonts.load("700 32px 'Inter'")]).then(
      () => continueRender(h),
      () => continueRender(h)
    );
  }, [h]);
}

function Pic({ asset, style }) {
  const p = resolveAsset(EP, asset, available);
  if (!p) {
    return (
      <div style={{ ...style, background: "#222", color: "#888", display: "grid", placeItems: "center", fontFamily: fonts.body, fontSize: 22, textAlign: "center" }}>
        {asset}
      </div>
    );
  }
  return <Img src={staticFile(p)} style={{ objectFit: "cover", ...style }} />;
}

const coverStyle = (w, extra = {}) => ({
  width: w,
  height: w / 0.66,
  borderRadius: 10,
  boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 0 3px rgba(0,0,0,0.9)",
  ...extra,
});

// Heavy outlined display type that survives YouTube's tiny previews.
const Big = ({ children, size, color = "#fff", style }) => (
  <div
    style={{
      fontFamily: fonts.display,
      fontWeight: 800,
      fontSize: size,
      lineHeight: 0.88,
      textTransform: "uppercase",
      color,
      letterSpacing: "-0.01em",
      WebkitTextStroke: `${Math.round(size / 28)}px #000`,
      paintOrder: "stroke fill",
      textShadow: "0 8px 0 rgba(0,0,0,0.55)",
      ...style,
    }}
  >
    {children}
  </div>
);

const Field = ({ children, glow = brand.blueBright }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(70% 90% at 75% 50%, ${glow}55 0%, transparent 60%), linear-gradient(135deg, ${brand.blue} 0%, ${brand.bg} 70%)`,
    }}
  >
    {children}
  </AbsoluteFill>
);

const Badge = () => (
  <Img src={staticFile("brand/badge-transparent.png")} style={{ position: "absolute", right: 28, top: 26, width: 64, height: 64 }} />
);

// A: the starter shelf.
export function ThumbShelf() {
  useFonts();
  const books = [C.x129, C.x141, C.x14, C.glmk, C.hom1];
  return (
    <Field>
      {books.map((b, i) => (
        <Pic
          key={b}
          asset={b}
          style={coverStyle(232, {
            position: "absolute",
            left: 612 + i * 120,
            top: 120 + Math.abs(i - 2) * 26,
            transform: `rotate(${(i - 2) * 7}deg)`,
            zIndex: 10 - Math.abs(i - 2),
          })}
        />
      ))}
      <div style={{ position: "absolute", left: 56, top: 92 }}>
        <Big size={150} color={brand.gold}>Where to</Big>
        <Big size={150}>start</Big>
        <Big size={210} color={brand.gold} style={{ marginTop: 6 }}>X-Men</Big>
      </div>
      <div
        style={{
          position: "absolute",
          left: 60,
          bottom: 52,
          background: brand.gold,
          color: brand.blue,
          fontFamily: fonts.display,
          fontWeight: 800,
          fontSize: 46,
          textTransform: "uppercase",
          padding: "6px 18px",
          borderRadius: 8,
          border: "4px solid #000",
        }}
      >
        5 books. No homework.
      </div>
      <Badge />
    </Field>
  );
}

// B: don't start at #1.
export function ThumbNotHere() {
  useFonts();
  return (
    <Field glow="#c4122f">
      <div style={{ position: "absolute", left: 70, top: 92 }}>
        <Pic asset={C.x1} style={coverStyle(330, { filter: "saturate(0.6) brightness(0.8)", transform: "rotate(-4deg)" })} />
        <div style={{ position: "absolute", inset: -10, display: "grid", placeItems: "center" }}>
          <div style={{ fontSize: 420, lineHeight: 1, color: "#e01b2e", fontFamily: fonts.display, fontWeight: 800, WebkitTextStroke: "10px #000", paintOrder: "stroke fill" }}>×</div>
        </div>
        <Big size={70} color="#ff4b5c" style={{ position: "absolute", left: 18, bottom: -88 }}>Not here</Big>
      </div>
      <div style={{ position: "absolute", left: 470, top: 270 }}>
        <Big size={190} color="#fff">→</Big>
      </div>
      <div style={{ position: "absolute", right: 70, top: 70 }}>
        <Pic asset={C.x129} style={coverStyle(370, { transform: "rotate(4deg)", boxShadow: `0 0 0 6px ${brand.gold}, 0 30px 70px rgba(0,0,0,0.75)` })} />
        <Big size={86} color={brand.gold} style={{ position: "absolute", right: 0, bottom: -64 }}>Start here</Big>
      </div>
      <Badge />
    </Field>
  );
}

// C: Tony's face + covers (needs extras/TONY_FACE, a cut-out or tight photo).
export function ThumbFace() {
  useFonts();
  return (
    <Field>
      <Pic asset={C.x129} style={coverStyle(220, { position: "absolute", right: 290, top: 300, transform: "rotate(-8deg)" })} />
      <Pic asset={C.hom1} style={coverStyle(220, { position: "absolute", right: 70, top: 280, transform: "rotate(7deg)" })} />
      <Pic asset="extras/TONY_FACE" style={{ position: "absolute", left: 0, bottom: 0, width: 560, height: 680, objectFit: "cover", objectPosition: "50% 20%" }} />
      <div style={{ position: "absolute", left: 520, top: 40 }}>
        <Big size={128} color={brand.gold}>X-Men</Big>
        <Big size={96}>starter shelf</Big>
      </div>
      <Badge />
    </Field>
  );
}
