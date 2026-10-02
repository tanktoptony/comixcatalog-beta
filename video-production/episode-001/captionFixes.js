// Caption text fixes for Tony's Episode 001 recording, shared by the
// YouTube captions (scripts/youtube-package.mjs) and the Shorts.
// Whisper's spellings of names get fixed here; everything else is verbatim.
export const FIXES = [
  [/\bX -/g, "X-"],
  [/\bChicago land\b/g, "Chicagoland"],
  [/\bExecutioner'?s? Song\b/g, "X-Cutioner's Song"],
  [/\bStrife\b/g, "Stryfe"],
  [/\bCoypel\b/g, "Coipel"],
  [/\b[Cc]omics [Cc]atalog\b/g, "ComixCatalog"],
  [/\bcables the main suspect\b/g, "Cable's the main suspect"],
  [/\bwant list\b/g, "wantlist"],
  [/\bLinks below\b/g, "Link's below"],
  [/\bturns into Steel\b/g, "turns into steel"],
  [/\b92 and a 93\b/g, "'92 into '93"],
  [/\bXavier's choice is going\b/g, "Xavier's choices, going"],
  [/\bour X-Men\.$/, "our X-Man."],
  [/^[Ss]tart catching up\b/, "start catching up"],
  [/\bWhen you pretend,/g, "When you were 10,"],
  [/\ball the way back to the beginning\.$/, "all the way back to the beginning,"],
  [/ in 60 years And /, " in 60 years. And "],
];
export const fixCaption = (s) => FIXES.reduce((acc, [re, to]) => acc.replace(re, to), s);
