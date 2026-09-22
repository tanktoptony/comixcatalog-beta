// House-ad inventory for <AdSlot />. Every slot on the site renders one of
// these today; nothing here is a paid ad and nothing here loads a third
// party. The slot positions are the plumbing a sponsor or ad network would
// drop into later without touching any page.
//
// Before anything paid goes into a slot, read src/app/upgrade/page.js:
// Pro subscribers are told the $8 buys "no ads". That copy is a positioning
// decision the founder makes on purpose, not a side effect of this file.
//
// `show` decides eligibility per viewer. Upsells (Founding, Pro) are hidden
// from people who already have the thing; the informational ones
// (contribute, reading guides) show to everyone.

export const SLOT = {
  HOME_INLINE: "HOME_INLINE",
  SEARCH_INLINE_1: "SEARCH_INLINE_1",
  SERIES_INLINE_1: "SERIES_INLINE_1",
  ISSUE_INLINE_1: "ISSUE_INLINE_1",
};

export const HOUSE_ADS = [
  {
    id: "founding",
    kicker: "Founding Collector",
    headline: "Free Pro for life.",
    body: "Join while spots remain and Collector Pro is yours permanently, no card required.",
    cta: "See the offer",
    href: "/founding-collectors",
    show: ({ isPro, isFounding }) => !isPro && !isFounding,
  },
  {
    id: "value",
    kicker: "Collector Pro",
    headline: "Know what your collection is worth.",
    body: "Market values on every issue, grades and cert numbers tracked, and an insurance-ready PDF in one click.",
    cta: "See Pro",
    href: "/upgrade",
    show: ({ isPro }) => !isPro,
  },
  {
    id: "contribute",
    kicker: "Spot a gap?",
    headline: "Help fill in the database.",
    body: "Missing series, wrong cover, bad publisher? Tell us and it gets fixed for every collector.",
    cta: "How to contribute",
    href: "/contribute/guidelines",
    show: () => true,
  },
  {
    id: "newsletter",
    kicker: "Newsletter",
    headline: "One email every few weeks.",
    body: "What got added, what got fixed, and which books to go find. From the person who builds this. One-click out.",
    cta: "Sign up",
    href: "/newsletter",
    show: () => true,
  },
  {
    id: "reads",
    kicker: "Reading guides",
    headline: "Which issues actually matter.",
    body: "Key issues, first appearances and where to start on the runs collectors ask about most.",
    cta: "Read the guides",
    href: "/reads",
    show: () => true,
  },
];

// Small stable hash so the same page always shows the same ad in the same
// slot (SSR and client agree, no hydration mismatch) while different pages
// rotate through the inventory.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickHouseAd({ position, pageKey = "", viewer = {} }) {
  const eligible = HOUSE_ADS.filter((ad) => ad.show(viewer));
  if (!eligible.length) return null;
  return eligible[hash(`${position}:${pageKey}`) % eligible.length];
}
