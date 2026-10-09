# Episode 002 shot plan

Every visual is pinned to a script paragraph and an **anchor phrase** (the words the cut lands on). This replaces Episode 001's timecode-first approach, where picture and narration drifted apart. When Tony's audio is transcribed, these anchors become V3 timeline anchors (`shared/anchors.js`).

- **Type** uses the existing renderer segment types (`shared/EpisodeRenderer.jsx`).
- **Assets** are filenames in `~/Desktop/episode-002-assets/covers/` (or `interiors/` when prefixed) unless marked HOST (Tony films hands-only footage) or SCREEN.
- Rule from RESEARCH.md: covers and early-issue art only. No reveal pages.

## 01-cold-open

| P | Anchor | Visual | Type | Asset |
|---|---|---|---|---|
| P1 | "If you've been following" | Slow push across a grid of the five Marvel covers | grid | fantastic-four-570-1998, new-avengers-001-2013, secret-wars-001-2015, house-of-x-001-2019, powers-of-x-001-2019 |
| P2 | "Fantastic Four." | One hard cut per title, about 1 s each, in sync with the words | cover, `transition: cut` x5 | fantastic-four-570-1998, new-avengers-001-2013, secret-wars-001-2015, house-of-x-001-2019, powers-of-x-001-2019 |
| | after P2 | Channel sting | ChannelSting | existing |

## 02-intro

| P | Anchor | Visual | Type | Asset |
|---|---|---|---|---|
| P3 | "This guy has written" | Tony's hands place his MP and EoW books beside the five Marvel covers | HOST B-roll | broll-002-pull |
| P3 | "the MCU exploring" | Hold on the five Marvel cover grid. No movie stills | grid | fantastic-four-570-1998, new-avengers-001-2013, secret-wars-001-2015, house-of-x-001-2019, powers-of-x-001-2019 |
| P4 | "here's something funny" | Hard cut to text: HERE'S SOMETHING FUNNY | quote | |
| P5 | "I've been collecting comics" | Tony's own shelf/long box, slow push | HOST B-roll | broll-002-shelf |
| P5 | "East of West and The Manhattan Projects" | Tony's hands pulling his own copies out of a box | HOST B-roll | broll-002-pull |
| P6 | "I loved the covers" | Cover grid, 4 EoW + 4 MP, lights one at a time | grid (columns 4) | east-of-west-001/002/003/004, the-manhattan-projects-001/002/003/004 |
| P6 | "sparse, mysterious" | East of West #1, slowPush | cover | east-of-west-001-2013 |
| P6 | "completely nuts" | Einstein close-up panel, slowPush | cover `focus` | interiors/mp-einstein-gateway-panel |
| P6 | "Garbage Pail Kids" | Groves-with-cigar panel, zoom on the face | cover `focus` | interiors/mp-001-groves-panel |
| P7 | "hadn't connected those books" | Pair: MP #1 and EoW #1, then Hickman credit text | pair | the-manhattan-projects-001-2012, east-of-west-001-2013 |
| P8-P9 | "So that got me thinking" | Tony's hands set the two books beside the Marvel cover grid | HOST B-roll | broll-002-pull |
| P10 | "what he did with the X-Men" | Pair: HoX #1 and Secret Wars #1 | pair | house-of-x-001-2019, secret-wars-001-2015 |
| P11 | "what I want to talk about today" | Title card over a faint wall of his creator-owned covers | title | all creator-owned #1s |

Title card text: **THE OTHER JONATHAN HICKMAN** / sub: *Creator-owned comics you might have missed*

## 03-the-marvel-guy

| P | Anchor | Visual | Type | Asset |
|---|---|---|---|---|
| P12 | "the Marvel side" | Chapter card: THE MARVEL GUY | chapter | |
| P13 | "Fantastic Four in 2009" | FF #570, slowPush | cover | fantastic-four-570-1998 |
| P13 | "Not issues. Years." | Hard cut to black, text: NOT ISSUES. YEARS. | quote | |
| P14 | "Avengers and New Avengers" | New Avengers #1, driftLeft | cover | new-avengers-001-2013 (Avengers #1 2012 still missing, optional) |
| P14 | "incursions" | Kinetic text: INCURSION, two circles colliding (motion graphic, no art) | quote | |
| P15 | "Secret Wars, in 2015" | Secret Wars #1, panDown | cover | secret-wars-001-2015 |
| P15 | "Doctor Doom" | Secret Wars #9, focus on Doom area | cover `focus` | secret-wars-009-2015 |
| P16 | "I loved Secret Wars" | Fan: SW #1 and #9 | fan | secret-wars-001, secret-wars-009 |
| P17 | "House of X and Powers of X" | Pair HoX #1 / PoX #1 | pair | house-of-x-001-2019, powers-of-x-001-2019 |
| P17 | "one issue a week for twelve weeks" | Text: 12 ISSUES · 12 WEEKS · 2019 | quote | |
| P18 | "House of X #2" | HoX #2 cover, still. Cover only, no interior | cover | house-of-x-002-2019 |
| P18 | "I was blown away" | Hold on HoX #2, then text: I WAS BLOWN AWAY | cover + quote | house-of-x-002-2019 |
| P19 | "pile of continuity" | Grid of all Marvel covers above | grid | |
| P20 | "Multiverse of Madness" | Text card only: INCURSION / Doctor Strange in the Multiverse of Madness (2022). No film stills | quote | |
| P20 | "Doomsday and Secret Wars" | Text card: AVENGERS: DOOMSDAY (Dec 2026) · AVENGERS: SECRET WARS (Dec 2027) | quote | |
| P20 | "back in 1984" | Text: SECRET WARS (1984) | quote | Optional: Secret Wars (1984) #1 cover, not yet pulled |
| P21 | "Now the books I was buying" | Whip to Tony's own MP/EoW stack | HOST B-roll | broll-002-pull |

## 04-manhattan-projects

| P | Anchor | Visual | Type | Asset |
|---|---|---|---|---|
| P22 | "The Manhattan Projects" | Chapter card over MP #1 | chapter | the-manhattan-projects-001-2012 |
| P22 | "Nick Pitarra" | Credit lower third: HICKMAN · PITARRA · BROWNE | cover with sub | |
| P23 | "the bomb was the cover story" | MP #3 ("The Bomb"), slowPush to the bomb icon | cover `focus` | the-manhattan-projects-003-2012 |
| P23 | "way, way weirder" | Torii-gate battle panel from #1, slowPush | cover | interiors/mp-001-torii-gate-battle |
| P24 | "Wernher von Braun" | von Braun robot-arm panel | cover `focus` | interiors/mp-von-braun-arm-panel |
| P24 | "Oppenheimer. Einstein." | One cover per name, cut on each word: MP #1, #20 ("Einstein the Barbarian"), #4, #5, #6, #10 | cover x6, cut | as listed |
| P25 | "a twist about Oppenheimer" | MP #1, focus on the half-red face | cover `focus` | the-manhattan-projects-001-2012 |
| P25 | "Laika" | MP #6 (Soviet red, hammer and sickle), slowPush | cover | the-manhattan-projects-006-2012 |
| P25 | "Franklin Roosevelt" | Text card: FDR, BUT AN A.I. (no interior found online; text card is the plan) | quote | |
| P26 | "draws faces like he's mad at them" | Three face panels, quick cuts | cover `focus` x3 | interiors/mp-feynman-face-panel, mp-fermi-einstein-faces, mp-001-groves-panel |
| P26 | "wax pack" | Optional: Tony holding a real GPK card if he owns one | HOST (optional) | |
| P27 | "Moebius, Geof Darrow" | Text list on halftone, no art from those artists | quote | |
| P28 | "This is my copy" | Tony's hands hold his MP issue up to the lens, face out of frame | HOST B-roll | broll-002-copy-to-lens |
| P29 | "25 issues" | Fan of MP #1, 10, 15, 20, 25 + Sun Beyond the Stars #1 | fan | listed covers |

Cover note: the MP covers have a circle badge with the solicitation text printed on them and a single icon. They're readable at 1080p. Hold each at least 2 s.

## 05-east-of-west

| P | Anchor | Visual | Type | Asset |
|---|---|---|---|---|
| P30 | "East of West" | Chapter card over EoW #1 | chapter | east-of-west-001-2013 |
| P30 | "Nick Dragotta" | Credit lower third: HICKMAN · DRAGOTTA · MARTIN · WOOTON | | |
| P31 | "the Civil War doesn't end" | Motion graphic: timeline 1865 → 1908, COMET, KANSAS | quote/timeline (new simple card) | |
| P31 | "seven nations" | Text: THE SEVEN NATIONS OF AMERICA over EoW #3 | cover | east-of-west-003-2013 |
| P32 | "2064" | Text: 2064 | quote | |
| P32 | "Four Horsemen" | Grid EoW #2, #4, #6, #15 | grid | |
| P32 | "Death has gone off script" | EoW #1, slowPush on the hatted figure | cover `focus` | east-of-west-001-2013 |
| P33 | "a prophecy called the Message" | EoW #10 | cover | east-of-west-010-2013 |
| P33 | "a hell of a group chat" | Text gag: three names stacked: LONGSTREET · RED CLOUD · MAO | quote | |
| P33 | "the Chosen" | The Chosen around their table, slowPush | cover | interiors/eow-the-chosen-table |
| P34 | tagline | Quote card with the tagline | quote | |
| P35 | "data pages in House of X" | EoW design page "How things were is not how they will always be" | cover | interiors/eow-design-page-how-things-were |
| P35 | "Dragotta's art" | Death in white with the giant revolver | cover `focus` | interiors/eow-death-in-white-panel |
| P36 | "those covers" | Slow scroll across 01-45 covers in a row | grid (6 columns) | all EoW covers |
| P37 | "East of West is finished" | EoW #45, panUp | cover | east-of-west-045-2013 |
| P37 | "Eisner nomination" | Text: 2014 EISNER NOMINEE · BEST CONTINUING SERIES | quote | |

## 06-deep-cuts

| P | Anchor | Visual | Type | Asset |
|---|---|---|---|---|
| P38 | "the list got a lot longer" | Grid of every creator-owned #1 we have | grid | 10 covers |
| P39 | "The Nightly News" | Nightly News #1, slowPush | cover | the-nightly-news-001-2007 |
| P39 | "he did all of it" | Text: WRITER · ARTIST · COLORIST · LETTERER | quote | |
| P39 | "Eisner nomination" | Nightly News #2 | cover | the-nightly-news-002-2007 |
| P40 | "graphic designer" | Pax Romana #1 page 3, "The Hidden Records" text block (no Nightly News interior found online) | cover `panDown` | interiors/pax-romana-001-p03-hidden-records |
| P41 | "Pax Romana" | Pax Romana #1, panDown, then page 1 art | cover x2 | pax-romana-001-2007, interiors/pax-romana-001-p01-constantinople |
| P41 | "the year 312" | Pax Romana #2 ("I. Constantine"), focus on the text | cover `focus` | pax-romana-002-2007 |
| P41 | "transcripts and maps" | Pax Romana #1 page 4, "Secret Vatican Archives" data boxes | cover `panDown` | interiors/pax-romana-001-p04-vatican-archives |
| P42 | "The Black Monday Murders" | BMM #1, slowPush | cover | the-black-monday-murders-001-2016 |
| P42 | "Theodore Dumas" | BMM #2 (detective in hat) | cover | the-black-monday-murders-002-2016 |
| P43 | "on hiatus since 2018" | BMM #5, desaturate slightly. Text: 8 ISSUES · NO ENDING (YET) | cover + text | the-black-monday-murders-005-2016 |
| P44 | "Transhuman. A Red Mass for Mars." | Quick cut on each title as it's said | cover x6, cut | transhuman, a-red-mass-for-mars, the-red-wing, decorum (+ Secret, Dying and the Dead missing: text-only cards) |

## 07-the-thread

| P | Anchor | Visual | Type | Asset |
|---|---|---|---|---|
| P46 | "The news media." | Each institution as a word over its book: NEWS / CHURCH / THE BOMB / AMERICA / WALL STREET | cover + kicker x5, cut | nightly-news-001, pax-romana-001, manhattan-projects-003, east-of-west-001, black-monday-murders-001 |
| P47 | "a chart that explains the rules" | Motion graphic: a simple chart that a red line breaks | quote/motion | |
| P48 | "built Krakoa" | HoX #1, slowPush | cover | house-of-x-001-2019 |
| P48 | "in his own books first" | Pair: Nightly News #1 (2006) / HoX #1 (2019), years under each | pair | |

## 08-where-to-start

| P | Anchor | Visual | Type | Asset |
|---|---|---|---|---|
| P49 | "where do you start" | Starter shelf, 5 empty slots | shelf | |
| P50 | "East of West, Volume One" | Slot 1 fills: EoW Vol. 1 TPB | shelf | east-of-west-tpb-001-2013 |
| P51 | "Science Bad" | Slot 2: MP Vol. 1 TPB | shelf | manhattan-projects-tpb-001-2012 |
| P52 | "The Nightly News" | Slot 3 | shelf | the-nightly-news-001-2007 |
| P53 | "Pax Romana" | Slot 4 | shelf | pax-romana-001-2007 |
| P54 | "Black Monday Murders" | Slot 5, with a small "UNFINISHED" tag | shelf | the-black-monday-murders-001-2016 |
| P55 | "Check your long boxes first" | Tony's hands flipping through his long box | HOST B-roll | broll-002-flip |

## 09-ending

| P | Anchor | Visual | Type | Asset |
|---|---|---|---|---|
| P56-P59 | | Overhead hands-only footage of Tony's long box and his MP and EoW issues on the desk. Hands place the books back in the box | HOST B-roll | broll-002-ending-long-box |
| | end | End card, right half clear for YouTube end screens | end | |

## Optional ComixCatalog beat
None in the narration, on purpose. The pinned comment links the five starter books on ComixCatalog. If Tony wants one, a 3 s SCREEN shot of the East of West series page fits P37 ("East of West is finished") with no added words. **Fix the duplicate series rows first** (RESEARCH.md, catalog notes).
