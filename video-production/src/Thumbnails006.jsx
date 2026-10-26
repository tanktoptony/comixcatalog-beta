import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender } from "remotion";
import "@fontsource/big-shoulders/800.css";
import { fonts } from "../shared/brand.js";
import { EpisodeContext, Halftone } from "../shared/components/primitives.jsx";
import { DossierCard, DOSSIER_THEMES } from "../shared/components/dossier.jsx";
import { DOSSIER_001 } from "../episode-006/dossier-001.js";

const EP = "episode-006";
const T = DOSSIER_THEMES.doom;
function useFonts() {
  const [h] = useState(() => delayRender("thumb fonts"));
  useEffect(() => { document.fonts.load("800 140px 'Big Shoulders'").then(() => continueRender(h), () => continueRender(h)); }, [h]);
}
const Big = ({ children, size = 112, color = "#fff" }) => <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: size, lineHeight: .84, textTransform: "uppercase", color, WebkitTextStroke: `${Math.round(size / 28)}px #000`, paintOrder: "stroke fill", textShadow: "0 8px 0 rgba(0,0,0,.65)" }}>{children}</div>;
const Field = ({ children }) => <EpisodeContext.Provider value={{ episodeId: EP }}>
  <AbsoluteFill style={{ background: `radial-gradient(60% 90% at 28% 55%, ${T.green}cc, ${T.ironDark} 70%)` }}><Halftone opacity={.07} size={10} />{children}</AbsoluteFill>
</EpisodeContext.Provider>;

// A: the card front, "DOOM: POWER PROFILE" (the brief's working copy).
export function Thumb006PowerProfile() {
  useFonts();
  return <Field>
    <div style={{ position: "absolute", left: 70, top: 46, transform: "rotate(-5deg)", filter: "drop-shadow(0 25px 40px #000)" }}><DossierCard data={DOSSIER_001} flip={0} height={630} /></div>
    <div style={{ position: "absolute", right: 56, top: 150, width: 640, textAlign: "right" }}>
      <Big size={230} color={T.goldLight}>Doom</Big>
      <div style={{ height: 22 }} />
      <Big size={120}>Power</Big>
      <Big size={120}>Profile</Big>
    </div>
  </Field>;
}

// B: the card back with the God Emperor overlay, "How powerful is Doom?"
export function Thumb006HowPowerful() {
  useFonts();
  return <Field>
    <div style={{ position: "absolute", right: 70, top: 46, transform: "rotate(5deg)", filter: "drop-shadow(0 25px 40px #000)" }}><DossierCard data={DOSSIER_001} flip={1} overlay="godEmperor" overlayAmount={1} height={630} /></div>
    <div style={{ position: "absolute", left: 60, top: 120, width: 700 }}>
      <Big size={140}>How</Big>
      <Big size={140}>powerful</Big>
      <Big size={140}>is <span style={{ color: T.goldLight }}>Doom?</span></Big>
    </div>
  </Field>;
}

export const THUMBNAILS_006 = [["Thumb006PowerProfile", Thumb006PowerProfile], ["Thumb006HowPowerful", Thumb006HowPowerful]];
