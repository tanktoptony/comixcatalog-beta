// Pages for the page-flip channel sting (shared/components/pageFlipSting.jsx):
// [0] left page at the start, then front/back of each of the 7 leaves.
// Interiors only (no covers), spoiler-safe: Lake #1, #3, #6, #9, minus the
// #9 "Walter is not human" page.
const a = (set, n) => `episode-008/art/lake-${set}/${n}.jpg`;
export const STING_PAGES = [
  a("01", "cw03-the-nice-house-on-the-lake-1-2"),
  a("01", "cw05-the-nice-house-on-the-lake-1-4"), a("01", "cw04-the-nice-house-on-the-lake-1-3"),
  a("01", "cw07-the-nice-house-on-the-lake-1-6"), a("01", "cw08-the-nice-house-on-the-lake-1-7"),
  a("03", "cw04-the-nice-house-on-the-lake-3-3"), a("03", "cw03-the-nice-house-on-the-lake-3-2"),
  a("06", "cw04-the-nice-house-on-the-lake-6-3"), a("03", "cw06-the-nice-house-on-the-lake-3-5"),
  a("06", "cw05-the-nice-house-on-the-lake-6-4"), a("06", "cw03-the-nice-house-on-the-lake-6-2"),
  a("09", "cw03-the-nice-house-on-the-lake-9-3"), a("06", "cw06-the-nice-house-on-the-lake-6-5"),
  a("09", "cw05-the-nice-house-on-the-lake-9-5"), a("09", "cw08-the-nice-house-on-the-lake-9-2"),
];
