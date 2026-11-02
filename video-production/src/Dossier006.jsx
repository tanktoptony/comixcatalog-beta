import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { DOSSIER_001 } from "../episode-006/dossier-001.js";
import { DossierBack, DossierCard, DossierFront, DOSSIER_THEMES } from "../shared/components/dossier.jsx";
import { Backdrop, EpisodeContext, Halftone } from "../shared/components/primitives.jsx";

const EPISODE = "episode-006";

function Stage({ children, transparent = false }) {
  return <EpisodeContext.Provider value={{ episodeId: EPISODE }}>
    {transparent ? children : <Backdrop field="#101713" tint={DOSSIER_THEMES.doom.green} glow={.48}><Halftone opacity={.045} size={11} />{children}</Backdrop>}
  </EpisodeContext.Provider>;
}

export function Dossier001Reveal() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slam = spring({ frame, fps, durationInFrames: 17, config: { damping: 11, stiffness: 190, mass: .8 } });
  const y = interpolate(slam, [0, 1], [-1250, 0]);
  const rotate = interpolate(slam, [0, 1], [-7, -2]);
  const flip = interpolate(frame, [54, 72], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const meters = interpolate(frame, [72, 120], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const badge = interpolate(frame, [112, 132], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const flash = frame >= 15 && frame < 17 ? .82 : 0;
  return <Stage>
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}><div style={{ transform: `translateY(${y}px) rotate(${rotate}deg)` }}><DossierCard data={DOSSIER_001} flip={flip} meterProgress={meters} badgeProgress={badge} height={930} /></div></AbsoluteFill>
    <AbsoluteFill style={{ background: "white", opacity: flash }} />
  </Stage>;
}

export function Dossier001Cosmic({ overlay = "cosmic" }) {
  const frame = useCurrentFrame();
  const amountIn = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const amountOut = interpolate(frame, [96, 119], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <Stage><AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}><DossierCard data={DOSSIER_001} flip={1} overlay={overlay} overlayAmount={Math.min(amountIn, amountOut)} meterProgress={1} badgeProgress={1} height={930} /></AbsoluteFill></Stage>;
}

const frontLayers = {
  frame: { frame: true }, art: { art: true }, lettering: { lettering: true },
};
const backLayers = {
  frame: { frame: true }, meters: { meters: true }, lettering: { lettering: true },
};

// `art` (inputProps) previews another cover in the art window: --props='{"art":{...}}'.
export function Dossier001Front({ art }) { return <Stage transparent><DossierFront data={art ? { ...DOSSIER_001, art } : DOSSIER_001} /></Stage>; }
export function Dossier001Back() { return <Stage transparent><DossierBack data={DOSSIER_001} meterProgress={1} badgeProgress={1} /></Stage>; }
export function Dossier001FrontFrame() { return <Stage transparent><DossierFront data={DOSSIER_001} layers={frontLayers.frame} /></Stage>; }
export function Dossier001FrontArt() { return <Stage transparent><DossierFront data={DOSSIER_001} layers={frontLayers.art} /></Stage>; }
export function Dossier001FrontLettering() { return <Stage transparent><DossierFront data={DOSSIER_001} layers={frontLayers.lettering} /></Stage>; }
export function Dossier001BackFrame() { return <Stage transparent><DossierBack data={DOSSIER_001} layers={backLayers.frame} /></Stage>; }
export function Dossier001BackMeters() { return <Stage transparent><DossierBack data={DOSSIER_001} layers={backLayers.meters} meterProgress={1} /></Stage>; }
export function Dossier001BackLettering() { return <Stage transparent><DossierBack data={DOSSIER_001} layers={backLayers.lettering} badgeProgress={1} /></Stage>; }
