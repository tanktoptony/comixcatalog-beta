import React, { useEffect, useState } from "react";
import { AbsoluteFill, Img, continueRender, delayRender, staticFile } from "remotion";
import "@fontsource/big-shoulders/800.css";
import { brand, fonts } from "../shared/brand.js";
import { available } from "../shared/components/primitives.jsx";
import { resolveAsset } from "../shared/timeline.js";

const EP = "episode-003";
const covers = ["cerebus-001-1977", "milk-and-cheese-001-1991", "scud-the-disposable-assassin-001-1994"];
function useFonts() {
  const [h] = useState(() => delayRender("thumb fonts"));
  useEffect(() => { document.fonts.load("800 140px 'Big Shoulders'").then(() => continueRender(h), () => continueRender(h)); }, [h]);
}
const Pic = ({ name, style }) => <Img src={staticFile(resolveAsset(EP, `covers/${name}.jpg`, available))} style={{ objectFit: "cover", ...style }} />;
const Big = ({ children, color = "#fff", size = 116 }) => <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: size, lineHeight: 0.84, textTransform: "uppercase", color, WebkitTextStroke: `${Math.round(size / 28)}px #000`, paintOrder: "stroke fill", textShadow: "0 8px 0 rgba(0,0,0,.6)" }}>{children}</div>;
const card = (i, extra = {}) => ({ position: "absolute", width: 285, height: 432, left: 34 + i * 150, top: 145 - Math.abs(1 - i) * 25, transform: `rotate(${[-10, 0, 10][i]}deg)`, borderRadius: 8, boxShadow: "0 25px 60px #000, 0 0 0 4px #050505", ...extra });

export function Thumb003LongBoxes() {
  useFonts();
  return <AbsoluteFill style={{ background: `radial-gradient(70% 100% at 20% 50%, ${brand.blueBright}66, transparent 65%), linear-gradient(135deg, ${brand.blue}, ${brand.bg} 75%)` }}>
    {covers.map((name, i) => <Pic key={name} name={name} style={card(i)} />)}
    <div style={{ position: "absolute", right: 42, top: 105, width: 670, textAlign: "right" }}>
      <Big size={148}><span style={{ color: brand.gold }}>2</span> long boxes</Big>
      <div style={{ height: 20 }} />
      <Big size={132}>1 real test</Big>
    </div>
  </AbsoluteFill>;
}

export function Thumb003CouldntFind() {
  useFonts();
  return <AbsoluteFill style={{ background: `linear-gradient(135deg, ${brand.blueBright} 0%, ${brand.blue} 42%, ${brand.bg} 100%)` }}>
    {covers.map((name, i) => <Pic key={name} name={name} style={card(i, { width: 310, height: 470, left: 22 + i * 170, top: 140 - Math.abs(1 - i) * 18 })} />)}
    <AbsoluteFill style={{ background: "linear-gradient(90deg, transparent 26%, rgba(4,10,44,.35) 43%, rgba(4,10,44,.98) 60%)" }} />
    <div style={{ position: "absolute", right: 42, top: 100, width: 690, textAlign: "right" }}>
      <Big size={125}>My site</Big>
      <Big size={125} color={brand.gold}>couldn't find</Big>
      <Big size={125}>these</Big>
    </div>
  </AbsoluteFill>;
}

export const THUMBNAILS_003 = [["Thumb003LongBoxes", Thumb003LongBoxes], ["Thumb003CouldntFind", Thumb003CouldntFind]];
