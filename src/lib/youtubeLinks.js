// One short link per YouTube video: comixcatalog.com/yt/<slug>. Each lands on
// the page its video is about and carries utm_campaign=yt-<slug>, so a signup
// can be traced to the video that sent it (src/lib/attribution.js saves source,
// medium and campaign onto the profile; utm_content never reaches it).
//
// Slugs stay short and typeable on purpose. YouTube doesn't make links clickable
// in Shorts descriptions or comments, so on a Short the link is something a
// viewer reads and types.
//
// Published descriptions depend on these slugs: repoint a destination freely,
// but never rename or remove a slug that has been posted.

const AMORY_WARS_CHECKLIST = "/series/f5b04bab-2a49-4d6c-afaa-71a916795fb8/checklist";
const BAG_ON_LINE_CHECKLIST = "/series/aa36b552-18e8-4a30-86ef-9a5cee18756a/checklist";
const GETTING_INTO_COMICS = "/blog/getting-back-into-comics";
const HICKMAN = "/creator/jonathan-hickman";

export const YOUTUBE_LINKS = Object.freeze({
  // Long videos. Links in these descriptions and pinned comments are clickable.
  // doom's spoken end line promises the founding offer "in the description", so
  // it lands on the founding page rather than on a Doom comic.
  doom: "/founding-collectors",
  "doom-ff5": "/issue/gcd-17043", // Fantastic Four #5, Doom's first appearance
  xmen: GETTING_INTO_COMICS, // episode 001
  hickman: HICKMAN, // episode 002
  longboxes: "/founding-collectors", // episode 003, the origin of the site
  amory1: AMORY_WARS_CHECKLIST, // episode 004
  amory2: AMORY_WARS_CHECKLIST, // episode 005

  // Shorts.
  xman: "/issue/gcd-28072", // Giant-Size X-Men #1, Colossus's first appearance
  getinto: GETTING_INTO_COMICS,
  xmen1: GETTING_INTO_COMICS,
  milk: "/series/256f81c4-6039-47b4-86bf-23354abe1d7d",
  manhattan: "/series/413e8ac2-7d36-43e6-9986-b5199c746f7d",
  scud: "/series/f9c7754d-278d-40d4-b93a-fd5e43026d45",
  whowrote: HICKMAN,
  amorymap: AMORY_WARS_CHECKLIST,
  bagonline: BAG_ON_LINE_CHECKLIST,
  twoissues: BAG_ON_LINE_CHECKLIST,
});

const tags = (slug) => `utm_source=youtube&utm_medium=video&utm_campaign=yt-${slug}`;

// For next.config.mjs. Temporary redirects, so a destination can change without
// touching a published description. The pattern at the end keeps a mistyped or
// brand-new slug tagged instead of a 404; it has to come after the named links.
export function youtubeRedirects() {
  return [
    ...Object.entries(YOUTUBE_LINKS).map(([slug, path]) => ({
      source: `/yt/${slug}`,
      destination: `${path}?${tags(slug)}`,
      permanent: false,
    })),
    {
      source: "/yt/:video([a-z0-9-]{2,40})",
      destination: `/founding-collectors?${tags(":video")}`,
      permanent: false,
    },
  ];
}
