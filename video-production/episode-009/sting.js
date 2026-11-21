// Pages for the page-flip channel sting (shared/components/pageFlipSting.jsx):
// [0] left page at the start, then front/back of each of the 7 leaves.
// IKSSE:3 has no interior pages online (RESEARCH.md), so the book flips
// through its own covers instead. Spoiler-safe: #1 to #5 and the #1 variants,
// never #6 ("Wilhelm Ryan surrenders!") or #10 to #12.
const c = (n) => `episode-009/covers/iksse-${n}.jpg`;
export const STING_PAGES = [
  c("01"),
  c("02"), c("01-v02"),
  c("03"), c("01-v03"),
  c("04"), c("05"),
  c("01-v01"), c("02"),
  c("05-v"), c("03"),
  c("04"), c("01"),
  c("09-v"), c("01-v02"),
];
