// Edit decision list for Tony's narration recording (source seconds).
// Only applies when narration.words.js was made from this exact file.
//
// start: drop everything before this (lead-in silence).
// cuts:  [from, to) ranges removed from the voice: each is the first take of
//        a line Tony re-said (found by scanning the transcript for repeated
//        4-word runs within 25 s), cut from the first take's first word to
//        the retake's first word.
export default {
  source: "NARRATION.m4a",
  start: 41.9,
  cuts: [
    [147.1, 149.95], // "That's how I got into X-Men." (said twice)
    [188.05, 192.55], // "and you don't need to do homework to enjoy this stuff." (twice)
    [219.9, 222.4], // "It's the team at their peak." (twice)
    [484.7, 486.85], // "Find a character you like." (twice)
    [532.25, 535.55], // "Don't turn reading comics into homework." (twice)
  ],
};
