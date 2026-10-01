// Short "what changed on the site" notes for the homepage Dispatch feed
// (src/components/HomeDispatch.js). Hand-written, newest first. Add an entry
// when something a collector would notice ships; keep each one to a title
// and a sentence or two, in plain words, no internal jargon. Blog posts
// show up in the same feed automatically and don't belong here.
//
// href is optional; point it at the place the change can be seen.

export const SITE_NEWS = [
  {
    date: "2026-10-01",
    title: "The marketplace is open (beta)",
    body: "List books straight from your collection, or everything at once. Each one shows up on the Marketplace and on its issue page, and buyers make an offer by message.",
    href: "/marketplace",
  },
  {
    date: "2026-10-01",
    title: "Search got about 40 times lighter",
    body: "Results and shelves now load small cover images. An X-Men search went from 134 MB of downloads to about 3 MB, and pages show up in around a second.",
    href: "/search?q=x-men",
  },
  {
    date: "2026-10-01",
    title: "Your library opens instantly",
    body: "We keep a copy on your device and refresh it in the background. Collections over 1,000 books now load in full, too.",
    href: "/library",
  },
  {
    date: "2026-09-30",
    title: "Share your shelf to Instagram Stories",
    body: "Make a Story card of your collection, ready to post.",
    href: "/start",
  },
];
