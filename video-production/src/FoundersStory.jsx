// Instagram/Facebook Story (1080x1920 still) for the Founding Collectors
// push. `left` is the live count from /founding-collectors. The bottom
// ~300 px stay clear for the link sticker.

import React, { useEffect, useState } from "react";
import { AbsoluteFill, Img, continueRender, delayRender, staticFile } from "remotion";
import "@fontsource/big-shoulders/800.css";
import "@fontsource/inter/700.css";
import { brand, fonts } from "../shared/brand.js";
import { Halftone } from "../shared/components/primitives.jsx";

const WALL = [
  "action-comics-1", "the-amazing-spider-man-1", "giant-size-x-men-1", "detective-comics-27", "fantastic-four-1",
  "watchmen-1", "amazing-fantasy-15", "the-incredible-hulk-181", "batman-1", "star-wars-1", "the-x-men-1",
  "teenage-mutant-ninja-turtles-1", "the-avengers-1", "spawn-1", "showcase-4", "daredevil-1",
  "the-new-mutants-98", "superman-75", "tales-of-suspense-39", "swamp-thing-1",
].map((n) => `brand/banner/${n}.jpg`);

function useFonts() {
  const [h] = useState(() => delayRender("story fonts"));
  useEffect(() => {
    Promise.all([document.fonts.load("800 200px 'Big Shoulders'"), document.fonts.load("700 40px 'Inter'")]).then(
      () => continueRender(h),
      () => continueRender(h)
    );
  }, [h]);
}

export function FoundersStory({ left = 71 }) {
  useFonts();
  const claimed = 100 - left;
  return (
    <AbsoluteFill style={{ backgroundColor: brand.bg, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: -140, top: -120, width: 1500, display: "flex", flexWrap: "wrap", gap: 16, transform: "rotate(-8deg)" }}>
        {Array.from({ length: 40 }, (_, i) => (
          <Img key={i} src={staticFile(WALL[(i * 7) % WALL.length])} style={{ width: 230, height: 348, objectFit: "cover", borderRadius: 8, boxShadow: "0 0 0 3px #000" }} />
        ))}
      </div>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(9,12,17,0.55) 0%, rgba(9,12,17,0.92) 32%, rgba(9,12,17,0.96) 70%, rgba(9,12,17,0.8) 100%)" }} />
      <Halftone opacity={0.06} size={11} />

      <div style={{ position: "absolute", top: 230, left: 70, right: 70, display: "grid", justifyItems: "center", gap: 26, textAlign: "center" }}>
        <Img src={staticFile("brand/badge-transparent.png")} style={{ width: 170, height: 170 }} />
        <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 92, lineHeight: 0.9, textTransform: "uppercase", color: "#fff" }}>
          Founding
          <br />
          Collectors
        </div>

        {/* The pass. */}
        <div
          style={{
            marginTop: 20,
            width: 860,
            padding: "46px 50px",
            borderRadius: 28,
            background: `linear-gradient(135deg, #f8e27a 0%, ${brand.gold} 35%, #b8860b 70%, #f4d03f 100%)`,
            boxShadow: "0 40px 90px rgba(0,0,0,0.6), inset 0 0 0 3px rgba(255,255,255,0.35)",
            color: "#1a1405",
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 250, lineHeight: 0.85 }}>{left}</div>
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 64, textTransform: "uppercase", letterSpacing: "0.02em" }}>lifetime passes left</div>
          <div style={{ marginTop: 14, height: 18, borderRadius: 9, background: "rgba(0,0,0,0.25)", overflow: "hidden" }}>
            <div style={{ width: `${claimed}%`, height: "100%", background: "#1a1405" }} />
          </div>
          <div style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 30, opacity: 0.8 }}>{claimed} of 100 claimed</div>
        </div>

        <div style={{ marginTop: 26, fontFamily: fonts.display, fontWeight: 800, fontSize: 70, lineHeight: 1, textTransform: "uppercase", color: brand.gold }}>
          Collector Pro. For life.
          <br />
          Free. No card.
        </div>
        <div style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 36, color: brand.text, lineHeight: 1.35, maxWidth: 860 }}>
          Track every book you own and every one you're hunting. Your name goes on the wall.
        </div>
      </div>
    </AbsoluteFill>
  );
}
