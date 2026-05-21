// Curated featured-series list for the homepage carousel + /search browse.
//
// Goal: signal "contemporary collector culture" — current hot books, recent
// acclaimed runs, modern indies. NOT all-time-greatest by lifetime sales
// (that surfaces 80-year-old strip comics and the original 1940 Batman).
//
// Tiers (rough ordering — higher = more carousel weight):
//   1. CURRENT HEAT (2024-2026) — books winning monthly Diamond/Lunar/
//      PreviewsWorld charts right now.
//   2. RECENT MODERN CLASSICS (2019-2023) — runs that defined the era and
//      still sell back issues / trades well.
//   3. PERENNIAL ICONS — the flagship modern runs of forever-titles
//      (Amazing Spider-Man current vol, Batman current vol, etc.) NOT the
//      Golden Age first volumes.
//   4. INDIE / IMAGE STAPLES — books with strong collector communities.
//
// Each entry:
//   { title: string                  — exact series.title from GCD/our DB
//     publisher: string              — must match resolved_publisher_cached
//     prefer_year: number | null     — picks the right run when multiple
//                                       volumes share a title
//     tier: 1-4                      — used for ranking
//   }
//
// To regenerate against current taste, edit this file directly. It is NOT
// auto-generated — that was the Comichron path which we abandoned because
// its data ends in 2020 and the source site is stale.
//
// IMPORTANT: some of these may not have a matching row in `series` yet
// (especially the brand-new 2024-2025 launches if GCD ingest is older).
// /api/comics gracefully filters to entries that DO match — missing ones
// just don't appear in the carousel.

export const FEATURED_SERIES = [
  // ── Tier 1: Current heat (2024–2026 hot launches) ─────────────────────
  { title: "Absolute Batman", publisher: "DC Comics", prefer_year: 2024, tier: 1 },
  { title: "Absolute Wonder Woman", publisher: "DC Comics", prefer_year: 2024, tier: 1 },
  { title: "Absolute Superman", publisher: "DC Comics", prefer_year: 2024, tier: 1 },
  { title: "Absolute Martian Manhunter", publisher: "DC Comics", prefer_year: 2025, tier: 1 },
  { title: "Absolute Green Lantern", publisher: "DC Comics", prefer_year: 2025, tier: 1 },
  { title: "Absolute Flash", publisher: "DC Comics", prefer_year: 2025, tier: 1 },
  { title: "Ultimate Spider-Man", publisher: "Marvel Comics", prefer_year: 2024, tier: 1 },
  { title: "Ultimate X-Men", publisher: "Marvel Comics", prefer_year: 2024, tier: 1 },
  { title: "Ultimate Black Panther", publisher: "Marvel Comics", prefer_year: 2024, tier: 1 },
  { title: "Ultimate Wolverine", publisher: "Marvel Comics", prefer_year: 2025, tier: 1 },
  { title: "Ultimates", publisher: "Marvel Comics", prefer_year: 2024, tier: 1 },
  { title: "Ultimate Invasion", publisher: "Marvel Comics", prefer_year: 2023, tier: 1 },
  { title: "Spider-Boy", publisher: "Marvel Comics", prefer_year: 2024, tier: 1 },
  { title: "TVA", publisher: "Marvel Comics", prefer_year: 2024, tier: 1 },
  { title: "One World Under Doom", publisher: "Marvel Comics", prefer_year: 2025, tier: 1 },

  // ── Tier 2: Recent modern classics (2019–2023) ────────────────────────
  { title: "X-Men", publisher: "Marvel Comics", prefer_year: 2019, tier: 2 }, // HoX/PoX & Krakoa
  { title: "House of X", publisher: "Marvel Comics", prefer_year: 2019, tier: 2 },
  { title: "Powers of X", publisher: "Marvel Comics", prefer_year: 2019, tier: 2 },
  { title: "Immortal X-Men", publisher: "Marvel Comics", prefer_year: 2022, tier: 2 },
  { title: "Daredevil", publisher: "Marvel Comics", prefer_year: 2019, tier: 2 }, // Zdarsky
  { title: "Immortal Hulk", publisher: "Marvel Comics", prefer_year: 2018, tier: 2 },
  { title: "Moon Knight", publisher: "Marvel Comics", prefer_year: 2021, tier: 2 },
  { title: "Black Panther", publisher: "Marvel Comics", prefer_year: 2021, tier: 2 },
  { title: "Star Wars", publisher: "Marvel Comics", prefer_year: 2020, tier: 2 },
  { title: "Star Wars: Darth Vader", publisher: "Marvel Comics", prefer_year: 2020, tier: 2 },
  { title: "Batman", publisher: "DC Comics", prefer_year: 2016, tier: 2 }, // King + Zdarsky era
  { title: "The Nice House on the Lake", publisher: "DC Comics", prefer_year: 2021, tier: 2 },
  { title: "Nightwing", publisher: "DC Comics", prefer_year: 2016, tier: 2 }, // Taylor run
  { title: "Wonder Woman", publisher: "DC Comics", prefer_year: 2023, tier: 2 }, // Tom King
  { title: "Action Comics", publisher: "DC Comics", prefer_year: 2023, tier: 2 }, // Williamson era
  { title: "Detective Comics", publisher: "DC Comics", prefer_year: 2016, tier: 2 },

  // ── Tier 3: Perennial icons (current-vol of forever titles) ───────────
  { title: "The Amazing Spider-Man", publisher: "Marvel Comics", prefer_year: 2022, tier: 3 },
  { title: "Spider-Man", publisher: "Marvel Comics", prefer_year: 2022, tier: 3 },
  { title: "Wolverine", publisher: "Marvel Comics", prefer_year: 2020, tier: 3 },
  { title: "Avengers", publisher: "Marvel Comics", prefer_year: 2023, tier: 3 },
  { title: "Fantastic Four", publisher: "Marvel Comics", prefer_year: 2022, tier: 3 },
  { title: "Captain America", publisher: "Marvel Comics", prefer_year: 2023, tier: 3 },
  { title: "Thor", publisher: "Marvel Comics", prefer_year: 2020, tier: 3 },
  { title: "Iron Man", publisher: "Marvel Comics", prefer_year: 2020, tier: 3 },
  { title: "Deadpool", publisher: "Marvel Comics", prefer_year: 2022, tier: 3 },
  { title: "Punisher", publisher: "Marvel Comics", prefer_year: 2022, tier: 3 },
  { title: "Venom", publisher: "Marvel Comics", prefer_year: 2021, tier: 3 },
  { title: "Daredevil", publisher: "Marvel Comics", prefer_year: 2023, tier: 3 },
  { title: "Superman", publisher: "DC Comics", prefer_year: 2023, tier: 3 },
  { title: "The Flash", publisher: "DC Comics", prefer_year: 2023, tier: 3 },
  { title: "Green Lantern", publisher: "DC Comics", prefer_year: 2023, tier: 3 },
  { title: "Justice League", publisher: "DC Comics", prefer_year: 2022, tier: 3 },
  { title: "Aquaman", publisher: "DC Comics", prefer_year: 2024, tier: 3 },
  { title: "Catwoman", publisher: "DC Comics", prefer_year: 2018, tier: 3 },
  { title: "Robin", publisher: "DC Comics", prefer_year: 2021, tier: 3 },
  { title: "Harley Quinn", publisher: "DC Comics", prefer_year: 2021, tier: 3 },
  { title: "Birds of Prey", publisher: "DC Comics", prefer_year: 2023, tier: 3 },
  { title: "Poison Ivy", publisher: "DC Comics", prefer_year: 2022, tier: 3 },

  // ── Tier 4: Indie / Image / modern collector staples ──────────────────
  { title: "Saga", publisher: "Image Comics", prefer_year: 2012, tier: 4 },
  { title: "The Walking Dead", publisher: "Image Comics", prefer_year: 2003, tier: 4 },
  { title: "Invincible", publisher: "Image Comics", prefer_year: 2003, tier: 4 },
  { title: "Spawn", publisher: "Image Comics", prefer_year: 1992, tier: 4 },
  { title: "Something Is Killing the Children", publisher: "BOOM! Studios", prefer_year: 2020, tier: 4 },
  { title: "House of Slaughter", publisher: "BOOM! Studios", prefer_year: 2021, tier: 4 },
  { title: "The Department of Truth", publisher: "Image Comics", prefer_year: 2020, tier: 4 },
  { title: "Geiger", publisher: "Image Comics", prefer_year: 2021, tier: 4 },
  { title: "Radiant Black", publisher: "Image Comics", prefer_year: 2021, tier: 4 },
  { title: "Killadelphia", publisher: "Image Comics", prefer_year: 2019, tier: 4 },
  { title: "Local Man", publisher: "Image Comics", prefer_year: 2023, tier: 4 },
  { title: "We Live", publisher: "AfterShock Comics", prefer_year: 2020, tier: 4 },
  { title: "Stray Dogs", publisher: "Image Comics", prefer_year: 2021, tier: 4 },
  { title: "Vanish", publisher: "Image Comics", prefer_year: 2022, tier: 4 },
  { title: "Ice Cream Man", publisher: "Image Comics", prefer_year: 2018, tier: 4 },
  { title: "Monstress", publisher: "Image Comics", prefer_year: 2015, tier: 4 },
  { title: "Once & Future", publisher: "BOOM! Studios", prefer_year: 2019, tier: 4 },
  { title: "Power Rangers", publisher: "BOOM! Studios", prefer_year: 2020, tier: 4 },
  { title: "Mighty Morphin Power Rangers", publisher: "BOOM! Studios", prefer_year: 2016, tier: 4 },
  { title: "Teenage Mutant Ninja Turtles", publisher: "IDW Publishing", prefer_year: 2011, tier: 4 },
  { title: "Sonic the Hedgehog", publisher: "IDW Publishing", prefer_year: 2018, tier: 4 },
  { title: "Stranger Things", publisher: "Dark Horse Comics", prefer_year: 2018, tier: 4 },

  // Classic-but-still-selling — kept short because the carousel should LEAD
  // with modern. These provide texture, not the main attraction.
  { title: "Watchmen", publisher: "DC Comics", prefer_year: 1986, tier: 4 },
  // Gaiman-era series is stored as "Sandman" (no "The") under DC Comics.
  { title: "Sandman", publisher: "DC Comics", prefer_year: 1989, tier: 4 },
  { title: "Y: The Last Man", publisher: "DC Comics", prefer_year: 2002, tier: 4 },
  { title: "Preacher", publisher: "DC Comics", prefer_year: 1995, tier: 4 },
];

// Convenience map for fast lookup when /api/comics merges this with series rows.
export const FEATURED_SERIES_BY_TITLE_PUBLISHER = new Map(
  FEATURED_SERIES.map((s) => [`${s.title.toLowerCase()}::${s.publisher.toLowerCase()}`, s])
);
