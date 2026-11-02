// YouTube thumbnails for Episode 006 (1280x720 stills). Tony's direction
// (2026-10-26): the card versions were too bland; Ep 002's full-bleed
// Einstein panel did better. So: real Marvel art full-bleed (from Marvel.com's
// Doom profile page, art/sources.txt) with one bold title bar. Second pass
// (2026-10-27): more branding, so every Power Index thumbnail carries the same
// top-left lockup (ComixCatalog badge, series name, profile number), and the
// bar says something the title doesn't.

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
const display = { fontFamily: fonts.display, fontWeight: 800, textTransform: "uppercase" };

// Series lockup, same spot on every Power Index thumbnail.
function Lockup({ number = "001" }) {
  return <div style={{ position: "absolute", left: 28, top: 26, display: "flex", alignItems: "center", gap: 14 }}>
    <Img src={staticFile("brand/badge-transparent.png")} style={{ height: 112, width: "auto", filter: "drop-shadow(0 6px 10px rgba(0,0,0,.6))" }} />
    <div style={{ background: "#000", borderLeft: `8px solid ${brand.gold}`, padding: "8px 18px 4px", boxShadow: "8px 8px 0 rgba(0,0,0,.45)" }}>
      <div style={{ ...display, fontSize: 52, lineHeight: .92, color: "#fff", letterSpacing: ".02em" }}>The Power Index</div>
      <div style={{ ...display, fontSize: 30, lineHeight: 1.05, color: brand.gold, letterSpacing: ".08em" }}>Power Profile #{number}</div>
    </div>
  </div>;
}

// One black bar with a gold edge, the way the Shorts hooks look.
function TitleBar({ lines, left = 40, bottom = 46, size = 104 }) {
  return <div style={{ position: "absolute", left, bottom, transform: "rotate(-1.5deg)", transformOrigin: "left bottom", background: "#000", border: `7px solid ${brand.gold}`, boxShadow: "12px 12px 0 rgba(0,0,0,.55)", padding: "16px 28px 8px" }}>
    {lines.map((l, i) => <div key={i} style={{ ...display, fontSize: size, lineHeight: .9, color: i === lines.length - 1 ? brand.gold : "#fff", whiteSpace: "nowrap" }}>{l}</div>)}
  </div>;
}
const Shade = () => <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(0,0,0,.55) 0%, transparent 28%, transparent 50%, rgba(0,0,0,.65) 100%)" }} />;

// A: the glowing-eyes close-up.
export function Thumb006Eyes() {
  useFonts();
  return <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Art asset="art/marvel-doom-eyes.jpg" position="22% 50%" />
    <Shade />
    <Lockup />
    <TitleBar lines={["What beats", "Doctor Doom?"]} left={560} size={108} />
  </AbsoluteFill>;
}

// B: Reed vs. Doom, the classic panel.
export function Thumb006ReedVsDoom() {
  useFonts();
  return <AbsoluteFill style={{ backgroundColor: "#000" }}>
    {/* Doom's hood touches the top of this panel, so the art starts below a
        black strip and the lockup sits on the strip instead of his face. */}
    <div style={{ position: "absolute", left: 0, right: 0, top: 104, bottom: 0 }}><Art asset="art/marvel-reed-vs-doom.jpg" position="50% 0%" /></div>
    <AbsoluteFill style={{ background: "linear-gradient(to bottom, transparent 55%, rgba(0,0,0,.6) 100%)" }} />
    <Lockup />
    <TitleBar lines={["Doom or Reed:", "who's smarter?"]} left={40} size={104} />
  </AbsoluteFill>;
}

// C: Marvel's hero art of Doom. "A god for about two issues" is the script's own
// line (Secret Wars 1984 #10 to #12).
export function Thumb006Hero() {
  useFonts();
  return <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Art asset="art/marvel-doom-hero.jpg" position="38% 50%" />
    <Shade />
    <Lockup />
    <TitleBar lines={["He was a god", "for 2 issues"]} left={600} size={104} />
  </AbsoluteFill>;
}

export const THUMBNAILS_006 = [["Thumb006Eyes", Thumb006Eyes], ["Thumb006ReedVsDoom", Thumb006ReedVsDoom], ["Thumb006Hero", Thumb006Hero]];
