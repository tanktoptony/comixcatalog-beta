// YouTube thumbnails for Episode 002 (1280x720 stills). Same rules as 001:
// a few words of huge outlined type, real art only, readable at phone size.

import React, { useEffect, useState } from "react";
import { AbsoluteFill, Img, continueRender, delayRender, staticFile } from "remotion";
import "@fontsource/big-shoulders/800.css";
import { brand, fonts } from "../shared/brand.js";
import { available } from "../shared/components/primitives.jsx";
import { resolveAsset } from "../shared/timeline.js";

const EP = "episode-002";

function useFonts() {
  const [h] = useState(() => delayRender("thumb fonts"));
  useEffect(() => {
    document.fonts.load("800 120px 'Big Shoulders'").then(() => continueRender(h), () => continueRender(h));
  }, [h]);
}

const Pic = ({ asset, style }) => <Img src={staticFile(resolveAsset(EP, asset, available))} style={{ objectFit: "cover", ...style }} />;

const Big = ({ children, size, color = "#fff", style }) => (
  <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: size, lineHeight: 0.88, textTransform: "uppercase", color, WebkitTextStroke: `${Math.round(size / 28)}px #000`, paintOrder: "stroke fill", textShadow: "0 8px 0 rgba(0,0,0,0.55)", ...style }}>
    {children}
  </div>
);

const cover = (w, rot, extra = {}) => ({ width: w, height: w / 0.66, borderRadius: 10, boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 0 3px rgba(0,0,0,0.9)", transform: `rotate(${rot}deg)`, position: "absolute", ...extra });

export function Thumb002WroteThese() {
  useFonts();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(70% 90% at 28% 50%, ${brand.blueBright}55 0%, transparent 60%), linear-gradient(135deg, ${brand.blue} 0%, ${brand.bg} 70%)` }}>
      <Pic asset="covers/the-manhattan-projects-001-2012.jpg" style={cover(300, -7, { left: 40, top: 110 })} />
      <Pic asset="covers/east-of-west-001-2013.jpg" style={cover(300, 6, { left: 300, top: 150 })} />
      <div style={{ position: "absolute", right: 46, top: 90, width: 600, textAlign: "right" }}>
        <Big size={150}>Hickman</Big>
        <Big size={150} color={brand.gold}>wrote</Big>
        <Big size={150}>these?!</Big>
      </div>
    </AbsoluteFill>
  );
}

export function Thumb002OtherHickman() {
  useFonts();
  return (
    <AbsoluteFill style={{ backgroundColor: brand.bg }}>
      <Pic asset="interiors/mp-einstein-gateway-panel.jpg" style={{ position: "absolute", left: -80, top: 0, width: 1400, height: 720, objectPosition: "30% 40%" }} />
      <AbsoluteFill style={{ background: "linear-gradient(90deg, transparent 35%, rgba(9,12,17,0.85) 70%)" }} />
      <div style={{ position: "absolute", right: 60, top: 160, width: 620, textAlign: "right" }}>
        <Big size={120} color={brand.gold}>The other</Big>
        <Big size={148}>Hickman</Big>
      </div>
    </AbsoluteFill>
  );
}

export const THUMBNAILS_002 = [
  ["Thumb002WroteThese", Thumb002WroteThese],
  ["Thumb002OtherHickman", Thumb002OtherHickman],
];
