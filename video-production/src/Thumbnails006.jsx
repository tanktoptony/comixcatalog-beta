// YouTube thumbnails for Episode 006 (1280x720 stills). Tony's direction
// (2026-10-26): the card versions were too bland; Ep 002's full-bleed
// Einstein panel did better. So: real Marvel art full-bleed (from Marvel.com's
// Doom profile page, art/sources.txt) with one bold title bar.

import React, { useEffect, useState } from "react";
import { AbsoluteFill, Img, continueRender, delayRender, staticFile } from "remotion";
import "@fontsource/big-shoulders/800.css";
import { brand, fonts } from "../shared/brand.js";
import { available } from "../shared/components/primitives.jsx";
import { resolveAsset } from "../shared/timeline.js";

const EP = "episode-006";
function useFonts() {
  const [h] = useState(() => delayRender("thumb fonts"));
  useEffect(() => { document.fonts.load("800 140px 'Big Shoulders'").then(() => continueRender(h), () => continueRender(h)); }, [h]);
}
const Art = ({ asset, position = "50% 50%" }) => <Img src={staticFile(resolveAsset(EP, asset, available))} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: position }} />;

// The series tab plus one black bar with a gold edge, the way the Shorts hooks look.
function TitleBar({ lines, left = 40, bottom = 46, size = 104, maxWidth = 1200 }) {
  return <div style={{ position: "absolute", left, bottom, maxWidth, transform: "rotate(-1.5deg)", transformOrigin: "left bottom" }}>
    <div style={{ display: "inline-block", background: brand.gold, color: "#000", fontFamily: fonts.display, fontWeight: 800, fontSize: 30, letterSpacing: ".06em", textTransform: "uppercase", padding: "6px 16px 3px", border: "4px solid #000", borderBottom: 0 }}>The Power Index</div>
    <div style={{ background: "#000", border: `7px solid ${brand.gold}`, boxShadow: "12px 12px 0 rgba(0,0,0,.55)", padding: "16px 28px 8px" }}>
      {lines.map((l, i) => <div key={i} style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: size, lineHeight: .9, textTransform: "uppercase", color: i === lines.length - 1 ? brand.gold : "#fff" }}>{l}</div>)}
    </div>
  </div>;
}
const Fade = ({ to = "bottom", strength = .7 }) => <AbsoluteFill style={{ background: `linear-gradient(to ${to}, transparent 45%, rgba(0,0,0,${strength}) 100%)` }} />;

// A: the glowing-eyes close-up.
export function Thumb006Eyes() {
  useFonts();
  return <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Art asset="art/marvel-doom-eyes.jpg" position="22% 50%" />
    <Fade />
    <TitleBar lines={["How powerful", "is Doom?"]} left={520} size={112} />
  </AbsoluteFill>;
}

// B: Reed vs. Doom, the classic panel.
export function Thumb006ReedVsDoom() {
  useFonts();
  return <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Art asset="art/marvel-reed-vs-doom.jpg" position="50% 60%" />
    <Fade strength={.6} />
    <TitleBar lines={["Doom:", "Power Profile"]} left={40} size={108} />
  </AbsoluteFill>;
}

// C: Marvel's hero art of Doom.
export function Thumb006Hero() {
  useFonts();
  return <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Art asset="art/marvel-doom-hero.jpg" position="38% 50%" />
    <Fade strength={.65} />
    <TitleBar lines={["Doom's real", "power level"]} left={600} size={108} />
  </AbsoluteFill>;
}

export const THUMBNAILS_006 = [["Thumb006Eyes", Thumb006Eyes], ["Thumb006ReedVsDoom", Thumb006ReedVsDoom], ["Thumb006Hero", Thumb006Hero]];
