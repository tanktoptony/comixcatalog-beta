import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { brand, fonts } from "../brand.js";
import { DOSSIERS } from "../dossiers.js";
import { Halftone, Media } from "./primitives.jsx";

export const DOSSIER_THEMES = {
  doom: { ironDark: "#1f2427", iron: "#353d42", ironLight: "#59636a", green: "#4c6a3f", greenDeep: "#2e4229", parchment: "#efe6cf", ink: "#1b1a17", gold: "#b08d45", goldLight: "#d9b968" },
  comixcatalog: { ironDark: brand.bg, iron: brand.blue, ironLight: brand.blueBright, green: brand.blueBright, greenDeep: brand.blue, parchment: brand.offwhite, ink: brand.ink, gold: brand.goldMuted, goldLight: brand.gold },
};

const allLayers = { frame: true, art: true, lettering: true, meters: true };
const enabled = (layers) => layers == null ? allLayers : layers;

function Corner({ corner, color }) {
  const transforms = { tl: "none", tr: "rotate(90 50 50)", br: "rotate(180 50 50)", bl: "rotate(270 50 50)" };
  // Sits on the iron border so the brackets never cross the lettering.
  const pos = { tl: { left: 22, top: 22 }, tr: { right: 22, top: 22 }, br: { right: 22, bottom: 22 }, bl: { left: 22, bottom: 22 } }[corner];
  return <svg viewBox="0 0 100 100" style={{ position: "absolute", width: 60, height: 60, ...pos }}><g transform={transforms[corner]} fill="none" stroke={color} strokeWidth="8"><path d="M8 72V26L26 8H72M8 48L48 8" /><path d="M66 20l8 8-8 8-8-8z" fill={color} stroke="none" /></g></svg>;
}

function Frame({ theme: t }) {
  const rivets = [];
  [300, 700, 1100].forEach((y) => [18, 958].forEach((x) => rivets.push([x, y])));
  [280, 700].forEach((x) => [18, 1358].forEach((y) => rivets.push([x, y])));
  return <>
    <AbsoluteFill style={{ border: "34px solid transparent", borderImage: `linear-gradient(135deg, ${t.ironLight}, ${t.iron} 42%, ${t.ironDark} 72%) 1`, boxSizing: "border-box", background: "repeating-linear-gradient(100deg, rgba(255,255,255,.025) 0 2px, transparent 2px 7px)", pointerEvents: "none" }} />
    <div style={{ position: "absolute", inset: 38, border: `4px solid ${t.gold}`, boxShadow: `inset 4px 4px 0 ${t.ironLight}, inset -5px -5px 0 ${t.ironDark}` }} />
    {rivets.map(([x, y], i) => <div key={i} style={{ position: "absolute", left: x, top: y, width: 24, height: 24, borderRadius: "50%", background: `radial-gradient(circle at 35% 30%, ${t.ironLight}, ${t.ironDark} 72%)`, boxShadow: "0 2px 4px #000" }} />)}
    {['tl', 'tr', 'br', 'bl'].map((c) => <Corner key={c} corner={c} color={t.goldLight} />)}
  </>;
}

function Seal({ number, t }) {
  return <div style={{ position: "absolute", right: 72, top: 76, width: 150, height: 150, borderRadius: "50%", background: `repeating-conic-gradient(${t.ink} 0 1deg, transparent 1deg 10deg), radial-gradient(circle, ${t.goldLight} 0 59%, ${t.ink} 60% 63%, ${t.gold} 64%)`, boxShadow: `0 0 0 5px ${t.gold}` }}><div style={{ position: "absolute", inset: 19, borderRadius: "50%", background: t.gold, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fonts.display, fontWeight: 900, fontSize: 64, color: t.ink }}>{number}</div></div>;
}

function Base({ children, frame, t, background = "transparent" }) {
  return <div style={{ width: 1000, height: 1400, position: "relative", overflow: "hidden", boxSizing: "border-box", background }}>{children}{frame && <Frame theme={t} />}</div>;
}

export function DossierFront({ data, theme, layers }) {
  const t = theme ?? DOSSIER_THEMES[data.theme] ?? DOSSIER_THEMES.comixcatalog;
  const l = enabled(layers);
  const focus = { x: .5, y: .5, zoom: 1, ...data.art.focus };
  return <Base frame={l.frame} t={t} background={l.frame ? t.iron : "transparent"}>
    {l.art && <div style={{ position: "absolute", left: 68, right: 68, top: 250, height: 820, overflow: "hidden", border: `4px solid ${t.ink}`, background: t.ironDark }}>
      <Media asset={data.art.asset} box={{ w: 864, h: 820 }} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", objectPosition: `${focus.x * 100}% ${focus.y * 100}%`, transform: `scale(${focus.zoom})`, transformOrigin: `${focus.x * 100}% ${focus.y * 100}%` }} />
      <Halftone opacity={.08} size={8} />
      <AbsoluteFill style={{ background: `linear-gradient(transparent 58%, ${t.greenDeep} 100%)` }} />
    </div>}
    {l.lettering && <>
      <div style={{ position: "absolute", left: 72, top: 72, color: t.parchment, fontFamily: fonts.body, fontWeight: 600, fontSize: 22, letterSpacing: ".32em" }}>COMIXCATALOG</div>
      <div style={{ position: "absolute", left: 70, top: 105, color: t.parchment, fontFamily: fonts.display, fontWeight: 800, fontSize: 54 }}>CHARACTER DOSSIER</div>
      <Seal number={data.number} t={t} />
      <div style={{ position: "absolute", left: 52, right: 52, top: 940, textAlign: "center", fontFamily: fonts.display, fontWeight: 900, fontSize: 118, lineHeight: .9, color: t.parchment, textShadow: `5px 5px 0 ${t.ink}`, whiteSpace: "nowrap" }}>{data.name}</div>
      <div style={{ position: "absolute", left: 110, right: 110, top: 1060, height: 58, display: "flex", alignItems: "center", justifyContent: "center", background: t.green, border: `3px solid ${t.ink}`, color: t.parchment, fontFamily: fonts.body, fontWeight: 700, fontSize: 26, letterSpacing: ".18em" }}>{data.realName} · {data.homeland}</div>
      <div style={{ position: "absolute", left: 70, right: 70, top: 1160, borderTop: `3px solid ${t.gold}`, paddingTop: 20, color: t.parchment }}><div style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 19, letterSpacing: ".18em", color: t.goldLight }}>FIRST APPEARANCE</div><div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 42, marginTop: 4 }}>{data.firstAppearance} · {data.creators}</div></div>
      <div style={{ position: "absolute", left: 70, bottom: 48, fontFamily: fonts.body, fontSize: 15, color: t.parchment, opacity: .82 }}>{data.art.credit}</div>
    </>}
  </Base>;
}

function Meter({ stat, index, t, progress, highlight, overlayData, overlayAmount }) {
  const rowStart = index / 7.5;
  const rowProgress = interpolate(progress, [rowStart, rowStart + .25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dim = highlight && highlight !== stat.key ? .35 : 1;
  const overlayValue = overlayData?.values[stat.key] ?? stat.value;
  const boosted = overlayValue > stat.value && overlayAmount > 0;
  return <div style={{ height: 64, display: "grid", gridTemplateColumns: "262px 1fr 104px", alignItems: "center", gap: 14, opacity: dim }}>
    <div style={{ fontFamily: fonts.body, fontWeight: 800, fontSize: 23 }}>{stat.label}</div>
    <div style={{ display: "flex", gap: 8 }}>{[1,2,3,4,5,6,7].map((n) => {
      const filled = n <= stat.value && rowProgress >= n / 7;
      const ghost = n > stat.value && n <= overlayValue;
      return <div key={n} style={{ flex: 1, height: 34, boxSizing: "border-box", border: `2px solid ${ghost && overlayAmount > 0 ? t.ink + "99" : t.ink + "40"}`, background: filled ? `linear-gradient(${t.ironLight} 0 3px, ${t.green} 3px)` : ghost ? overlayData.color : "transparent", opacity: ghost ? overlayAmount : 1, boxShadow: ghost ? `0 0 ${18 * overlayAmount}px ${overlayData.color}` : "none" }} />;
    })}</div>
    {/* During a power-up the baseline number stays, dimmed, beside the temporary one. */}
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, fontFamily: fonts.display, fontWeight: 900, fontSize: 42 }}>
      <span style={{ opacity: boosted ? 1 - .6 * overlayAmount : 1 }}>{stat.value}</span>
      {boosted && <span style={{ opacity: overlayAmount, fontSize: 30, lineHeight: 1, padding: "3px 8px", borderRadius: 6, background: overlayData.color, border: `2px solid ${t.ink}` }}>{overlayValue}</span>}
    </div>
  </div>;
}

export function DossierBack({ data, theme, layers, overlay, overlayAmount = 0, progress = 1, meterProgress = progress, badgeProgress = 1, highlight }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = theme ?? DOSSIER_THEMES[data.theme] ?? DOSSIER_THEMES.comixcatalog;
  const l = enabled(layers);
  const overlayData = data.overlays?.[overlay];
  const overlayActive = overlayData && overlayAmount > 0;
  const badgeSpring = spring({ frame: badgeProgress * 24, fps, config: { damping: 12, stiffness: 170 } });
  const badgeRotate = interpolate(badgeSpring, [0, 1], [6, 0]);
  const pulse = .75 + .25 * Math.sin(frame / 5);
  return <Base frame={l.frame} t={t} background={l.frame ? t.parchment : "transparent"}>
    {l.frame && <div style={{ position: "absolute", inset: 38, backgroundImage: "repeating-radial-gradient(circle at 20% 30%, rgba(60,45,20,.055) 0 1px, transparent 1px 5px)" }} />}
    {overlayData && overlayAmount > 0 && <div style={{ position: "absolute", inset: 38, opacity: overlayAmount * pulse, background: `radial-gradient(circle at 50% 30%, ${overlayData.color}55, transparent 62%)` }} />}
    {l.lettering && <>
      <div style={{ position: "absolute", left: 70, top: 68, fontFamily: fonts.display, fontWeight: 900, fontSize: 48, color: t.ink }}>DOSSIER {data.number} · {data.name}</div>
      <div style={{ position: "absolute", left: 70, top: 130, padding: "8px 17px", borderRadius: 24, background: overlayActive ? overlayData.color : t.green, color: overlayActive ? t.ink : t.parchment, fontFamily: fonts.body, fontWeight: 800, fontSize: 18, letterSpacing: ".08em" }}>{overlayActive ? overlayData.tag : data.profileTag}</div>
      {overlayActive && <div style={{ position: "absolute", right: 70, top: 142, fontFamily: fonts.body, fontWeight: 700, fontSize: 15, color: t.ink, opacity: overlayAmount }}>SOURCE: {overlayData.source}</div>}
    </>}
    {l.meters && <div style={{ position: "absolute", left: 70, right: 70, top: 215, color: t.ink }}>
      {data.stats.map((stat, i) => <Meter key={stat.key} stat={stat} index={i} t={t} progress={meterProgress} highlight={highlight} overlayData={overlayData} overlayAmount={overlayAmount} />)}
      <div style={{ marginTop: 7, fontFamily: fonts.body, fontSize: 14, color: t.ink, opacity: .65 }}>{data.statsSource}</div>
    </div>}
    {l.lettering && <>
      <div style={{ position: "absolute", right: 72, top: 640, width: 180, height: 180, borderRadius: "50%", border: `9px solid ${t.gold}`, background: t.parchment, boxShadow: `0 8px 0 ${t.ink}55`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: t.ink, transform: `translateX(${(1 - badgeSpring) * 180}px) scale(${.45 + .55 * badgeSpring}) rotate(${badgeRotate}deg)` }}>
        <div style={{ fontFamily: fonts.body, fontWeight: 800, fontSize: 19, letterSpacing: ".12em" }}>{data.sorcery.label}</div><div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: data.sorcery.value == null ? 35 : 60 }}>{data.sorcery.value ?? "UNRATED"}</div><div style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 13 }}>{data.sorcery.note}</div>
      </div>
      <div style={{ position: "absolute", left: 70, top: 668, width: 640, color: t.ink, fontFamily: fonts.body, fontSize: 21, lineHeight: 1.35 }}>{data.bio.map((line, i) => <div key={i} style={{ marginBottom: 6 }}>{line}</div>)}</div>
      <InfoList title="EQUIPMENT & ABILITIES" items={data.equipment} top={850} left={70} width={420} t={t} />
      <InfoList title="ESSENTIAL READING" items={data.essentials} top={850} left={525} width={405} numbered t={t} />
      {data.vitals && <div style={{ position: "absolute", left: 70, right: 70, top: 1100, display: "flex", gap: 36, color: t.ink, fontFamily: fonts.body, fontSize: 18, fontWeight: 600 }}>
        {data.vitals.map(([label, value]) => <div key={label}><span style={{ fontWeight: 800, letterSpacing: ".14em", color: t.green, marginRight: 10 }}>{label}</span>{value}</div>)}
      </div>}
      {data.contexts && <ContextStrip contexts={data.contexts} t={t} overlayData={overlayActive ? overlayData : null} overlayAmount={overlayAmount} />}
      {data.footer && <div style={{ position: "absolute", left: 70, right: 70, bottom: 66, display: "flex", justifyContent: "space-between", color: t.ink, opacity: .6, fontFamily: fonts.body, fontWeight: 700, fontSize: 15, letterSpacing: ".16em" }}>{data.footer.map((s) => <span key={s}>{s}</span>)}</div>}
    </>}
  </Base>;
}

// A / B / C power contexts. The baseline card lights A; a power-up overlay lights C.
function ContextStrip({ contexts, t, overlayData, overlayAmount }) {
  return <div style={{ position: "absolute", left: 70, right: 70, top: 1158, color: t.ink }}>
    <div style={{ fontFamily: fonts.body, fontWeight: 800, fontSize: 15, letterSpacing: ".2em", opacity: .7, marginBottom: 8 }}>POWER CONTEXT</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>{contexts.map((label, i) => {
      const lit = overlayData ? i === contexts.length - 1 : i === 0;
      const color = overlayData && lit ? overlayData.color : t.green;
      return <div key={label} style={{ height: 52, display: "flex", alignItems: "center", gap: 10, padding: "0 14px", boxSizing: "border-box", border: `2px solid ${lit ? t.ink : t.ink + "40"}`, background: lit ? color : "transparent", color: lit && !overlayData ? t.parchment : t.ink, opacity: lit && overlayData ? Math.max(overlayAmount, .35) : 1, fontFamily: fonts.body, fontWeight: 800, fontSize: 17, letterSpacing: ".06em" }}>
        <span style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 30 }}>{"ABC"[i]}</span>{label}
      </div>;
    })}</div>
  </div>;
}

function InfoList({ title, items, top, left, width, numbered, t }) {
  return <div style={{ position: "absolute", top, left, width, color: t.ink }}><div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 30, borderBottom: `3px solid ${t.gold}`, paddingBottom: 5, marginBottom: 11 }}>{title}</div>{items.map((item, i) => <div key={i} style={{ display: "flex", gap: 9, fontFamily: fonts.body, fontWeight: 600, fontSize: 18, lineHeight: 1.25, marginBottom: 10 }}><span style={{ color: t.green, fontWeight: 800 }}>{numbered ? `${i + 1}.` : "◆"}</span><span>{item}</span></div>)}</div>;
}

export function DossierCard({ data, flip = 0, overlay, overlayAmount = 0, meterProgress = 1, badgeProgress = 1, height = 900, highlight }) {
  const frame = useCurrentFrame();
  const t = DOSSIER_THEMES[data.theme] ?? DOSSIER_THEMES.comixcatalog;
  const overlayData = data.overlays?.[overlay];
  const width = height * 5 / 7;
  const scale = height / 1400;
  const shadowWidth = 55 + 35 * Math.abs(flip - .5) * 2;
  const face = { position: "absolute", inset: 0, width: 1000, height: 1400, transformOrigin: "top left", backfaceVisibility: "hidden" };
  return <div style={{ position: "relative", width, height, perspective: 2600 }}>
    <div style={{ position: "absolute", left: `${(100 - shadowWidth) / 2}%`, width: `${shadowWidth}%`, height: 35, bottom: -28, borderRadius: "50%", background: "rgba(0,0,0,.48)", filter: "blur(16px)" }} />
    {overlayData && <div style={{ position: "absolute", inset: -10, borderRadius: 16, opacity: overlayAmount, boxShadow: `0 0 ${45 + 20 * Math.sin(frame / 5)}px ${overlayData.color}` }} />}
    <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: `rotateY(${flip * 180}deg)` }}>
      <div style={{ ...face, transform: `scale(${scale})` }}><DossierFront data={data} theme={t} /></div>
      {/* Faces scale from the top-left corner, so the back face rotates about its left edge; shift it one card width so it lands on the front. */}
      <div style={{ ...face, transform: `translateX(${width}px) rotateY(180deg) scale(${scale})` }}><DossierBack data={data} theme={t} overlay={overlay} overlayAmount={overlayAmount} meterProgress={meterProgress} badgeProgress={badgeProgress} highlight={highlight} /></div>
    </div>
  </div>;
}

export function DossierReveal({ card, start = "front", flipAt = null, overlay = null, highlight = null }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const data = DOSSIERS[card];
  if (!data) throw new Error(`Unknown dossier: ${card}`);
  const target = start === "back" ? 1 : 0;
  const flip = flipAt == null ? target : interpolate(frame, [flipAt * fps, flipAt * fps + 18], [target, 1 - target], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const overlayAmount = overlay ? interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  return <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}><DossierCard data={data} flip={flip} overlay={overlay} overlayAmount={overlayAmount} meterProgress={1} badgeProgress={1} height={900} highlight={highlight} /></AbsoluteFill>;
}
