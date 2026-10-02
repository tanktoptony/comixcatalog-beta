// Short "what changed on the site" notes for the homepage Dispatch feed
// (src/components/HomeDispatch.js). Hand-written, newest first. Add an entry
// when something a collector would notice ships; keep each one to a title
// and a sentence or two, in plain words, no internal jargon. Blog posts
// show up in the same feed automatically and don't belong here.
//
// href is optional; point it at the place the change can be seen.

export const SITE_NEWS = [
  {
    date: "2026-10-02",
    title: "Your wantlist, for sale",
    body: "When someone lists a book on your wantlist, it shows up first on the marketplace under From your wantlist, cheapest first, and your library's Wantlist tab tags it with how many are for sale and from how much.",
    href: "/marketplace",
  },
  {
    date: "2026-10-02",
    title: "Put a price on it",
    body: "Books you've listed for sale now have an Edit listing button in your library: set your price and shipping, add condition notes, flag restored or signed, and choose whether to take offers. Buyers see your price on the marketplace instead of an estimate.",
    href: "/library?tab=for_sale",
  },
  {
    date: "2026-10-02",
    title: "Watch your collection's value move",
    body: "Collector Pro now charts your collection's estimated value day by day in your library, with the change over 30 days, 90 days or all time. It moves with the market even when your collection doesn't.",
    href: "/library",
  },
  {
    date: "2026-10-01",
    title: "Browse the marketplace like a record bin",
    body: "Search it, or click through by publisher, then series, then grade, format, decade or price, with counts on every filter. The front page now shows what just got listed, what's most wanted, and the most valuable books for sale.",
    href: "/marketplace",
  },
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
