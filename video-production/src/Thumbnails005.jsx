import React, { useEffect, useState } from "react";
import { AbsoluteFill, Img, continueRender, delayRender, staticFile } from "remotion";
import "@fontsource/big-shoulders/800.css";
import { brand, fonts } from "../shared/brand.js";
import { available } from "../shared/components/primitives.jsx";
import { resolveAsset } from "../shared/timeline.js";

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

export const THUMBNAILS_005 = [["Thumb005TenSongs", Thumb005TenSongs], ["Thumb005NameNames", Thumb005NameNames]];
