// YouTube channel banner (2560x1440 still). YouTube crops it per device:
// TVs show all of it, desktops a 2560x423 strip, phones only the centered
// 1546x423 safe area, so the logo and words live inside that box and the
// cover wall fills the rest. Covers: public/brand/banner (the homepage hero's
// all-time classics) plus the Episode 001 X-Men covers.

import React, { useEffect, useState } from "react";
import { AbsoluteFill, Img, continueRender, delayRender, staticFile } from "remotion";
import "@fontsource/big-shoulders/800.css";
import "@fontsource/inter/700.css";
import { brand, fonts } from "../shared/brand.js";

const CLASSICS = [
  "action-comics-1", "the-amazing-spider-man-1", "detective-comics-27", "giant-size-x-men-1", "fantastic-four-1",
  "watchmen-1", "amazing-fantasy-15", "the-incredible-hulk-181", "batman-1", "star-wars-1", "the-x-men-1",
  "teenage-mutant-ninja-turtles-1", "the-avengers-1", "spawn-1", "showcase-4", "batman-the-dark-knight-returns-1",
  "daredevil-1", "the-new-mutants-98", "journey-into-mystery-83", "superman-75", "tales-of-suspense-39",
  "swamp-thing-1", "the-amazing-spider-man-129", "green-lantern-76",
].map((n) => `brand/banner/${n}.jpg`);
const XMEN = [
  "x-men-129-1980", "x-men-141-1981", "x-men-014-1992", "house-of-m-001-2005", "uncanny-x-men-266-1990",
  "x-men-137-1980", "house-of-x-001-2019", "powers-of-x-001-2019", "x-men-130-1980",
].map((n) => `episode-001/covers/${n}.jpg`);

// Interleave so every row mixes eras and publishers.
const WALL = CLASSICS.flatMap((c, i) => (i % 3 === 2 && XMEN[i / 3 | 0] ? [c, XMEN[i / 3 | 0]] : [c]));

const COVER_W = 196;
const COVER_H = Math.round(COVER_W / 0.66);
const GAP = 18;

function useFonts() {
  const [h] = useState(() => delayRender("banner fonts"));
  useEffect(() => {
    Promise.all([document.fonts.load("800 200px 'Big Shoulders'"), document.fonts.load("700 40px 'Inter'")]).then(
      () => continueRender(h),
      () => continueRender(h)
    );
  }, [h]);
}

export function ChannelBanner() {
  useFonts();
  const cols = 15;
  const rows = 6;
  return (
    <AbsoluteFill style={{ backgroundColor: brand.bg, overflow: "hidden" }}>
      {/* The long box: tilted rows of covers, every other row offset. */}
      <div style={{ position: "absolute", left: -260, top: -330, transform: "rotate(-7deg)", transformOrigin: "50% 50%" }}>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} style={{ display: "flex", gap: GAP, marginBottom: GAP, marginLeft: r % 2 ? -(COVER_W / 2) : 0 }}>
            {Array.from({ length: cols }, (_, c) => {
              const src = WALL[(r * 7 + c * 1) % WALL.length];
              return (
                <Img
                  key={c}
                  src={staticFile(src)}
                  style={{ width: COVER_W, height: COVER_H, objectFit: "cover", borderRadius: 8, boxShadow: "0 18px 40px rgba(0,0,0,0.65), 0 0 0 3px rgba(0,0,0,0.85)", flex: "none" }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Dim the wall, and a dark band through the safe area for the type. */}
      <AbsoluteFill style={{ background: "rgba(9,12,17,0.42)" }} />
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, rgba(9,12,17,0) 28%, rgba(9,12,17,0.9) 38%, rgba(9,12,17,0.94) 62%, rgba(9,12,17,0) 72%)`,
        }}
      />
      <AbsoluteFill style={{ background: `radial-gradient(40% 22% at 50% 50%, ${brand.blueBright}55 0%, transparent 100%)` }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 506, height: 6, background: brand.gold, opacity: 0.9 }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 928, height: 6, background: brand.gold, opacity: 0.9 }} />

      {/* Safe area: 1546x423 centered (x 507-2053, y 508-931). */}
      <div style={{ position: "absolute", left: 507, top: 508, width: 1546, height: 423, display: "flex", alignItems: "center", justifyContent: "center", gap: 56 }}>
        <Img src={staticFile("brand/badge-transparent.png")} style={{ width: 300, height: 300, filter: "drop-shadow(0 16px 40px rgba(0,0,0,0.7))" }} />
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 196, lineHeight: 0.86, textTransform: "uppercase", letterSpacing: "0.01em", color: "#fff" }}>
            Comix<span style={{ color: brand.gold }}>Catalog</span>
          </div>
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 70, lineHeight: 1, textTransform: "uppercase", color: brand.gold, letterSpacing: "0.03em" }}>
            Comics. No homework.
          </div>
          <div style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 34, color: brand.text, opacity: 0.85, letterSpacing: "0.02em" }}>
            Where to start · What to read · Track what you own
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
