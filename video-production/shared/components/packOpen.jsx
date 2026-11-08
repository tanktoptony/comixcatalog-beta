import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { brand, fonts } from "../brand.js";
import { CoverBackdrop, Media, NarrationBox } from "./primitives.jsx";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
const easeOut = Easing.out(Easing.cubic);

function Gloss({ progress, opacity = 0.65 }) {
  const x = interpolate(progress, [0, 1], [-130, 230], clamp);
  return <div style={{ position: "absolute", inset: "-20%", transform: `translateX(${x}%) skewX(-18deg)`, background: "linear-gradient(90deg, transparent 35%, rgba(255,255,255,.1) 43%, rgba(130,235,255,.72) 49%, rgba(255,155,245,.42) 53%, transparent 62%)", mixBlendMode: "screen", opacity }} />;
}

function TradingCard({ asset, size = [685, 954], height = 880, floatFrame = 0, glossProgress = -1, style }) {
  const [w, h] = size;
  const width = height * w / h;
  const bob = Math.sin(floatFrame / 22) * 5;
  const tilt = Math.sin(floatFrame / 31) * 1.5;
  return (
    <div style={{ position: "relative", width, height, border: "7px solid #080a0d", outline: "2px solid rgba(255,255,255,.8)", overflow: "hidden", background: brand.surface, boxShadow: "0 30px 70px rgba(0,0,0,.72), 0 0 34px rgba(80,185,255,.16)", transform: `translateY(${bob}px) rotate(${tilt}deg)`, ...style }}>
      <Media asset={asset} box={{ w: Math.round(width), h: Math.round(height) }} fit="contain" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      {glossProgress >= 0 && glossProgress <= 1 && <Gloss progress={glossProgress} />}
    </div>
  );
}

function SealTeeth({ bottom = false }) {
  const points = Array.from({ length: 29 }, (_, i) => `${i * 20},${i % 2 ? 17 : 2}`).join(" ");
  return <svg viewBox="0 0 560 20" preserveAspectRatio="none" style={{ position: "absolute", left: 0, [bottom ? "bottom" : "top"]: bottom ? 1 : 0, width: "100%", height: 20, transform: bottom ? "scaleY(-1)" : undefined }}><polyline points={points} fill="none" stroke="rgba(10,15,28,.9)" strokeWidth="5" /><polyline points={points} fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="2" /></svg>;
}

function PackFace({ packArt, lines = [], torn = false, shine = 0 }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 22, border: "5px solid #080b16", background: "linear-gradient(118deg, #e9f5ff 0%, #667489 12%, #15bde3 27%, #182774 43%, #e326a7 61%, #6936af 76%, #eafaff 91%, #546477 100%)", boxShadow: "inset 0 0 35px rgba(255,255,255,.65), inset 0 0 0 10px rgba(0,0,0,.2), 0 35px 80px rgba(0,0,0,.65)" }}>
      <div style={{ position: "absolute", inset: 0, opacity: .32, backgroundImage: "repeating-linear-gradient(106deg, transparent 0 18px, rgba(255,255,255,.42) 19px 21px, transparent 22px 37px), repeating-linear-gradient(12deg, rgba(0,0,0,.2) 0 2px, transparent 2px 12px)" }} />
      <div style={{ position: "absolute", left: 58, top: 130, width: 444, height: 390, border: "9px solid #070914", outline: "4px solid #f4d03f", background: "#101522", transform: "rotate(-1deg)", overflow: "hidden", boxShadow: "12px 15px 0 rgba(0,0,0,.45)" }}>
        <Media asset={packArt} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 50%", filter: "saturate(1.18) contrast(1.08)" }} />
      </div>
      <div style={{ position: "absolute", left: 22, right: 22, bottom: 73, textAlign: "center", transform: "rotate(-2deg) skewX(-5deg)" }}>
        {lines.slice(0, 3).map((line, i) => <div key={i} style={{ fontFamily: fonts.display, fontWeight: 800, fontStyle: "italic", fontSize: i === 0 ? 67 : i === 1 ? 56 : 35, lineHeight: .9, letterSpacing: i === 2 ? ".08em" : ".015em", color: i === 1 ? brand.offwhite : brand.gold, WebkitTextStroke: `${i === 2 ? 2 : 4}px #050608`, paintOrder: "stroke fill", textShadow: "7px 7px 0 rgba(0,0,0,.72)", whiteSpace: "nowrap" }}>{line}</div>)}
      </div>
      <div style={{ position: "absolute", top: -170, bottom: -170, width: 125, left: `${interpolate(shine, [0, 1], [-35, 125], clamp)}%`, background: "linear-gradient(90deg, transparent, rgba(255,255,255,.8), transparent)", transform: "skewX(-18deg)", opacity: .7 }} />
      {!torn && <SealTeeth />}
      <SealTeeth bottom />
    </div>
  );
}

export function PackOpen({ card, cardSize = [685, 954], packArt, packArtSize, lines = [], label }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const drop = spring({ frame, fps, durationInFrames: 18, config: { damping: 12, stiffness: 170, mass: .8 } });
  const tear = interpolate(frame, [18, 39], [0, 1], { ...clamp, easing: easeOut });
  const rise = interpolate(frame, [39, 69], [0, 1], { ...clamp, easing: easeOut });
  const finish = interpolate(frame, [69, 96], [0, 1], { ...clamp, easing: easeOut });
  const packY = interpolate(drop, [0, 1], [-1050, 0]) + interpolate(finish, [0, 1], [0, 930]);
  const packRotation = interpolate(drop, [0, 1], [-26, 0]) + Math.sin(Math.max(0, frame - 18) * .9) * (1 - tear) * 4;
  const packOpacity = interpolate(finish, [0, .75, 1], [1, 1, 0], clamp);
  const cardY = interpolate(rise, [0, 1], [100, -500]) + interpolate(finish, [0, 1], [0, 500]);
  const cardScale = interpolate(finish, [0, 1], [560 / 880, 1], clamp);
  const settleY = interpolate(finish, [0, .62, 1], [-9, 7, 0], clamp);
  const gloss = interpolate(frame, [77, 94], [0, 1], clamp);
  const holdFrame = Math.max(0, frame - 96);
  return (
    <AbsoluteFill style={{ backgroundColor: brand.bg, overflow: "hidden" }}>
      <CoverBackdrop asset={card} />
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 45%, rgba(35,94,150,.22), rgba(4,6,10,.78) 68%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", perspective: 1800 }}>
        <div style={{ position: "relative", width: 560, height: 860 }}>
          {/* Hidden until the pack has landed over it (it sits fully behind the pack from then on). */}
          <div style={{ position: "absolute", left: "50%", top: "50%", zIndex: 1, opacity: frame < 18 ? 0 : 1, transform: `translate(-50%, -50%) translateY(${cardY + settleY}px) scale(${cardScale}) rotateY(${interpolate(finish, [0, .7, 1], [-5, 8, 0], clamp)}deg)` }}>
            <TradingCard asset={card} size={cardSize} height={880} floatFrame={finish === 1 ? holdFrame : 0} glossProgress={frame >= 77 && frame <= 94 ? gloss : -1} />
          </div>
          <div style={{ position: "absolute", inset: 0, zIndex: 2, transform: `translateY(${packY}px) rotateX(4deg) rotateY(-5deg) rotateZ(${packRotation}deg)`, opacity: packOpacity }}>
            <PackFace packArt={packArt} packArtSize={packArtSize} lines={lines} torn={tear > .05} shine={(frame % 75) / 74} />
          </div>
          <div style={{ position: "absolute", left: 0, top: 0, width: 560, height: 105, zIndex: 4, transformOrigin: "20% 80%", transform: `translate(${interpolate(tear, [0, 1], [0, -350])}px, ${interpolate(tear, [0, 1], [packY, packY - 360])}px) rotate(${interpolate(tear, [0, 1], [0, -42])}deg)`, opacity: interpolate(tear, [.75, 1], [1, 0], clamp), overflow: "hidden" }}>
            <div style={{ position: "relative", width: 560, height: 105, borderRadius: "22px 22px 4px 4px", border: "5px solid #080b16", boxSizing: "border-box", background: "linear-gradient(118deg, #e9f5ff, #15bde3 30%, #e326a7 65%, #eafaff)", boxShadow: "inset 0 0 24px rgba(255,255,255,.7), 0 20px 35px rgba(0,0,0,.45)" }}><SealTeeth bottom /></div>
          </div>
        </div>
      </AbsoluteFill>
      {label && finish > .72 && <NarrationBox kicker={label.kicker} title={label.title ?? label} sub={label.sub} delay={0} style={{ opacity: interpolate(finish, [.72, 1], [0, 1], clamp) }} />}
    </AbsoluteFill>
  );
}

export function RetroCard({ cards = [], label, kicker, title, sub }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = cards.slice(0, 5);
  const single = items.length === 1;
  const minScale = items.reduce((s, item) => Math.min(s, ((item.size?.[1] ?? 954) * 2) / 620), 1);
  const fanHeight = 620 * minScale;
  const gloss = interpolate(frame, [10, 28], [0, 1], clamp);
  const caption = typeof label === "object" ? label : { kicker, title: title ?? label, sub };
  return (
    <AbsoluteFill style={{ backgroundColor: brand.bg, overflow: "hidden" }}>
      <CoverBackdrop asset={items[0]?.asset} />
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 45%, rgba(35,94,150,.2), rgba(4,6,10,.8) 70%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", perspective: 1800, paddingBottom: caption.title || caption.kicker ? 90 : 0 }}>
        {single ? <TradingCard asset={items[0].asset} size={items[0].size} height={880} floatFrame={frame} glossProgress={frame <= 28 ? gloss : -1} /> : (
          <div style={{ position: "relative", width: fanHeight * .72, height: fanHeight }}>
            {items.map((item, i) => {
              const c = i - (items.length - 1) / 2;
              const dealt = spring({ frame: frame - i * 6, fps, durationInFrames: 18, config: { damping: 16, stiffness: 170 } });
              const angle = items.length === 2 ? c * 18 : c * (28 / Math.max(1, items.length - 1));
              return <div key={`${item.asset}-${i}`} style={{ position: "absolute", left: "50%", top: 0, transformOrigin: "50% 105%", transform: `translateX(-50%) translate(${interpolate(dealt, [0, 1], [900, c * fanHeight * .24])}px, ${interpolate(dealt, [0, 1], [180, Math.abs(c) * 22])}px) rotate(${angle * dealt}deg)`, opacity: dealt, zIndex: i }}><TradingCard asset={item.asset} size={item.size} height={fanHeight} floatFrame={frame + i * 9} glossProgress={frame >= 15 + i * 2 && frame <= 33 + i * 2 ? interpolate(frame, [15 + i * 2, 33 + i * 2], [0, 1], clamp) : -1} /></div>;
            })}
          </div>
        )}
      </AbsoluteFill>
      {(caption.title || caption.kicker) && <NarrationBox kicker={caption.kicker} title={caption.title} sub={caption.sub} />}
    </AbsoluteFill>
  );
}
