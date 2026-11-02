import React, { useEffect, useState } from "react";
import { AbsoluteFill, Img, continueRender, delayRender, staticFile } from "remotion";
import "@fontsource/big-shoulders/800.css";
import { brand, fonts } from "../shared/brand.js";
import { available } from "../shared/components/primitives.jsx";
import { resolveAsset } from "../shared/timeline.js";
import { Balloon, Caption, CornerBar, Panel, Paper, art, useComicFonts } from "../shared/components/comicPage.jsx";

const EP = "episode-005";
function useFonts() {
  const [h] = useState(() => delayRender("thumb fonts"));
  useEffect(() => { document.fonts.load("800 140px 'Big Shoulders'").then(() => continueRender(h), () => continueRender(h)); }, [h]);
}
const Pic = ({ path, style }) => <Img src={staticFile(resolveAsset(EP, path, available))} style={{ objectFit: "cover", borderRadius: 8, boxShadow: "0 25px 60px #000, 0 0 0 4px #050505", position: "absolute", ...style }} />;
const Big = ({ children, size = 112 }) => <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: size, lineHeight: .84, textTransform: "uppercase", color: "#fff", WebkitTextStroke: `${Math.round(size / 28)}px #000`, paintOrder: "stroke fill", textShadow: "0 8px 0 rgba(0,0,0,.65)" }}>{children}</div>;
const SSTB = "albums/2002-the-second-stage-turbine-blade.jpg";

// A: the album and the comic, "10 songs. One story."
export function Thumb005TenSongs() {
  useFonts();
  return <AbsoluteFill style={{ background: `radial-gradient(70% 100% at 22% 50%, ${brand.gold}55, transparent 65%), linear-gradient(135deg, ${brand.blue}, ${brand.bg} 75%)` }}>
    {/* Album art is square: never squeeze it into a comic-cover shape. */}
    <Pic path={SSTB} style={{ width: 420, height: 420, left: 40, top: 150, transform: "rotate(-6deg)" }} />
    <Pic path="covers/amory-wars-sstb-001-2007.jpg" style={{ width: 300, height: 462, left: 330, top: 128, transform: "rotate(7deg)" }} />
    <AbsoluteFill style={{ background: "linear-gradient(90deg, transparent 30%, rgba(4,10,44,.35) 48%, rgba(4,10,44,.97) 64%)" }} />
    <div style={{ position: "absolute", right: 40, top: 150, width: 700, textAlign: "right" }}><Big size={150}><span style={{ color: brand.gold }}>10 songs.</span></Big><Big size={150}>One story.</Big></div>
  </AbsoluteFill>;
}

// B: the cast list hiding in the lyrics.
export function Thumb005NameNames() {
  useFonts();
  return <AbsoluteFill style={{ background: `linear-gradient(135deg, ${brand.blueBright}, ${brand.bg} 76%)` }}>
    <Pic path="covers/amory-wars-sstb-002-2007.jpg" style={{ width: 360, height: 540, left: 40, top: 90, transform: "rotate(-6deg)" }} />
    <Pic path={SSTB} style={{ width: 300, height: 300, left: 300, top: 330, transform: "rotate(6deg)" }} />
    <AbsoluteFill style={{ background: "linear-gradient(90deg, transparent 30%, rgba(4,10,44,.3) 47%, rgba(4,10,44,.98) 63%)" }} />
    <div style={{ position: "absolute", right: 40, top: 96, width: 600, textAlign: "right" }}><Big size={128}>The songs</Big><Big size={168}><span style={{ color: brand.gold }}>name</span></Big><Big size={168}><span style={{ color: brand.gold }}>names</span></Big></div>
  </AbsoluteFill>;
}

// Comic-page versions (2026-11-02, shared/components/comicPage.jsx): real
// panels and lettering first, the brand as one corner bar. Balloons are meta
// jokes, never invented dialogue for a real scene; story facts go in captions.
const A = {
  s1: ["covers/amory-wars-sstb-001-2007.jpg", 1280, 1998, 0.18],
  s2: ["covers/amory-wars-sstb-002-2007.jpg", 1280, 1920, 0.18],
  s3: ["covers/amory-wars-sstb-003-2007.jpg", 1280, 1920, 0.18],
  s4: ["covers/amory-wars-sstb-004-2007.jpg", 1280, 1920, 0.18],
  ii2: ["covers/amory-wars-ii-002-2008.jpg", 1964, 3046, 0.21],
  ii3: ["covers/amory-wars-ii-003-2008.jpg", 985, 1527, 0.21],
  album: [SSTB, 900, 900],
  inferno: ["characters/inferno.png", 320, 720],
  mariah: ["characters/mariah.png", 320, 720],
};
const img = (k) => art(EP, A[k]);
const bar = { title: "The Amory Wars · Part 2", sub: "ComixCatalog Originals" };
const VERTICAL = { width: 1080, height: 1920 };

// A: three panels, the cast list caption.
export function Thumb005PageNames() {
  useComicFonts();
  return <Paper>
    <Panel points={[[16, 16], [700, 16], [650, 704], [16, 704]]} image={img("ii3")} focus={[0.48, 0.7]} />
    <Panel points={[[714, 16], [1264, 16], [1264, 340], [690, 340]]} image={img("album")} focus={[0.58, 0.4]} />
    <Panel points={[[689, 354], [1264, 354], [1264, 704], [664, 704]]} image={img("s1")} focus={[0.47, 0.34]} zoom={1.5} />
    <Caption lines={["The songs", "name names."]} size={100} pos={{ left: 36, bottom: 40 }} />
    <Caption lines={["Matthew · Maria · Patrick", "Newo · Norris · Larry · Mariah"]} size={34} bg="#fff" rotate={1.5} pos={{ right: 34, top: 292 }} />
    <CornerBar {...bar} pos={{ left: 30, top: 30 }} />
  </Paper>;
}

// B: one splash panel, Coheed and Cambria in on the joke.
export function Thumb005AboutUs() {
  useComicFonts();
  return <Paper>
    {/* #4 cover faces: Coheed about (0.48, 0.44), Cambria (0.62, 0.40). */}
    <Panel points={[[16, 16], [1264, 16], [1264, 704], [16, 704]]} image={img("s4")} focus={[0.55, 0.42]} zoom={1.4} />
    <Panel points={[[40, 452], [300, 438], [310, 690], [48, 700]]} image={img("album")} focus={[0.5, 0.5]} />
    <Balloon x={870} y={50} w={380} h={240} tail={[790, 300]} lines={["This album", "is about us."]} size={66} />
    <CornerBar {...bar} pos={{ left: 30, top: 30 }} />
  </Paper>;
}

// C: four-panel page, "10 songs. One story." across the gutters.
export function Thumb005PageTenSongs() {
  useComicFonts();
  return <Paper>
    <Panel points={[[16, 16], [662, 16], [648, 350], [16, 362]]} image={img("s1")} focus={[0.47, 0.34]} zoom={1.3} />
    <Panel points={[[676, 16], [1264, 16], [1264, 336], [662, 349]]} image={img("ii2")} focus={[0.55, 0.45]} zoom={1.1} />
    <Panel points={[[16, 376], [647, 364], [632, 704], [16, 704]]} image={img("s3")} focus={[0.5, 0.55]} zoom={1.2} />
    <Panel points={[[661, 363], [1264, 350], [1264, 704], [646, 704]]} image={img("album")} focus={[0.58, 0.4]} />
    <Caption lines={["10 songs.", "One story."]} size={104} pos={{ left: 410, top: 236 }} rotate={-3} />
    <CornerBar {...bar} pos={{ left: 30, top: 30 }} />
  </Paper>;
}

// Shorts thumbnails, 1080x1920. Words sit in the middle of the frame, clear
// of the title and view count YouTube lays over the bottom.
export function Short005CastListThumb() {
  useComicFonts();
  return <Paper>
    <Panel points={[[24, 24], [1056, 24], [1056, 600], [24, 660]]} image={img("album")} focus={[0.58, 0.38]} />
    <Panel points={[[24, 678], [1056, 618], [1056, 1230], [24, 1290]]} image={img("ii3")} focus={[0.48, 0.62]} />
    <Panel points={[[24, 1308], [1056, 1248], [1056, 1896], [24, 1896]]} image={img("s4")} focus={[0.55, 0.49]} zoom={1.2} />
    <Caption lines={["The lyrics", "have a", "cast list"]} size={140} pos={{ left: 60, top: 230 }} rotate={-3} />
    <Caption lines={["Matthew · Maria", "Patrick · Newo", "Norris · Larry · Mariah"]} size={60} bg="#fff" rotate={-2} pos={{ left: 50, top: 1110 }} />
    <CornerBar {...bar} pos={{ left: 48, top: 48 }} scale={1.35} />
  </Paper>;
}

export function Short005CoupleThumb() {
  useComicFonts();
  return <Paper>
    <Caption lines={["The original", "Coheed & Cambria"]} size={122} pos={{ left: 40, top: 170 }} rotate={-2} />
    <Panel points={[[24, 440], [1056, 410], [1056, 1896], [24, 1896]]} image={img("s4")} focus={[0.55, 0.62]} zoom={1.25} />
    <Balloon x={520} y={1230} w={510} h={330} tail={[690, 780]} lines={["The band's", "named", "after us!"]} size={86} />
    <CornerBar {...bar} pos={{ left: 48, top: 40 }} scale={1.35} />
  </Paper>;
}

export function Short005JesseThumb() {
  useComicFonts();
  return <Paper>
    {/* Model sheets, not the #5 cover: they're the art that names Jesse and
        Mariah, and the cover's logo runs through Mariah's face. */}
    <Panel points={[[24, 24], [530, 24], [515, 1100], [24, 1100]]} image={img("inferno")} focus={[0.42, 0.5]} />
    <Panel points={[[544, 24], [1056, 24], [1056, 1100], [529, 1100]]} image={img("mariah")} focus={[0.45, 0.5]} />
    <Panel points={[[24, 1114], [1056, 1114], [1056, 1896], [24, 1896]]} image={img("ii2")} focus={[0.5, 0.55]} zoom={1.1} />
    <Caption lines={["Jesse, the Inferno"]} size={54} bg="#fff" rotate={-2} pos={{ left: 44, top: 740 }} />
    <Caption lines={["His wife, Mariah"]} size={54} bg="#fff" rotate={2} pos={{ right: 44, top: 740 }} />
    <Caption lines={["My favorite", "Coheed character"]} size={112} pos={{ left: 44, top: 860 }} rotate={-3} />
    <Caption lines={["He gave his brother", "one hour."]} size={64} bg="#fff" rotate={-1.5} pos={{ right: 50, top: 1480 }} />
    <CornerBar {...bar} pos={{ left: 48, top: 48 }} scale={1.35} />
  </Paper>;
}

export const THUMBNAILS_005 = [
  ["Thumb005TenSongs", Thumb005TenSongs], ["Thumb005NameNames", Thumb005NameNames],
  ["Thumb005PageNames", Thumb005PageNames], ["Thumb005AboutUs", Thumb005AboutUs], ["Thumb005PageTenSongs", Thumb005PageTenSongs],
  ["Short005CastListThumb", Short005CastListThumb, VERTICAL], ["Short005CoupleThumb", Short005CoupleThumb, VERTICAL], ["Short005JesseThumb", Short005JesseThumb, VERTICAL],
];
