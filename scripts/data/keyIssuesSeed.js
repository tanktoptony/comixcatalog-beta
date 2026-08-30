// Curated key-issue seed list — same philosophy as src/lib/featuredSeries.js:
// hand-maintained, not auto-generated, meant to be corrected/expanded by hand.
//
// Purpose: "featured" on a profile/library shouldn't be price-only (see
// CLAUDE.md's eBay-listing-price caveats — a listing price isn't a sale, and
// a genuinely important comic can be sitting at a low price before the
// market catches up). This is the other signal: is this issue independently
// notable regardless of what it's currently priced at.
//
// Each entry:
//   title       — exact series.title / gcd_series.name as GCD has it (bare
//                 title, no "(1963 series)" suffix — confirmed via direct
//                 gcd_series query pattern used elsewhere in this repo)
//   issueNumber — string, matches gcd_issues.issue_number as stored
//   publisher   — must match resolved_publisher_cached / gcd_publishers.name
//   year        — cover/publication year, used the same way
//                 featuredSeries.js's prefer_year picks the right volume
//                 when multiple series share a title
//   character   — who/what this is about, for future UI copy
//   reason      — why it's a key, short
//   tier        — 1 = mega-key (recognizable outside comics fandom),
//                 2 = well-known key among collectors
//
// NOT exhaustive by design. Every entry here was picked for confidence in
// title/issue/year accuracy — resolveKeyIssues.js only links an entry when
// it finds a matching gcd_issues row within a year tolerance (same guard
// /api/library-hydrate uses against cross-volume bleed), so a wrong year
// fails to match rather than silently pinning the wrong comic. Entries that
// don't resolve get logged, not guessed into place — fix the entry or drop
// it, don't loosen the matcher.

export const KEY_ISSUES = [
  // ── Marvel: foundational first appearances ────────────────────────────
  { title: "Amazing Fantasy", issueNumber: "15", publisher: "Marvel Comics", year: 1962, character: "Spider-Man", reason: "1st appearance of Spider-Man", tier: 1 },
  { title: "The Incredible Hulk", issueNumber: "1", publisher: "Marvel Comics", year: 1962, character: "Hulk", reason: "1st appearance of the Hulk", tier: 1 },
  { title: "The X-Men", issueNumber: "1", publisher: "Marvel Comics", year: 1963, character: "X-Men", reason: "1st appearance of the X-Men", tier: 1 },
  { title: "Fantastic Four", issueNumber: "1", publisher: "Marvel Comics", year: 1961, character: "Fantastic Four", reason: "1st appearance of the Fantastic Four", tier: 1 },
  { title: "The Avengers", issueNumber: "1", publisher: "Marvel Comics", year: 1963, character: "Avengers", reason: "1st appearance of the Avengers", tier: 1 },
  { title: "Tales of Suspense", issueNumber: "39", publisher: "Marvel Comics", year: 1963, character: "Iron Man", reason: "1st appearance of Iron Man", tier: 1 },
  { title: "Journey into Mystery", issueNumber: "83", publisher: "Marvel Comics", year: 1962, character: "Thor", reason: "1st appearance of Thor", tier: 1 },
  { title: "Daredevil", issueNumber: "1", publisher: "Marvel Comics", year: 1964, character: "Daredevil", reason: "1st appearance of Daredevil", tier: 2 },
  { title: "Captain America Comics", issueNumber: "1", publisher: "Timely", year: 1941, character: "Captain America", reason: "1st appearance of Captain America", tier: 1 },
  { title: "Fantastic Four", issueNumber: "52", publisher: "Marvel Comics", year: 1966, character: "Black Panther", reason: "1st appearance of Black Panther", tier: 1 },
  { title: "Fantastic Four", issueNumber: "48", publisher: "Marvel Comics", year: 1966, character: "Silver Surfer / Galactus", reason: "1st appearance of Silver Surfer and Galactus", tier: 2 },
  { title: "Tales of Suspense", issueNumber: "52", publisher: "Marvel Comics", year: 1964, character: "Black Widow", reason: "1st appearance of Black Widow", tier: 2 },
  { title: "Tales of Suspense", issueNumber: "57", publisher: "Marvel Comics", year: 1964, character: "Hawkeye", reason: "1st appearance of Hawkeye", tier: 2 },
  { title: "Marvel Spotlight", issueNumber: "5", publisher: "Marvel Comics", year: 1972, character: "Ghost Rider", reason: "1st appearance of Ghost Rider (Johnny Blaze)", tier: 2 },
  { title: "Marvel Premiere", issueNumber: "15", publisher: "Marvel Comics", year: 1974, character: "Iron Fist", reason: "1st appearance of Iron Fist", tier: 2 },
  { title: "Ms. Marvel", issueNumber: "1", publisher: "Marvel Comics", year: 1977, character: "Carol Danvers", reason: "1st appearance of Carol Danvers as Ms. Marvel", tier: 2 },

  // ── Marvel: X-Men / Wolverine ──────────────────────────────────────────
  { title: "Giant-Size X-Men", issueNumber: "1", publisher: "Marvel Comics", year: 1975, character: "X-Men (Storm, Wolverine, Colossus, Nightcrawler)", reason: "1st appearance of the new X-Men team", tier: 1 },
  { title: "The Incredible Hulk", issueNumber: "181", publisher: "Marvel Comics", year: 1974, character: "Wolverine", reason: "1st full appearance of Wolverine", tier: 1 },
  { title: "The New Mutants", issueNumber: "98", publisher: "Marvel Comics", year: 1991, character: "Deadpool", reason: "1st appearance of Deadpool", tier: 1 },
  { title: "The Uncanny X-Men", issueNumber: "266", publisher: "Marvel Comics", year: 1990, character: "Gambit", reason: "1st full appearance of Gambit", tier: 2 },
  // Marvel kept the original run's numbering under "The X-Men" (gcd_id
  // 1576) straight through #137, even though the indicia title had already
  // changed to "The Uncanny X-Men" by then — GCD's series record doesn't
  // fork until later. Confirmed by direct query; don't "fix" this to
  // "The Uncanny X-Men", it won't resolve.
  { title: "The X-Men", issueNumber: "137", publisher: "Marvel Comics", year: 1980, character: "Dark Phoenix", reason: "Climax of the Dark Phoenix Saga", tier: 2 },

  // ── Marvel: Spider-Man villains / supporting cast ─────────────────────
  { title: "The Amazing Spider-Man", issueNumber: "129", publisher: "Marvel Comics", year: 1974, character: "Punisher", reason: "1st appearance of the Punisher", tier: 1 },
  { title: "The Amazing Spider-Man", issueNumber: "300", publisher: "Marvel Comics", year: 1988, character: "Venom", reason: "1st full appearance of Venom", tier: 1 },
  { title: "The Amazing Spider-Man", issueNumber: "252", publisher: "Marvel Comics", year: 1984, character: "Spider-Man (black suit)", reason: "1st appearance of the black symbiote costume", tier: 2 },
  { title: "The Amazing Spider-Man", issueNumber: "361", publisher: "Marvel Comics", year: 1992, character: "Carnage", reason: "1st full appearance of Carnage", tier: 2 },
  { title: "The Amazing Spider-Man", issueNumber: "101", publisher: "Marvel Comics", year: 1971, character: "Morbius", reason: "1st appearance of Morbius", tier: 2 },
  { title: "The Amazing Spider-Man", issueNumber: "121", publisher: "Marvel Comics", year: 1973, character: "Gwen Stacy", reason: "Death of Gwen Stacy", tier: 1 },
  { title: "The Amazing Spider-Man", issueNumber: "122", publisher: "Marvel Comics", year: 1973, character: "Green Goblin", reason: "Death of the Green Goblin (Norman Osborn)", tier: 2 },

  // ── DC: foundational first appearances ─────────────────────────────────
  { title: "Action Comics", issueNumber: "1", publisher: "DC Comics", year: 1938, character: "Superman", reason: "1st appearance of Superman", tier: 1 },
  { title: "Detective Comics", issueNumber: "27", publisher: "DC Comics", year: 1939, character: "Batman", reason: "1st appearance of Batman", tier: 1 },
  { title: "Batman", issueNumber: "1", publisher: "DC Comics", year: 1940, character: "Joker / Catwoman", reason: "1st appearance of the Joker and Catwoman", tier: 1 },
  // All Star Comics #8 (Wonder Woman's 1st appearance) deliberately omitted:
  // our gcd_series/gcd_issues mirror has a "All Star Comic" (gcd_id 66707)
  // row, but its issues carry no publication_date/key_date at all and
  // several near-duplicate rows share each issue number — looks like a
  // messy multi-run merge in the source dump, not a clean single series.
  // Not safe to pin without real date data to disambiguate. Re-add if the
  // GCD mirror gets refreshed with better data for this one.
  { title: "Showcase", issueNumber: "4", publisher: "DC Comics", year: 1956, character: "Flash (Barry Allen)", reason: "1st Silver Age Flash — birth of the Silver Age", tier: 1 },
  { title: "Showcase", issueNumber: "22", publisher: "DC Comics", year: 1959, character: "Green Lantern (Hal Jordan)", reason: "1st Silver Age Green Lantern", tier: 1 },
  { title: "Detective Comics", issueNumber: "359", publisher: "DC Comics", year: 1967, character: "Batgirl", reason: "1st appearance of Barbara Gordon as Batgirl", tier: 2 },
  { title: "Batman", issueNumber: "232", publisher: "DC Comics", year: 1971, character: "Ra's al Ghul", reason: "1st appearance of Ra's al Ghul", tier: 2 },
  { title: "The New Teen Titans", issueNumber: "2", publisher: "DC Comics", year: 1980, character: "Deathstroke", reason: "1st appearance of Deathstroke", tier: 2 },
  { title: "Green Lantern", issueNumber: "76", publisher: "DC Comics", year: 1970, character: "Green Lantern / Green Arrow", reason: "O'Neil/Adams 'Hard-Traveling Heroes' run begins", tier: 2 },
  { title: "The Batman Adventures", issueNumber: "12", publisher: "DC Comics", year: 1993, character: "Harley Quinn", reason: "1st comic-book appearance of Harley Quinn", tier: 1 },

  // ── DC: deaths / major events ──────────────────────────────────────────
  { title: "Crisis on Infinite Earths", issueNumber: "7", publisher: "DC Comics", year: 1985, character: "Supergirl", reason: "Death of Supergirl", tier: 2 },
  { title: "Crisis on Infinite Earths", issueNumber: "8", publisher: "DC Comics", year: 1985, character: "Flash (Barry Allen)", reason: "Death of Barry Allen", tier: 2 },
  { title: "Superman", issueNumber: "75", publisher: "DC Comics", year: 1993, character: "Superman", reason: "\"Death of Superman\" — Doomsday storyline", tier: 1 },
  { title: "Batman", issueNumber: "428", publisher: "DC Comics", year: 1988, character: "Jason Todd", reason: "Death of Jason Todd (\"A Death in the Family\")", tier: 1 },

  // ── Image / indie ──────────────────────────────────────────────────────
  { title: "Spawn", issueNumber: "1", publisher: "Image Comics", year: 1992, character: "Spawn", reason: "1st appearance of Spawn, launch of Image Comics", tier: 1 },
  { title: "The Walking Dead", issueNumber: "1", publisher: "Image Comics", year: 2003, character: "Rick Grimes", reason: "Series debut", tier: 1 },
  // Saga #1 (Image, 2012) deliberately omitted: every "Saga" row in our
  // gcd_series mirror resolves to unrelated foreign-language titles (a
  // Swedish/Dutch/German "Saga" from other publishers, none Image Comics) —
  // the real Vaughan/Staples book doesn't appear to be in this GCD mirror
  // under this title at all. Re-add once it's confirmed present.
];
