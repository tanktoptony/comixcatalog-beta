import React, { useEffect, useState } from "react";
import { AbsoluteFill, Img, continueRender, delayRender, staticFile } from "remotion";
import "@fontsource/big-shoulders/800.css";
import { brand, fonts } from "../shared/brand.js";
import { available } from "../shared/components/primitives.jsx";
import { resolveAsset } from "../shared/timeline.js";

const EP = "episode-004";
function useFonts() {
  const [h] = useState(() => delayRender("thumb fonts"));
  useEffect(() => { document.fonts.load("800 140px 'Big Shoulders'").then(() => continueRender(h), () => continueRender(h)); }, [h]);
}
const Pic = ({ path, style }) => <Img src={staticFile(resolveAsset(EP, path, available))} style={{ objectFit: "cover", ...style }} />;
const Big = ({ children, size = 112 }) => <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: size, lineHeight: .84, textTransform: "uppercase", color: "#fff", WebkitTextStroke: `${Math.round(size / 28)}px #000`, paintOrder: "stroke fill", textShadow: "0 8px 0 rgba(0,0,0,.65)" }}>{children}</div>;
const card = (i, count = 3) => ({ position: "absolute", width: 300, height: 455, left: 30 + i * 165, top: 145 - Math.abs((count - 1) / 2 - i) * 25, transform: `rotate(${[-10, 0, 10][i] ?? 0}deg)`, borderRadius: 8, boxShadow: "0 25px 60px #000, 0 0 0 4px #050505" });

export function Thumb004AmoryWars() {
  useFonts();
  const art = ["covers/bag-on-line-sstb-001-2004.jpg", "albums/2002-the-second-stage-turbine-blade.jpg", "covers/amory-wars-sstb-001-2007.jpg"];
  return <AbsoluteFill style={{ background: `radial-gradient(70% 100% at 20% 50%, ${brand.gold}55, transparent 65%), linear-gradient(135deg, ${brand.blue}, ${brand.bg} 75%)` }}>
    {/* Album art is square: never squeeze it into a comic-cover shape. */}
    {art.map((path, i) => <Pic key={path} path={path} style={path.startsWith("albums/") ? { ...card(i), width: 400, height: 400, left: 150, top: 165 } : card(i)} />)}
    <AbsoluteFill style={{ background: "linear-gradient(90deg, transparent 22%, rgba(4,10,44,.3) 42%, rgba(4,10,44,.97) 62%)" }} />
    <div style={{ position: "absolute", right: 42, top: 105, width: 690, textAlign: "right" }}><Big size={128}>The story</Big><Big size={128}><span style={{ color: brand.gold }}>in the albums</span></Big></div>
  </AbsoluteFill>;
}

export function Thumb004TwoIssues() {
  useFonts();
  const art = ["covers/bag-on-line-sstb-001-2004.jpg", "covers/bag-on-line-sstb-002-2004.jpg"];
  return <AbsoluteFill style={{ background: `linear-gradient(135deg, ${brand.blueBright}, ${brand.bg} 76%)` }}>
    {art.map((path, i) => <Pic key={path} path={path} style={{ ...card(i, 2), width: 350, height: 530, left: 30 + i * 235, top: 100, transform: `rotate(${i ? 7 : -7}deg)` }} />)}
    <AbsoluteFill style={{ background: "linear-gradient(90deg, transparent 25%, rgba(4,10,44,.25) 43%, rgba(4,10,44,.98) 62%)" }} />
    <div style={{ position: "absolute", right: 40, top: 82, width: 690, textAlign: "right" }}><Big size={160}><span style={{ color: brand.gold }}>Only 2</span></Big><Big size={128}>issues.</Big><Big size={110}>Then it stopped.</Big></div>
  </AbsoluteFill>;
}

export const THUMBNAILS_004 = [["Thumb004AmoryWars", Thumb004AmoryWars], ["Thumb004TwoIssues", Thumb004TwoIssues]];
