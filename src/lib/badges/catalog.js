const result = (value, target) => ({
  earned: value >= target,
  progress: Math.min(value, target),
  target,
});

const count = (stats, field, target) => result(Number(stats[field] ?? 0), target);
const milestone = (id, name, threshold) => ({
  id,
  group: "Milestones",
  name,
  description: threshold === 1 ? "Logged your first book" : `${threshold.toLocaleString("en-US")} books in your collection`,
  shape: "circle",
  mark: String(threshold),
  threshold,
  test: (stats) => count(stats, "ownedCount", threshold),
});

export const BADGE_CATALOG = [
  milestone("first-issue", "First Issue", 1),
  milestone("ten-spot", "Ten Spot", 10),
  milestone("starter-stack", "Starter Stack", 25),
  milestone("half-century", "Half Century", 50),
  milestone("short-box", "Short Box", 100),
  milestone("two-fifty", "Two-Fifty", 250),
  milestone("long-box", "Long Box", 500),
  milestone("the-vault", "The Vault", 1000),
  milestone("warehouse", "Warehouse", 2500),
  { id: "first-key", group: "Keys", name: "First Key", description: "Own a key issue", shape: "hex", mark: "key", test: (s) => count(s, "keyCount", 1) },
  { id: "key-holder", group: "Keys", name: "Key Holder", description: "Own 10 key issues", shape: "hex", mark: "key", threshold: 10, test: (s) => count(s, "keyCount", 10) },
  { id: "major-key", group: "Keys", name: "Major Key", description: "Own a tier 1 key issue", shape: "hex", mark: "key", test: (s) => result(s.majorKeyCount ?? 0, 1) },
  { id: "golden-age", group: "Keys", name: "Golden Age", description: "Own a book from 1955 or earlier", shape: "hex", mark: "star", test: (s) => result(s.eraCounts?.golden ?? 0, 1) },
  { id: "silver-key", group: "Keys", name: "Silver Key", description: "Own a key issue from 1956 to 1969", shape: "hex", mark: "key", test: (s) => result(s.silverKeyCount ?? 0, 1) },
  { id: "through-the-ages", group: "Eras", name: "Through the Ages", description: "Own a book from every comic age", shape: "hex", mark: "ages", test: (s) => result(["golden", "silver", "bronze", "copper", "modern"].filter((era) => (s.eraCounts?.[era] ?? 0) > 0).length, 5) },
  { id: "marvel-collector", group: "Publishers", name: "Marvel Collector", description: "Own 50 Marvel books", shape: "shield", mark: "MARVEL", threshold: 50, test: (s) => result(s.publisherCounts?.marvel ?? 0, 50) },
  { id: "dc-collector", group: "Publishers", name: "DC Collector", description: "Own 50 DC books", shape: "shield", mark: "DC", threshold: 50, test: (s) => result(s.publisherCounts?.dc ?? 0, 50) },
  { id: "image-collector", group: "Publishers", name: "Image Collector", description: "Own 25 Image books", shape: "shield", mark: "IMAGE", threshold: 25, test: (s) => result(s.publisherCounts?.image ?? 0, 25) },
  { id: "indie-explorer", group: "Publishers", name: "Indie Explorer", description: "Collect from 5 publishers outside the big three", shape: "shield", mark: "INDIE", test: (s) => result(s.indiePublisherCount ?? 0, 5) },
  { id: "run-complete", group: "Runs", name: "Run Complete", description: "Complete a run with at least 4 issues", shape: "shield", mark: "check", test: (s) => result(s.completedRunCount ?? 0, 1) },
  { id: "five-runs", group: "Runs", name: "Five Runs", description: "Complete 5 runs", shape: "shield", mark: "5", threshold: 5, test: (s) => result(s.completedRunCount ?? 0, 5) },
  { id: "ten-runs", group: "Runs", name: "Ten Runs", description: "Complete 10 runs", shape: "shield", mark: "10", threshold: 10, test: (s) => result(s.completedRunCount ?? 0, 10) },
  { id: "long-haul", group: "Runs", name: "The Long Haul", description: "Complete a run of 100 or more issues", shape: "shield", mark: "100", test: (s) => result(s.longRunCount ?? 0, 1) },
  { id: "slabbed", group: "Grading", name: "Slabbed", description: "Add your first graded book", shape: "hex", mark: "slab", test: (s) => count(s, "slabbedCount", 1) },
  { id: "slab-stack", group: "Grading", name: "Slab Stack", description: "Own 10 graded books", shape: "hex", mark: "slab", threshold: 10, test: (s) => count(s, "slabbedCount", 10) },
  { id: "nine-eight-club", group: "Grading", name: "The 9.8 Club", description: "Own a 9.8 graded book", shape: "hex", mark: "9.8", test: (s) => result(s.nineEightCount ?? 0, 1) },
  { id: "first-follow", group: "Community", name: "First Follow", description: "Follow another collector", shape: "circle", mark: "follow", test: (s) => count(s, "followingCount", 1) },
  { id: "recruiter", group: "Community", name: "Recruiter", description: "Welcome a collector you invited", shape: "circle", mark: "invite", test: (s) => count(s, "recruitCount", 1) },
  { id: "wantlist-started", group: "Community", name: "Wantlist Started", description: "Add 5 books to your wantlist", shape: "circle", mark: "heart", threshold: 5, test: (s) => count(s, "wantlistCount", 5) },
  { id: "scanner", group: "Community", name: "Scanner", description: "Match 25 cover scans", shape: "circle", mark: "scan", threshold: 25, test: (s) => count(s, "matchedScanCount", 25) },
  { id: "founding-collector", group: "Founding", name: "Founding Collector", description: "One of the first 100 collectors", shape: "shield", mark: "founding", test: (s) => ({ earned: Boolean(s.isFoundingCollector), progress: s.isFoundingCollector ? 1 : 0, target: 1 }) },
];

export const BADGES_BY_ID = new Map(BADGE_CATALOG.map((badge) => [badge.id, badge]));

export function evaluateBadges(stats) {
  return Object.fromEntries(BADGE_CATALOG.map((badge) => [badge.id, badge.test(stats)]));
}
