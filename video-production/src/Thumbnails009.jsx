// YouTube thumbnails for Episode 009, "The Amory Wars Part 3: In Keeping
// Secrets of Silent Earth: 3". Comic-page kit (shared/components/comicPage.jsx),
// same as Ep 005 to 008: cream episode page with gold captions and the navy bar;
// black One-Shot page for the Shorts. Every image is art the video uses
// (episode-009/timeline.js, shorts-timeline.js). Captions are album lyrics,
// lines from Tony's script/Shorts, or plain facts. Names only on art that is
// that character: Al = forehead brain window (#1 convention cover, #8 cover);
// #9 C2E2 cover = Claudio and Apollo outside Newo's house.

import React from "react";
import { Caption, CornerBar, Panel, Paper, art, useComicFonts } from "../shared/components/comicPage.jsx";

const EP = "episode-009";
const A = {
  album: ["albums/2003-in-keeping-secrets-of-silent-earth-3.jpg", 900, 900],
  poster: ["lore/poster-neverender-iksse-2014.jpg", 1957, 2600], // the IKSSE:3 earth-in-clouds art; the album cover is mostly dark sky in a panel
  i8: ["covers/iksse-08.jpg", 975, 1500], // Al bottom left (forehead window)
  i1: ["covers/iksse-01.jpg", 650, 1000],
  con1: ["covers/iksse-01-v01.jpg", 650, 1000], // Al the Killer, "Convention exclusive limited to 500"
  i4: ["covers/iksse-04.jpg", 900, 1385], // Claudio at the Faint of Hearts card table
  i5: ["covers/iksse-05.jpg", 400, 600], // Chase among the Red Army
  c2e2: ["covers/iksse-09-v.jpg", 651, 1000], // Claudio and Apollo, "C2E2 exclusive limited to 300"
  back: ["lore/iksse-back.jpg", 599, 529],
  cd: ["lore/iksse-cd.jpg", 599, 606],
};
const img = (k) => art(EP, A[k]);
const AL_FACE = [0.55, 0.44];
const CLAUDIO_APOLLO = [0.4, 0.76]; // keeps Apollo (bottom left) in frame
const EARTH = [0.5, 0.45];
const bar = { title: "The Amory Wars · Part 3", sub: "ComixCatalog Originals" };
const shortBar = { title: "One-Shot", sub: "The Amory Wars · ComixCatalog" };
const VERTICAL = { width: 1080, height: 1920 };

// A (lead): the album beside the comic's opening scene, with the album's first line.
export function Thumb009Apollo() {
  useComicFonts();
  return <Paper>
    <Panel points={[[16, 16], [560, 16], [520, 704], [16, 704]]} image={img("poster")} focus={EARTH} zoom={1.3} />
    <Panel points={[[574, 16], [1264, 16], [1264, 704], [534, 704]]} image={img("c2e2")} focus={CLAUDIO_APOLLO} zoom={1.35} />
    <Caption lines={["Hello Apollo,", "where should I begin?"]} size={74} rotate={-2} pos={{ left: 40, bottom: 44 }} />
    <CornerBar {...bar} pos={{ left: 30, top: 30 }} />
  </Paper>;
}

// B: Al the Killer, big, with the Backend of Forever chorus.
export function Thumb009Al() {
  useComicFonts();
  return <Paper>
    <Panel points={[[16, 16], [860, 16], [800, 704], [16, 704]]} image={img("con1")} focus={AL_FACE} zoom={1.6} />
    <Panel points={[[874, 16], [1264, 16], [1264, 704], [814, 704]]} image={img("i8")} focus={[0.225, 0.6]} zoom={2.2} />
    <Caption lines={["This isn't love."]} size={112} rotate={-3} pos={{ left: 50, bottom: 50 }} />
    <Caption lines={["Al the Killer"]} size={44} note rotate={2} pos={{ right: 40, top: 40 }} />
    <CornerBar {...bar} pos={{ left: 30, top: 30 }} />
  </Paper>;
}

// C: three songs, three moments: Claudio at the Faint of Hearts, Chase, Al.
export function Thumb009Songs() {
  useComicFonts();
  return <Paper>
    <Panel points={[[16, 16], [440, 16], [420, 704], [16, 704]]} image={img("i4")} focus={[0.48, 0.42]} zoom={2.4} />
    <Panel points={[[454, 16], [850, 16], [830, 704], [434, 704]]} image={img("i5")} focus={[0.47, 0.66]} zoom={1.8} />
    <Panel points={[[864, 16], [1264, 16], [1264, 704], [844, 704]]} image={img("con1")} focus={AL_FACE} zoom={1.5} />
    <Caption lines={["The lyrics vs.", "the comic"]} size={96} rotate={-3} pos={{ left: 40, bottom: 46 }} />
    <CornerBar {...bar} pos={{ left: 30, top: 30 }} />
  </Paper>;
}

// Shorts, 1080x1920, black One-Shot page. Words in the middle third, clear of
// YouTube's bottom overlay.
export function Short009HiddenTrackThumb() {
  useComicFonts();
  return <Paper theme="short">
    <Panel points={[[24, 24], [1056, 24], [1056, 1060], [24, 1120]]} image={img("poster")} focus={EARTH} />
    <Panel points={[[24, 1136], [1056, 1076], [1056, 1896], [24, 1896]]} image={img("back")} focus={[0.36, 0.45]} zoom={1.05} />
    <Caption lines={["Eleven tracks", "of nothing."]} size={136} rotate={-5} pos={{ left: 56, top: 720 }} />
    <Caption lines={["Then track 23."]} size={72} note rotate={2} pos={{ right: 50, top: 1220 }} />
    <CornerBar {...shortBar} pos={{ left: 48, top: 48 }} scale={1.35} />
  </Paper>;
}

export function Short009HelloApolloThumb() {
  useComicFonts();
  return <Paper theme="short">
    <Panel points={[[24, 24], [1056, 24], [1056, 1060], [24, 1120]]} image={img("c2e2")} focus={CLAUDIO_APOLLO} zoom={1.2} />
    <Panel points={[[24, 1136], [1056, 1076], [1056, 1896], [24, 1896]]} image={img("poster")} focus={EARTH} />
    <Caption lines={["Hello Apollo."]} size={140} rotate={-5} pos={{ left: 56, top: 520 }} />
    <Caption lines={["Same first line.", "Album and comic."]} size={60} note rotate={2} pos={{ right: 50, top: 1240 }} />
    <CornerBar {...shortBar} pos={{ left: 48, top: 48 }} scale={1.35} />
  </Paper>;
}

export function Short009ExclusivesThumb() {
  useComicFonts();
  return <Paper theme="short">
    <Panel points={[[24, 24], [1056, 24], [1056, 1060], [24, 1120]]} image={img("c2e2")} focus={[0.45, 0.72]} />
    <Panel points={[[24, 1136], [1056, 1076], [1056, 1896], [24, 1896]]} image={img("con1")} focus={AL_FACE} zoom={1.3} />
    <Caption lines={["Limited", "to 300."]} size={150} rotate={-5} pos={{ right: 56, top: 380 }} />
    <Caption lines={["Do you own one?"]} size={64} note rotate={2} pos={{ right: 50, top: 1240 }} />
    <CornerBar {...shortBar} pos={{ left: 48, top: 48 }} scale={1.35} />
  </Paper>;
}

export const THUMBNAILS_009 = [
  ["Thumb009Apollo", Thumb009Apollo], ["Thumb009Al", Thumb009Al], ["Thumb009Songs", Thumb009Songs],
  ["Short009HiddenTrackThumb", Short009HiddenTrackThumb, VERTICAL], ["Short009HelloApolloThumb", Short009HelloApolloThumb, VERTICAL], ["Short009ExclusivesThumb", Short009ExclusivesThumb, VERTICAL],
];
