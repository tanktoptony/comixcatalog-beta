// YouTube thumbnails for Episode 008, "The Nice House on the Lake".
// Comic-page kit (shared/components/comicPage.jsx), same as Ep 007: cream
// episode page with gold captions and the navy bar; black One-Shot page for
// the Shorts. Every image is art the video itself uses (episode-008/timeline.js,
// shorts-timeline.js). Captions are lines from Tony's script or the Shorts he
// OKed, or plain facts; no invented dialogue. No spoiler art (Lake #1 to #8
// interiors and covers only).

import React from "react";
import { Caption, CornerBar, Panel, Paper, art, useComicFonts } from "../shared/components/comicPage.jsx";

const EP = "episode-008";
const A = {
  title: ["art/lake-01/cw09-the-nice-house-on-the-lake-1-8.jpg", 2600, 1999], // the lit house, up and right
  email: ["art/lake-01/cw08-the-nice-house-on-the-lake-1-7.jpg", 1691, 2600],
  guests: ["art/lake-06/cw07-the-nice-house-on-the-lake-6-6.jpg", 2600, 1999],
  deluxe: ["covers/lake-deluxe.jpg", 900, 1230],
  l1: ["covers/lake-01.jpg", 900, 1384],
  l3: ["covers/lake-03.jpg", 900, 1384],
  l5: ["covers/lake-05.jpg", 900, 1384],
  l6: ["covers/lake-06.jpg", 900, 1403],
  l7: ["covers/lake-07.jpg", 1200, 1845],
  tynion: ["photos/tynion-gage-skidmore-2018.jpg", 1920, 1280],
};
const img = (k) => art(EP, A[k]);
const HOUSE = [0.74, 0.21];
const WALTER = [0.47, 0.36];
const ROW = 0.125; // the symbol row, 12.5% down a main cover
const bar = { title: "The Nice House on the Lake", sub: "ComixCatalog Originals" };
const shortBar = { title: "One-Shot", sub: "Nice House · ComixCatalog" };
const VERTICAL = { width: 1080, height: 1920 };

// A: the lit house and Walter, with Tony's "one small complication" line.
export function Thumb008Invite() {
  useComicFonts();
  return <Paper>
    <Panel points={[[16, 16], [800, 16], [740, 704], [16, 704]]} image={img("title")} focus={HOUSE} zoom={1.9} />
    <Panel points={[[814, 16], [1264, 16], [1264, 704], [754, 704]]} image={img("deluxe")} focus={WALTER} zoom={1.7} />
    <Caption lines={["There's just one", "small complication."]} size={82} rotate={-2} pos={{ left: 44, bottom: 46 }} />
    <CornerBar {...bar} pos={{ left: 30, top: 30 }} />
  </Paper>;
}

// B: Walter, big, and his invitation email.
export function Thumb008Walter() {
  useComicFonts();
  return <Paper>
    <Panel points={[[16, 16], [860, 16], [800, 704], [16, 704]]} image={img("deluxe")} focus={[0.47, 0.44]} zoom={1.9} />
    <Panel points={[[874, 16], [1264, 16], [1264, 704], [814, 704]]} image={img("email")} focus={[0.62, 0.2]} zoom={1.5} />
    <Caption lines={["Why Walter?"]} size={120} rotate={-3} pos={{ left: 60, bottom: 50 }} />
    <CornerBar {...bar} pos={{ left: 30, top: 30 }} />
  </Paper>;
}

// C: the symbol rows, Books One, Three and Seven, beside the Book Seven cover.
export function Thumb008Symbols() {
  useComicFonts();
  return <Paper>
    <Panel points={[[16, 16], [820, 16], [820, 240], [16, 240]]} image={img("l1")} focus={[0.5, ROW]} zoom={1.25} />
    <Panel points={[[16, 254], [820, 254], [820, 478], [16, 478]]} image={img("l3")} focus={[0.5, ROW]} zoom={1.25} />
    <Panel points={[[16, 492], [820, 492], [820, 704], [16, 704]]} image={img("l7")} focus={[0.5, ROW]} zoom={1.25} />
    <Panel points={[[834, 16], [1264, 16], [1264, 704], [834, 704]]} image={img("l7")} focus={[0.5, 0.55]} />
    <Caption lines={["Take a look", "at the covers."]} size={84} rotate={-3} pos={{ right: 60, bottom: 60 }} />
    <Caption lines={["Ten symbols · ten guests"]} size={40} note rotate={2} pos={{ left: 470, top: 40 }} />
    <CornerBar {...bar} pos={{ left: 30, top: 30 }} />
  </Paper>;
}

// Shorts, 1080x1920, black One-Shot page. Words in the middle third, clear of
// YouTube's bottom overlay.
export function Short008SymbolsThumb() {
  useComicFonts();
  return <Paper theme="short">
    <Panel points={[[24, 24], [1056, 24], [1056, 1060], [24, 1120]]} image={img("l1")} focus={[0.5, 0.3]} />
    <Panel points={[[24, 1136], [1056, 1076], [1056, 1480], [24, 1500]]} image={img("l3")} focus={[0.36, ROW]} zoom={2} />
    <Panel points={[[24, 1516], [1056, 1496], [1056, 1896], [24, 1896]]} image={img("l7")} focus={[0.6, ROW]} zoom={2} />
    <Caption lines={["Ten symbols.", "Ten guests."]} size={140} rotate={-5} pos={{ left: 56, top: 720 }} />
    <CornerBar {...shortBar} pos={{ left: 48, top: 48 }} scale={1.35} />
  </Paper>;
}

export function Short008LakeHouseThumb() {
  useComicFonts();
  return <Paper theme="short">
    <Panel points={[[24, 24], [1056, 24], [1056, 1060], [24, 1120]]} image={img("title")} focus={HOUSE} zoom={1.3} />
    <Panel points={[[24, 1136], [1056, 1076], [1056, 1896], [24, 1896]]} image={img("l5")} focus={[0.5, 0.4]} />
    <Caption lines={["Then the world", "outside ends."]} size={132} rotate={-5} pos={{ left: 56, top: 720 }} />
    <CornerBar {...shortBar} pos={{ left: 48, top: 48 }} scale={1.35} />
  </Paper>;
}

export function Short008VillainThumb() {
  useComicFonts();
  return <Paper theme="short">
    <Panel points={[[24, 24], [1056, 24], [1056, 1060], [24, 1120]]} image={img("deluxe")} focus={WALTER} zoom={1.4} />
    <Panel points={[[24, 1136], [1056, 1076], [1056, 1896], [24, 1896]]} image={img("tynion")} focus={[0.62, 0.4]} />
    <Caption lines={["The villain", "is the writer."]} size={136} rotate={-5} pos={{ left: 56, top: 720 }} />
    <Caption lines={["Walter · James Tynion IV"]} size={52} note rotate={2} pos={{ right: 50, top: 1200 }} />
    <Caption lines={["Photo: Gage Skidmore, CC BY-SA 2.0"]} size={30} note rotate={0} pos={{ right: 50, top: 1300 }} />
    <CornerBar {...shortBar} pos={{ left: 48, top: 48 }} scale={1.35} />
  </Paper>;
}

export const THUMBNAILS_008 = [
  ["Thumb008Invite", Thumb008Invite], ["Thumb008Walter", Thumb008Walter], ["Thumb008Symbols", Thumb008Symbols],
  ["Short008SymbolsThumb", Short008SymbolsThumb, VERTICAL], ["Short008LakeHouseThumb", Short008LakeHouseThumb, VERTICAL], ["Short008VillainThumb", Short008VillainThumb, VERTICAL],
];
