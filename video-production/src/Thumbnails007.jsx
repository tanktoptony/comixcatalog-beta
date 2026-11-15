// YouTube thumbnails for Episode 007, "Every Generation Has Its Own Batman".
// Comic-page kit (shared/components/comicPage.jsx): real art in panels, the
// brand as one corner bar. Episode pages are cream; Shorts are the black
// "One-Shot" page. Every image here is art the video itself uses for that
// character (episode-007/timeline.js), so the names on it are earned.
// Captions carry facts or Tony's own lines, never invented dialogue.

import React from "react";
import { Caption, CornerBar, Panel, Paper, art, useComicFonts } from "../shared/components/comicPage.jsx";

const EP = "episode-007";
const A = {
  azbatsRed: ["art/azrael-gallery/Batman_Jean-Paul_Valley_0006.jpg", 1000, 1522],
  azbatsDescent: ["art/batman-500/Batman_Jean-Paul_Valley_0011.jpg", 1687, 2562, 0.1],
  azOriginal: ["art/azrael-gallery/Azrael_Jean-Paul_Valley_0018.jpg", 504, 705],
  absBatman: ["art/absolute-batman-1/Absolute_Batman_Vol_1_1_Textless.jpg", 1200, 1822],
  owls: ["art/court-of-owls/Court_of_Owls_008.jpg", 569, 864],
  owlsTower: ["art/court-of-owls/Court_of_Owls_006.jpg", 900, 1390],
  maze: ["art/batman-2011-5/Batman_Vol_2_5_Alternate.jpg", 1280, 1966, 0.3],
  eddie: ["art/absolute-nygma/Eddie_Absolute_Universe_004.jpg", 1485, 885],
  harvey: ["art/absolute-dent/Absolute_Batman_Vol_1_21_Textless.jpg", 1086, 1654],
  ozzie: ["art/absolute-cobblepot/Absolute_Batman_Vol_1_21_Textless_Dragotta_Variant.jpg", 1200, 1812],
  waylon: ["art/absolute-jones/Absolute_Batman_Vol_1_12_Textless.jpg", 1200, 1822],
};
const img = (k) => art(EP, A[k]);
const bar = { title: "Batman · 1986 to now", sub: "ComixCatalog Originals" };
const shortBar = { title: "One-Shot", sub: "Batman · ComixCatalog" };
const VERTICAL = { width: 1080, height: 1920 };

// A: then vs. now, armored Azrael against Absolute Batman (the handoff's pick).
export function Thumb007ThenNow() {
  useComicFonts();
  return <Paper>
    <Panel points={[[16, 16], [668, 16], [612, 704], [16, 704]]} image={img("azbatsRed")} focus={[0.5, 0.3]} />
    <Panel points={[[682, 16], [1264, 16], [1264, 704], [626, 704]]} image={img("absBatman")} focus={[0.5, 0.3]} />
    <Caption lines={["1993"]} size={70} note rotate={-3} pos={{ left: 40, top: 120 }} />
    <Caption lines={["2024"]} size={70} note rotate={3} pos={{ right: 40, top: 120 }} />
    <Caption lines={["Which Batman", "was yours?"]} size={96} rotate={-2} pos={{ left: 380, bottom: 40 }} />
    <CornerBar {...bar} pos={{ left: 30, top: 30 }} />
  </Paper>;
}

// B: the armored Batman splash, with Tony's own line.
export function Thumb007DrewHim() {
  useComicFonts();
  return <Paper>
    <Panel points={[[16, 16], [1264, 16], [1264, 704], [16, 704]]} image={img("azbatsDescent")} focus={[0.5, 0.36]} zoom={1.05} />
    <Panel points={[[40, 300], [330, 286], [342, 690], [50, 700]]} image={img("azOriginal")} focus={[0.5, 0.4]} />
    <Caption lines={["I drew this guy", "constantly."]} size={92} rotate={-3} pos={{ right: 36, bottom: 44 }} />
    <CornerBar {...bar} pos={{ left: 30, top: 30 }} />
  </Paper>;
}

// C: Absolute Batman's childhood friends, four panels.
export function Thumb007Friends() {
  useComicFonts();
  return <Paper>
    <Panel points={[[16, 16], [330, 16], [318, 704], [16, 704]]} image={img("eddie")} focus={[0.6, 0.3]} zoom={1.25} />
    <Panel points={[[344, 16], [640, 16], [632, 704], [332, 704]]} image={img("harvey")} focus={[0.55, 0.2]} />
    <Panel points={[[654, 16], [952, 16], [948, 704], [646, 704]]} image={img("ozzie")} focus={[0.58, 0.3]} />
    <Panel points={[[966, 16], [1264, 16], [1264, 704], [962, 704]]} image={img("waylon")} focus={[0.7, 0.75]} />
    <Caption lines={["Bruce's", "childhood friends"]} size={88} rotate={-2} pos={{ left: 120, top: 360 }} />
    <Caption lines={["Riddler · Two-Face · Penguin · Killer Croc"]} size={40} note rotate={1.5} pos={{ right: 40, bottom: 40 }} />
    <CornerBar {...bar} pos={{ left: 30, top: 30 }} />
  </Paper>;
}

// Shorts, 1080x1920, black One-Shot page. Words in the middle third, clear of
// YouTube's bottom overlay.
export function Short007AzraelThumb() {
  useComicFonts();
  return <Paper theme="short">
    <Panel points={[[24, 24], [1056, 24], [1056, 1060], [24, 1120]]} image={img("azbatsRed")} focus={[0.5, 0.3]} />
    <Panel points={[[24, 1136], [1056, 1076], [1056, 1896], [24, 1896]]} image={img("azbatsDescent")} focus={[0.5, 0.4]} />
    <Caption lines={["Batman got", "replaced", "in the 90s"]} size={140} rotate={-5} pos={{ left: 56, top: 720 }} />
    <CornerBar {...shortBar} pos={{ left: 48, top: 48 }} scale={1.35} />
  </Paper>;
}

export function Short007CourtOfOwlsThumb() {
  useComicFonts();
  return <Paper theme="short">
    <Panel points={[[24, 24], [1056, 24], [1056, 1060], [24, 1120]]} image={img("owls")} focus={[0.5, 0.35]} />
    <Panel points={[[24, 1136], [1056, 1076], [1056, 1896], [24, 1896]]} image={img("maze")} focus={[0.5, 0.5]} />
    <Caption lines={["Batman didn't", "know his", "own city"]} size={136} rotate={-5} pos={{ left: 56, top: 720 }} />
    <CornerBar {...shortBar} pos={{ left: 48, top: 48 }} scale={1.35} />
  </Paper>;
}

export function Short007AbsoluteFriendsThumb() {
  useComicFonts();
  return <Paper theme="short">
    <Panel points={[[24, 24], [532, 24], [532, 940], [24, 940]]} image={img("eddie")} focus={[0.6, 0.3]} zoom={1.25} />
    <Panel points={[[548, 24], [1056, 24], [1056, 940], [548, 940]]} image={img("harvey")} focus={[0.55, 0.2]} />
    <Panel points={[[24, 956], [532, 956], [532, 1896], [24, 1896]]} image={img("ozzie")} focus={[0.58, 0.3]} />
    <Panel points={[[548, 956], [1056, 956], [1056, 1896], [548, 1896]]} image={img("waylon")} focus={[0.7, 0.75]} />
    <Caption lines={["His friends", "are his", "enemies"]} size={140} rotate={-5} pos={{ left: 70, top: 700 }} />
    <Caption lines={["Riddler · Two-Face", "Penguin · Killer Croc"]} size={58} note rotate={2} pos={{ right: 50, top: 1240 }} />
    <CornerBar {...shortBar} pos={{ left: 48, top: 48 }} scale={1.35} />
  </Paper>;
}

export const THUMBNAILS_007 = [
  ["Thumb007ThenNow", Thumb007ThenNow], ["Thumb007DrewHim", Thumb007DrewHim], ["Thumb007Friends", Thumb007Friends],
  ["Short007AzraelThumb", Short007AzraelThumb, VERTICAL], ["Short007CourtOfOwlsThumb", Short007CourtOfOwlsThumb, VERTICAL], ["Short007AbsoluteFriendsThumb", Short007AbsoluteFriendsThumb, VERTICAL],
];
