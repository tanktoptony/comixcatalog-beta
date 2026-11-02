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
import { Caption, Panel, Paper, art, useComicFonts } from "../shared/components/comicPage.jsx";

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

// Comic-page banner (Tony, 2026-11-02: "less AI looking", the site's tagline,
// heroes behind it, mostly DC and Image with a couple of X-Men, no indies).
// Same kit as the thumbnails: a printed page, ink-ruled panels, one lettered
// caption, no glows. The middle tier is the strip desktops show (y 508-931):
// a roll call of close-ups either side of the title panel, which sits inside
// the phone-safe box (x 507-2053). The top and bottom tiers only show on TVs.
// Art: public/brand/banner-heroes, copied from the episode assets and the
// catalog's canonical-covers bucket.
// Looked up at render, so a checkout without these files only fails this still.
const hero = (file, width, height, trimTop = 0) => art("brand", [`brand/banner-heroes/${file}`, width, height, trimTop]);
const covers = () => ({
  dragon: hero("savage-dragon-001-1993.jpg", 658, 1004, 0.32), // Image
  phoenix: hero("x-men-135-1980.jpg", 565, 861, 0.28), // Marvel, Ep 001
  wolverine: hero("x-men-001-1991-variant-3.jpg", 1280, 1983, 0.3), // Marvel, Ep 001, 003
  coheed: hero("amory-wars-sstb-004-2007.jpg", 1280, 1920, 0.18), // Image, Ep 004, 005
  darkKnight: hero("batman-the-dark-knight-returns-1.jpg", 640, 983), // DC
  flash: hero("showcase-4.jpg", 1099, 1600, 0.355), // DC
  action: hero("action-comics-1.jpg", 400, 621, 0.36), // DC
  wildcats: hero("wildcats-001-1992.jpg", 3972, 6078, 0.32), // Image
  wonderWoman: hero("wonder-woman-001-1987.jpg", 352, 517, 0.22), // DC
  spawn: hero("spawn-1.jpg", 655, 1013, 0.31), // Image
  killingJoke: hero("killing-joke-1988.jpg", 456, 700), // DC
  einstein: hero("mp-einstein-gateway-panel.jpg", 1170, 432), // Image, Ep 002
  invincible: hero("invincible-001-2003.jpg", 600, 934, 0.22), // Image
  kingdomCome: hero("kingdom-come-001-1996.jpg", 956, 1462, 0.36), // DC
});

export function ChannelBannerComic() {
  useComicFonts();
  const COVERS = covers();
  return <Paper>
    {/* TV-only top tier. */}
    <Panel points={[[16, 24], [640, 24], [628, 496], [16, 496]]} image={COVERS.darkKnight} focus={[0.47, 0.42]} />
    <Panel points={[[654, 24], [1270, 24], [1282, 496], [642, 496]]} image={COVERS.wildcats} focus={[0.5, 0.45]} />
    <Panel points={[[1284, 24], [1906, 24], [1906, 496], [1296, 496]]} image={COVERS.wonderWoman} focus={[0.5, 0.5]} />
    <Panel points={[[1920, 24], [2544, 24], [2544, 496], [1920, 496]]} image={COVERS.spawn} focus={[0.5, 0.45]} />

    {/* Desktop strip: the roll call and the title panel. */}
    <Panel points={[[16, 524], [248, 524], [236, 916], [16, 916]]} image={COVERS.dragon} focus={[0.35, 0.5]} zoom={1.6} />
    <Panel points={[[262, 524], [492, 524], [504, 916], [250, 916]]} image={COVERS.phoenix} focus={[0.47, 0.42]} zoom={2.2} />
    <Panel points={[[506, 524], [736, 524], [736, 916], [518, 916]]} image={COVERS.wolverine} focus={[0.52, 0.75]} zoom={2.4} />
    <Panel points={[[750, 524], [1810, 524], [1810, 916], [750, 916]]} fill={brand.blue}>
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,.07) 1.8px, transparent 2.3px)", backgroundSize: "10px 10px" }} />
    </Panel>
    {/* #4 cover faces: Coheed about (0.48, 0.44), Cambria (0.62, 0.40). */}
    <Panel points={[[1824, 524], [2054, 524], [2042, 916], [1824, 916]]} image={COVERS.coheed} focus={[0.55, 0.46]} zoom={2.8} />
    <Panel points={[[2068, 524], [2300, 524], [2312, 916], [2056, 916]]} image={COVERS.killingJoke} focus={[0.7, 0.33]} zoom={1.8} />
    <Panel points={[[2314, 524], [2544, 524], [2544, 916], [2326, 916]]} image={COVERS.flash} focus={[0.2, 0.52]} zoom={2} />
    <Img src={staticFile("brand/badge-transparent.png")} style={{ position: "absolute", left: 792, top: 572, height: 296 }} />
    <Img src={staticFile("brand/wordmark-transparent.png")} style={{ position: "absolute", left: 1090, top: 556, height: 206 }} />
    <Caption lines={["Catalog. Collect. Connect."]} size={64} pos={{ left: 1082, top: 790 }} />

    {/* TV-only bottom tier. */}
    <Panel points={[[16, 944], [520, 944], [508, 1416], [16, 1416]]} image={COVERS.action} focus={[0.5, 0.6]} />
    <Panel points={[[534, 944], [1300, 944], [1312, 1416], [522, 1416]]} image={COVERS.einstein} focus={[0.25, 0.4]} />
    <Panel points={[[1314, 944], [1830, 944], [1830, 1416], [1326, 1416]]} image={COVERS.invincible} focus={[0.4, 0.5]} />
    <Panel points={[[1844, 944], [2544, 944], [2544, 1416], [1844, 1416]]} image={COVERS.kingdomCome} focus={[0.5, 0.5]} />
  </Paper>;
}
