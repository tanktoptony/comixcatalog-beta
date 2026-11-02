// The Power Index · Power Profile #001: Doctor Doom (channel episode 006).
// Narration: Tony's HeyGen clone, one file per script section, laid out by
// build_audio.py (VOICE_PROGRAM.wav); words in narration.words.js are on the
// program clock. Every shot is tied to the line it illustrates (SCRIPT.md SHOW
// lines). Real covers (ComicVine), Marvel.com's own Doom profile (ads blanked,
// labeled with its address), live ComixCatalog pages, and the Power Profile
// card (shared/components/dossier.jsx: slam-in, flip, meters, A/B/C context,
// temporary-power overlays). No text-only cards: captions sit on art.

import words from "./narration.words.js";
import plan from "./audio-plan.json" with { type: "json" };
import config from "./episode.json" with { type: "json" };
import { resolveAnchors } from "../shared/anchors.js";

const LEAD = 0.12;
export const narrationWords = words.words;
export const stingGap = plan.sting;

const c = (name) => `covers/${name}.jpg`;
const C = {
  ff5: c("fantastic-four-005-1962"), ff10: c("fantastic-four-010-1963"), ff40: c("fantastic-four-040-1965"),
  ff57: c("fantastic-four-057-1966"), ff58: c("fantastic-four-058-1967"), ff59: c("fantastic-four-059-1967"), ff60: c("fantastic-four-060-1967"),
  ff84: c("fantastic-four-084-1969"), ff85: c("fantastic-four-085-1969"), ff86: c("fantastic-four-086-1969"), ff87: c("fantastic-four-087-1969"),
  ffa2: c("fantastic-four-annual-002-1964"),
  bod1: c("books-of-doom-001-2006"), bod2: c("books-of-doom-002-2006"), bod3: c("books-of-doom-003-2006"),
  bod4: c("books-of-doom-004-2006"), bod5: c("books-of-doom-005-2006"), bod6: c("books-of-doom-006-2006"),
  bodTpb: c("doctor-doom-books-of-doom-tpb-001-2025"), tt: c("triumph-and-torment-001-1989"), mgn27: c("marvel-graphic-novel-027-1987"),
  iim1: c("infamous-iron-man-001-2016"), dd2019: c("doctor-doom-001-2019"), doom24: c("doom-001-2024"),
  owud1: c("one-world-under-doom-001-2025"), ffv68: c("fantastic-four-v3-068-2003"), bh4: c("blood-hunt-004-2024"), bh5: c("blood-hunt-005-2024"),
  sw1: c("secret-wars-001-1984"), sw8: c("secret-wars-008-1984"), sw9: c("secret-wars-009-1984"), sw10: c("secret-wars-010-1984"), sw11: c("secret-wars-011-1984"), sw12: c("secret-wars-012-1984"),
  s1: c("secret-wars-001-2015"), s2: c("secret-wars-002-2015"), s3: c("secret-wars-003-2015"), s4: c("secret-wars-004-2015"), s5: c("secret-wars-005-2015"),
  s6: c("secret-wars-006-2015"), s7: c("secret-wars-007-2015"), s8: c("secret-wars-008-2015"), s9: c("secret-wars-009-2015"),
};
const BOD = [C.bod1, C.bod2, C.bod3, C.bod4, C.bod5, C.bod6];
const FF_SURFER = [C.ff57, C.ff58, C.ff59, C.ff60];
const LATVERIA = [C.ff84, C.ff85, C.ff86, C.ff87];
const SW15 = [C.s1, C.s2, C.s3, C.s4, C.s5, C.s6, C.s7, C.s8];
// Fans stack the last item on top.
const ESSENTIALS = [C.s1, C.ff57, C.tt, C.bodTpb, C.ff5];

const cut = { transitionIn: "cut" };
const cover = (asset, extra = {}) => ({ type: "cover", asset, treatment: "slowPush", ...cut, ...extra });
const pull = (asset, extra = {}) => cover(asset, { treatment: "slowPull", ...extra });
// zoomTo starts on the subject's band (not the cover's middle) and eases in. Every target was checked on a crop sheet.
const focus = (asset, x, y, zoom, extra = {}) => cover(asset, { treatment: "zoomTo", focus: { x, y, zoom }, ...extra });
const cap = (asset, title, sub, kicker, extra = {}) => cover(asset, { title, ...(sub ? { sub } : {}), ...(kicker ? { kicker } : {}), ...extra });
const grid = (assets, extra = {}) => ({ type: "grid", assets, columns: Math.min(assets.length, 6), ...cut, ...extra });
const fan = (assets, extra = {}) => ({ type: "fan", assets, ...cut, ...extra });
const pair = (a, la, b, lb, extra = {}) => ({ type: "pair", assets: [{ asset: a, label: la }, { asset: b, label: lb }], ...cut, ...extra });
// Marvel.com's Doom page (captured 2026-10-26, ads blanked) and live ComixCatalog pages.
const MARVEL = "marvel.com/characters/doctor-doom-victor-von-doom/in-comics";
const marvel = (asset, x, y, zoom, title, extra = {}) => ({ type: "screen", asset: `screens/${asset}.png`, treatment: "push", url: MARVEL, focus: { x, y }, zoom, centerFocus: true, ...(title ? { title } : {}), ...cut, ...extra });
const site = (asset, x, y, zoom, title, extra = {}) => ({ type: "screen", asset: `screens/${asset}.png`, treatment: "push", focus: { x, y }, zoom, centerFocus: true, ...(title ? { title } : {}), ...cut, ...extra });
// The Power Profile card. Back by default; see DossierReveal for the options.
const card = (extra = {}) => ({ type: "dossier", card: "dossier-001", side: "back", ...cut, ...extra });
const front = (extra = {}) => card({ side: "front", ...extra });
const CARD_BACK = { label: "CARD BACK" };

const CUES = [
  // ── 01 Cold open ──────────────────────────────────────────────────────────
  ["Doctor Doom looks like a guy whose superpower", focus(C.ff57, 0.5, 0.78, 1.5, { transitionIn: "fade", fadeIn: 14 })],
  ["And sure That's part of it", cover(C.doom24)],
  ["one of the smartest people in Marvel Comics", cover(C.ff10)],
  ["He's a sorcerer who's held the title", cover(C.tt)],
  ["He runs his own country", focus(C.ff84, 0.55, 0.5, 1.35)],
  ["he's walked off with power that belonged", focus(C.ff58, 0.6, 0.3, 1.3)],
  ["So how powerful is Doctor Doom on a normal day", cover(C.dd2019)],
  ["What changes when he's had time to plan", focus(C.mgn27, 0.5, 0.3, 1.5)],
  ["which Doom comics are actually worth putting", fan(ESSENTIALS)],
  ["Let's open the card", front({ slam: true })],

  // ── 02 How the card works ─────────────────────────────────────────────────
  ["I'm Tony this is ComixCatalog", cap(C.ff57, "Power Profile #001: Doctor Doom", undefined, "ComixCatalog · The Power Index", { treatment: "zoomTo", focus: { x: 0.5, y: 0.7, zoom: 1.25 } })],
  ["If you were a kid in the early nineties", front()],
  ["And on the back power ratings", front({ flipAt: 0.4, fillAt: 1.0 })],
  ["That's what this is Our own card", card({ push: false })],
  ["I had a stack of these", card({ push: false })],
  ["Here's how the card works", front()],
  ["The back has six stats", front({ flipAt: 0.2, fillAt: 0.8 })],
  ["And those aren't my numbers", marvel("marvel-grid", 0.5, 0.1, 1.6, "Marvel's official power grid")],
  ["Marvel's own profile for Doom has an official power grid", marvel("marvel-hero", 0.35, 0.3, 1.25)],
  ["and that's what's on the card", card()],
  ["Then there's a seventh badge", card({ highlight: "sorcery", fillAt: 0 })],
  ["Marvel's grid doesn't rate magic", cover(C.tt)],
  ["So it's labeled as our call", card({ highlight: "sorcery" })],
  ["One more thing A bar from one to seven", card({ push: false })],
  ["Or whose power they borrowed this week", cover(C.sw10)],
  ["With Doom that's most of the story", cover(C.s1)],
  ["So every Power Profile looks at three versions", card()],
  ["A Standard The guy in the armor", card({ context: "A" })],
  ["B With a plan", card({ context: "B" })],
  ["C Borrowed power", card({ context: "C", overlay: "cosmic" })],
  ["The card only rates A", card({ context: "A" })],
  // 02b, the optional Avengers: Doomsday line
  ["Robert Downey Jr plays Doom", cap(C.doom24, "Avengers: Doomsday", "In theaters December 18, 2026", "The movie")],
  ["This is the comics version", fan([C.doom24, C.s1, C.sw11, C.ff57, C.ff5])],

  // ── 03 The man in the mask ────────────────────────────────────────────────
  ["Doctor Doom first shows up in Fantastic Four 5", cap(C.ff5, "Fantastic Four #5", "July 1962 · Stan Lee and Jack Kirby", "First appearance")],
  ["And his first move is a big one", focus(C.ff5, 0.5, 0.45, 1.45)],
  ["holds Sue Storm hostage", focus(C.ff5, 0.3, 0.5, 1.6)],
  ["back in time to steal Blackbeard's treasure", focus(C.ffa2, 0.5, 0.4, 1.3)],
  ["Ben ends up captain of a pirate ship", cover(C.ffa2)],
  ["And Reed brings Doom back a chest full of chains", pull(C.ff5)],
  ["That's his first issue", focus(C.ff5, 0.5, 0.3, 1.3)],
  ["His real name is Victor von Doom", cap(C.bod1, "Victor von Doom", "Latveria", "Books of Doom #1 · 2006")],
  ["He's born in the small kingdom of Latveria", focus(C.ff84, 0.5, 0.6, 1.3)],
  ["His mother dealt in magic", cover(C.bod2)],
  ["Her magic is where Victor starts learning", focus(C.bod1, 0.5, 0.25, 1.3)],
  ["Remember the mom She comes back", pull(C.bod2)],
  ["He's brilliant He gets a scholarship", cover(C.bod3)],
  ["That goes about how you'd think", marvel("marvel-bane", 0.33, 0.32, 1.9)],
  ["Victor builds a machine to reach other dimensions", cap(C.ffa2, "\"The Fantastic Origin of Doctor Doom!\"", "Fantastic Four Annual #2 · 1964", "His first origin story")],
  ["He gets expelled", focus(C.ffa2, 0.5, 0.5, 1.4)],
  ["So he goes to Tibet", cover(C.bod4)],
  ["Then he goes home overthrows the king", cover(C.bod6)],
  ["renames the capital Doomstadt", focus(C.ff84, 0.55, 0.42, 1.55)],
  ["Which tells you a lot about the guy", cover(C.dd2019)],
  ["The face The comics have told that one", focus(C.ff86, 0.5, 0.24, 1.3)],
  ["Marvel's own bio says the explosion only left", marvel("marvel-grid", 0.5, 0.82, 2.0)],
  ["Other versions blame the mask itself", focus(C.ff57, 0.5, 0.8, 1.7)],
  ["Either way it's one of the best designs", cover(C.doom24)],
  ["If you want the whole origin in one place", grid(BOD, { title: "Books of Doom #1 to #6" })],
  ["Six issues from 2006", cap(C.bodTpb, "Books of Doom", "2006 · Ed Brubaker · Pablo Raimondi", "The origin")],
  ["It's told like an interview", pull(C.bod1)],
  ["Which is exactly how Doom would want it told", focus(C.bodTpb, 0.5, 0.38, 1.5)],

  // ── 04 A: the armor and the numbers ───────────────────────────────────────
  ["Now the Doom on the card", card({ context: "A" })],
  ["Marvel's profile lays out what the armor does", marvel("marvel-armor", 0.46, 0.14, 1.9, "Armor and Armament")],
  ["It's titanium It has a personal force field", cover(C.doom24)],
  ["The gauntlets fire concussive blasts", cover(C.ff60)],
  ["And it flies", cover(C.ff59)],
  ["And he never stops working on it", marvel("marvel-armor", 0.46, 0.1, 2.4)],
  ["Which is the fanciest way", cover(C.ff40)],
  ["So here are the numbers", card({ fillAt: 0.3, ...CARD_BACK })],
  ["Intelligence six", card({ highlight: "intelligence", ...CARD_BACK })],
  ["Strength four", card({ highlight: "strength", ...CARD_BACK })],
  ["Speed five", card({ highlight: "speed", ...CARD_BACK })],
  ["Durability six", card({ highlight: "durability", ...CARD_BACK })],
  ["Energy projection six", card({ highlight: "energy", ...CARD_BACK })],
  ["Fighting skills four", card({ highlight: "fighting", ...CARD_BACK })],
  ["Look at what's high", card(CARD_BACK)],
  ["Now look at what's in the middle", pull(C.ff40)],
  ["If Doom's in a fistfight", focus(C.sw10, 0.45, 0.62, 1.45)],
  ["Fun one from the same page", marvel("marvel-grid", 0.9, 0.3, 2.3, "6'2\" · 6'7\" and 415 lbs in armor")],
  ["In the armor he's six foot seven", card(CARD_BACK)],
  ["Now the obvious comparison is Iron Man", cover(C.iim1)],
  ["Doom even took the name Iron Man", cap(C.iim1, "Infamous Iron Man #1", "2016", "Doom as Iron Man")],
  ["And Marvel's profile says Doom refuses", marvel("marvel-bane", 0.4, 0.95, 2.1)],
  ["Different Tony", pull(C.iim1)],
  ["But here's what the Iron Man comparison misses", cover(C.tt)],

  // ── 05 Sorcery ────────────────────────────────────────────────────────────
  ["Marvel's profile says Doom's sorcery", marvel("marvel-armor", 0.46, 0.55, 2.3)],
  ["Think about that", cover(C.dd2019)],
  ["and Marvel's saying the magic might be the bigger half", cover(C.owud1)],
  ["The book that shows it best", cap(C.tt, "Doctor Strange and Doctor Doom: Triumph and Torment", "1989 · Roger Stern · Mike Mignola · Mark Badger", "Marvel Graphic Novel")],
  ["A graphic novel from 1989", focus(C.tt, 0.5, 0.2, 1.5)],
  ["Yes that Mike Mignola", focus(C.tt, 0.5, 0.62, 1.5)],
  ["I hadn't read this one", pull(C.tt)],
  ["It opens with a contest", focus(C.tt, 0.3, 0.62, 1.8)],
  ["Doom shows up and he gets one rule", focus(C.tt, 0.42, 0.52, 1.6)],
  ["Turn off the tech in your gauntlets", focus(C.doom24, 0.5, 0.45, 1.25)],
  ["He does it And it comes down to two people", cover(C.tt)],
  ["Strange keeps the title", focus(C.tt, 0.3, 0.62, 1.6)],
  ["Now here's the twist", pull(C.tt)],
  ["So Strange has to grant Doom one request", focus(C.tt, 0.3, 0.62, 1.8)],
  ["He figures Doom's going to ask for help", cover(C.mgn27)],
  ["Doom tells him he doesn't need help with that", cover(C.owud1)],
  ["What he wants is his mother", cover(C.bod2)],
  ["So the two of them go into Mephisto's realm", cover(C.tt)],
  ["That's the story where Doom gets to be the hero", pull(C.tt)],
  ["So the sorcery badge", card({ highlight: "sorcery", ...CARD_BACK })],
  ["A five means you're a master", card({ highlight: "sorcery", push: false, ...CARD_BACK })],
  ["A six means you hold the title", focus(C.tt, 0.3, 0.62, 1.6)],
  ["Standard Doom gets a five", card({ highlight: "sorcery", fillAt: 0, ...CARD_BACK })],
  ["And the six He's had that too", card({ highlight: "sorcery", sorcery: { value: 6, note: "BLOOD HUNT · 2024" }, ...CARD_BACK })],
  ["Blood Hunt 2024", cap(C.bh4, "Blood Hunt #4", "2024 · Jed MacKay · Pepe Larraz")],
  ["Doom says to cast the spell", pull(C.bh4)],
  ["Strange hands it over on one condition", focus(C.tt, 0.6, 0.5, 1.55)],
  ["Doom gives his word", focus(C.doom24, 0.5, 0.4, 1.5)],
  ["Doom saves the world", cap(C.bh5, "Blood Hunt #5", "2024")],
  ["announces himself Sorcerer Supreme", focus(C.owud1, 0.42, 0.33, 1.35)],
  ["To be fair he did save the world", pull(C.bh5)],
  ["That leads right into One World Under Doom", cap(C.owud1, "One World Under Doom", "2025 · Ryan North · R.B. Silva")],
  ["But that's not standard Doom", card({ context: "C", overlay: "godEmperor" })],

  // ── 06 B: Doom with a plan ────────────────────────────────────────────────
  ["That's A Now B", card({ context: "B" })],
  ["Same armor Same guy", cover(C.doom24)],
  ["Give Doom a few weeks and a reason", card({ context: "B", push: false })],
  ["Start with the Doombots", marvel("marvel-armor", 0.46, 0.36, 2.2, "Doombots")],
  ["They're in his very first issue", focus(C.ff5, 0.5, 0.45, 1.5)],
  ["And Marvel says they've fooled heroes", marvel("marvel-armor", 0.46, 0.4, 2.5)],
  ["So any time Doom loses", cover(C.dd2019)],
  ["Fantastic Four 10 1963", cap(C.ff10, "Fantastic Four #10", "January 1963 · Lee / Kirby")],
  ["Stan and Jack are right there", cover(C.ff10)],
  ["He has them call Reed over", focus(C.ff10, 0.68, 0.62, 1.6)],
  ["So the two guys who created Doom", pull(C.ff10)],
  ["Fantastic Four 84 through 87", grid(LATVERIA, { title: "Fantastic Four #84 to #87 · 1969" })],
  ["And they end up in this perfect little village", focus(C.ff84, 0.55, 0.48, 1.4)],
  ["It's a prison", focus(C.ff86, 0.5, 0.24, 1.45)],
  ["And then the big one Emperor Doom", cap(C.mgn27, "Emperor Doom", "Marvel Graphic Novel #27 · 1987 · David Michelinie · Bob Hall")],
  ["David Michelinie and Bob Hall", pull(C.mgn27)],
  ["Doom takes the Purple Man's mind control", focus(C.mgn27, 0.5, 0.36, 1.5)],
  ["And it works Doom actually rules the Earth", focus(C.mgn27, 0.5, 0.68, 1.35)],
  ["The one hero it doesn't work on is Wonder Man", pull(C.mgn27)],
  ["That's B No cosmic power", card({ context: "B" })],

  // ── 07 C: the Power Cosmic ────────────────────────────────────────────────
  ["And then there's C Borrowed power", card({ context: "C", overlay: "cosmic" })],
  ["Fantastic Four 57 Doom invites the Silver Surfer", cap(C.ff57, "Fantastic Four #57", "December 1966 · Lee / Kirby / Sinnott")],
  ["And the Surfer starts noticing", focus(C.ff57, 0.5, 0.3, 1.6)],
  ["Then they get to the lab", focus(C.ff57, 0.5, 0.78, 1.6)],
  ["And while he's looking Doom hooks him up", card({ overlay: "cosmic" })],
  ["Takes the board too", focus(C.ff58, 0.6, 0.3, 1.3)],
  ["Issue 58 Doom goes after the Fantastic Four", cap(C.ff58, "Fantastic Four #58", "January 1967")],
  ["He slows down the Thing's molecules", focus(C.ff58, 0.35, 0.7, 1.5)],
  ["And Reed tells his own team to stand down", focus(C.ff58, 0.3, 0.72, 1.5)],
  ["Doom lets them live", pull(C.ff58)],
  ["Issue 59 Doom flies around the world", cap(C.ff59, "Fantastic Four #59", "February 1967")],
  ["Meanwhile Reed's building something", cover(C.ff59)],
  ["It's making Doom angry", cover(C.dd2019)],
  ["Issue 60 In the middle of the fight", cap(C.ff60, "Fantastic Four #60", "March 1967")],
  ["It smacks him and takes off into the sky", pull(C.ff60)],
  ["Straight up Right into the barrier", card({ overlay: "cosmic" })],
  ["Flash The Power Cosmic's gone", card({ overlay: "cosmic", overlayOut: 0.15, push: false })],
  ["Reed didn't out-punch him", marvel("marvel-bane", 0.33, 0.32, 1.9)],
  ["And that's why the cosmic stuff doesn't go on the card", card({ context: "A" })],
  ["Then he lost it because Reed made him mad", pull(C.ff60)],

  // ── 08 C: Secret Wars, 1984 ───────────────────────────────────────────────
  ["Eighteen years later he does it again", cover(C.sw1)],
  ["Marvel Super Heroes Secret Wars 1984", cap(C.sw1, "Marvel Super Heroes Secret Wars", "1984 · Jim Shooter · Mike Zeck · John Beatty")],
  ["A cosmic being called the Beyonder", focus(C.sw1, 0.5, 0.6, 1.3)],
  ["Whoever wins gets whatever they want", cover(C.sw8)],
  ["Everybody remembers that Doom stole", cover(C.sw11)],
  ["He goes through Galactus first", card({ overlay: "beyonder", overlayOut: 1.5 })],
  ["Issue 1 Doom follows Galactus", pull(C.sw1)],
  ["But his armor scans the Beyonder's energy", card({ highlight: "energy" })],
  ["Issue 9 Doom breaks out", cap(C.sw9, "Secret Wars #9", "1985")],
  ["Using parts of Klaw", pull(C.sw9)],
  ["Issue 10 He uses that machine", cap(C.sw10, "Secret Wars #10", "1985")],
  ["Then he goes after the Beyonder", focus(C.sw10, 0.5, 0.35, 1.4)],
  ["The Beyonder is literally taking him apart", focus(C.sw10, 0.45, 0.62, 1.7)],
  ["So Doom reaches for a weapon", pull(C.sw10)],
  ["And he takes the Beyonder's power", card({ overlay: "beyonder" })],
  ["Issue 11 God Doom", cap(C.sw11, "Secret Wars #11", "1985")],
  ["He builds a tower two hundred miles high", focus(C.sw11, 0.5, 0.45, 1.3)],
  ["And he tells Captain America", focus(C.sw11, 0.35, 0.7, 1.5)],
  ["There's the mom again", cover(C.bod2)],
  ["Here's the catch though", card({ overlay: "beyonder" })],
  ["Issue 12 Klaw keeps feeding his doubts", cap(C.sw12, "Secret Wars #12", "1985")],
  ["And the Beyonder who never really left", focus(C.sw12, 0.55, 0.55, 1.5)],
  ["That's twice", card({ overlay: "beyonder", overlayOut: 1.2 })],

  // ── 09 C: God Emperor Doom ────────────────────────────────────────────────
  ["The third time he kept it a lot longer", cover(C.s1)],
  ["Secret Wars 2015 Jonathan Hickman", cap(C.s1, "Secret Wars", "2015 · Jonathan Hickman · Esad Ribić · Ive Svorcina")],
  ["This is the one people mean", pull(C.s1)],
  ["Short version The multiverse is ending", cover(C.s2)],
  ["Doom Doctor Strange and the Molecule Man", cover(C.s3)],
  ["And when it's over the Molecule Man hands", card({ overlay: "godEmperor" })],
  ["So Doom takes what's left of reality", grid(SW15, { columns: 4 })],
  ["Every piece is run by a baron", cover(C.s5)],
  ["Doctor Strange is his sheriff", cover(C.s6)],
  ["And Doom is God", cover(C.s7)],
  ["He took more than the world too", cover(C.s8)],
  ["Valeria and Franklin Reed's kids", cover(C.ffv68)],
  ["He didn't just beat Reed", marvel("marvel-bane", 0.33, 0.32, 1.9)],
  ["In issue 4 he kills Doctor Strange", cap(C.s4, "Secret Wars #4", "2015")],
  ["Then Reed shows up", focus(C.s4, 0.5, 0.5, 1.3)],
  ["Issue 9 Reed and Doom finally face off", cap(C.s9, "Secret Wars #9", "2016")],
  ["And the Molecule Man who's the real power source", cover(C.s3)],
  ["Just the two of them", pull(C.s9)],
  ["Reed says if he'd had that power", focus(C.s9, 0.5, 0.5, 1.4)],
  ["And Doom admits it", card({ overlay: "godEmperor", overlayOut: 0.6 })],
  ["That's when the Molecule Man gives the power", pull(C.s9)],
  ["Last page Back in Latveria", focus(C.dd2019, 0.5, 0.4, 1.3)],
  ["Marvel's bio says Reed healed his face", marvel("marvel-bane", 0.4, 0.62, 1.9)],
  ["Reed beats him then fixes his face", pair(C.ff5, "1962", C.s9, "2016")],

  // ── 10 What actually beats Doom ───────────────────────────────────────────
  ["So what actually beats Doctor Doom", card()],
  ["Look at the three times he had cosmic power", grid([C.ff60, C.sw12, C.s9], { title: "1966 · 1984 · 2015" })],
  ["In 1966 Reed makes him mad", cover(C.ff60)],
  ["In 1984 his own doubts take him down", cover(C.sw12)],
  ["In 2015 he admits Reed would have done better", cover(C.s9)],
  ["Nobody out-punched him", pull(C.doom24)],
  ["And two out of three times", marvel("marvel-bane", 0.33, 0.32, 1.9)],
  ["Here's my take", cover(C.dd2019)],
  ["Galactus the Beyonder whoever", grid([C.ff57, C.sw10, C.s1])],
  ["What he can't handle is somebody knowing better", marvel("marvel-bane", 0.4, 0.7, 2.0)],
  ["He's also got options most villains don't", card()],
  ["If the science doesn't work there's magic", cover(C.tt)],
  ["If the magic doesn't work there's a robot double", focus(C.ff5, 0.5, 0.45, 1.5)],
  ["he still runs a country", focus(C.ff84, 0.55, 0.42, 1.55)],
  ["That's why one power number", card()],

  // ── 11 Collector's corner ─────────────────────────────────────────────────
  ["So if you want to actually read some Doom", fan(ESSENTIALS)],
  ["here's where I'd start Five books", grid([C.ff5, C.bodTpb, C.tt, C.ff57, C.s1], { columns: 5 })],
  ["One Fantastic Four 5", cap(C.ff5, "1. Fantastic Four #5", "1962 · first appearance", "Card Back · Essential reading")],
  ["But here's a collector fact", pair(C.ff5, "Fantastic Four #5 · 1962", C.ffa2, "Annual #2 · 1964 · reprints it")],
  ["reprints that first story", focus(C.ffa2, 0.5, 0.45, 1.4)],
  ["And it's the same annual with his origin", pull(C.ffa2)],
  ["Two Books of Doom", cap(C.bodTpb, "2. Books of Doom #1 to #6", "2006 · collected 2025", "Card Back · Essential reading")],
  ["The origin done right", site("cc-books-of-doom", 0.4, 0.22, 1.5, "Books of Doom on ComixCatalog")],
  ["Three Triumph and Torment", cap(C.tt, "3. Triumph and Torment", "1989 · Marvel Graphic Novel", "Card Back · Essential reading")],
  ["Four Fantastic Four 57 through 60", grid(FF_SURFER, { title: "4. Fantastic Four #57 to #60 · 1966 to 1967" })],
  ["The Silver Surfer heist", focus(C.ff57, 0.5, 0.3, 1.5)],
  ["and Reed wins by being annoying", marvel("marvel-bane", 0.33, 0.32, 1.9)],
  ["Five Secret Wars 2015", cap(C.s1, "5. Secret Wars #1 to #9", "2015 to 2016", "Card Back · Essential reading")],
  ["Nine issues and the biggest swing", site("cc-sw-2015", 0.4, 0.22, 1.5, "Secret Wars (2015) on ComixCatalog")],
  ["Bonus round The 1984 Secret Wars", site("cc-sw-1984", 0.4, 0.22, 1.5, "Marvel Super-Heroes Secret Wars (1984)")],
  ["And Emperor Doom for the time he actually won", cover(C.mgn27)],
  ["And if you're keeping track", site("cc-ff-1961", 0.4, 0.2, 1.4, "Fantastic Four (1961) on ComixCatalog")],
  ["Catalog your books mark what you own", site("cc-issue-ff-57", 0.72, 0.21, 2.2)],
  ["and see what you're still missing", site("cc-start-missing", 0.6, 0.1, 1.6)],

  // ── 12 Ending ─────────────────────────────────────────────────────────────
  ["That's Doctor Doom Scientist Sorcerer King", card({ context: "A" })],
  ["And now and then something a lot bigger", card({ overlay: "godEmperor" })],
  ["He doesn't have one superpower", fan(ESSENTIALS)],
  ["What's your favorite Doom moment", cover(C.doom24)],
  ["If you want the next one subscribe", card({ flipAt: 0.4 })],
];

const resolved = resolveAnchors(narrationWords, CUES.map(([phrase]) => phrase));
export const anchorMisses = resolved.misses;
if (anchorMisses.length) throw new Error(`episode-006: unresolved anchors:\n${anchorMisses.map((m) => `#${m.index} ${m.phrase}`).join("\n")}`);
const segments = CUES.map(([phrase, seg], i) => ({ ...seg, at: +Math.max(0, resolved.times[i] - LEAD).toFixed(3), beat: phrase }));
// The open fades up from black at 0 s, under the first words.
segments[0].at = 0;
segments.push({ type: "sting", at: stingGap.at, beat: "Channel sting", transition: "cut", tagline: "Catalog. Collect. Connect." });
segments.push({ type: "end", at: plan.endCard, dur: plan.duration - plan.endCard, beat: "End card", title: "Who gets the next Power Profile?", sub: "Tell me in the comments", transitionIn: "cut" });
segments.sort((x, y) => x.at - y.at);

export default {
  id: "episode-006", assetEpisodeId: "episode-006", outputDir: "episode-006", outputName: "episode-006", compositionId: "Episode006",
  title: config.titleOptions[0], duration: plan.duration, nudges: [], segments,
  audio: {
    narration: { asset: "audio/VOICE_PROGRAM.wav", at: 0, volume: 1 },
    // One continuous pre-built bed (never loop in Remotion); ducked under the sting. TTS is dense, so 0.2 (not 0.25).
    music: { asset: "audio/MUSIC_BED_FULL.wav", volume: 0.2, fadeIn: 2, fadeOut: 4, loop: false, duck: [{ from: stingGap.at, to: stingGap.at + stingGap.dur }] },
    // Funkorama's band enters at 7.1 s; start there so the hit lands with the logo.
    sting: { asset: "audio/MUSIC_STING.mp3", at: stingGap.at, from: 7.1, dur: stingGap.dur, volume: 1, fadeOut: 0.4 },
  },
};
