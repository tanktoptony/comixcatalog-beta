import { unstable_cache } from "next/cache";
import { getServiceClient } from "./supabase/service.js";

// The homepage hero's cover wall: a weekly mix of all-time classics and
// this week's featured series, so it reads as "every era of comics" rather
// than a wall of 2024-25 relaunches. Each week picks 3 Golden/Silver Age,
// 3 Bronze Age and 2 later classics, plus 4 current featured covers.
//
// Every entry here was checked to have a cover in canonical_covers
// (2026-10-01). Titles are ComicVine's series names.
const CLASSICS = [
  ["Action Comics", "1", 1938], ["Detective Comics", "27", 1939], ["Batman", "1", 1940],
  ["Showcase", "4", 1956], ["Fantastic Four", "1", 1961], ["Amazing Fantasy", "15", 1962],
  ["Journey into Mystery", "83", 1962], ["Tales of Suspense", "39", 1963],
  ["The Amazing Spider-Man", "1", 1963], ["The X-Men", "1", 1963], ["The Avengers", "1", 1963],
  ["Daredevil", "1", 1964], ["Green Lantern", "76", 1970], ["Swamp Thing", "1", 1972],
  ["The Amazing Spider-Man", "129", 1974], ["The Incredible Hulk", "181", 1974],
  ["Giant-Size X-Men", "1", 1975], ["Star Wars", "1", 1977], ["Teenage Mutant Ninja Turtles", "1", 1984],
  ["Batman: The Dark Knight Returns", "1", 1986], ["Watchmen", "1", 1986],
  ["The New Mutants", "98", 1991], ["Spawn", "1", 1992], ["Superman", "75", 1993],
];

function seededShuffle(arr, seed) {
  let s = (seed | 0) || 1;
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadClassicCovers() {
  const sb = getServiceClient();
  const titles = [...new Set(CLASSICS.map(([t]) => t))];
  const issues = [...new Set(CLASSICS.map(([, i]) => i))];
  const { data, error } = await sb
    .from("canonical_covers")
    .select("series_title, issue_number, series_year, cover_date, storage_path")
    .in("series_title", titles)
    .in("issue_number", issues)
    .not("storage_path", "is", null)
    .limit(1000);
  if (error) throw error;
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/`;
  const out = [];
  for (const [title, issue, year] of CLASSICS) {
    const best = (data ?? [])
      .filter((r) => r.series_title === title && r.issue_number === issue)
      .map((r) => ({ r, d: Math.abs((r.series_year ?? Number(String(r.cover_date).slice(0, 4))) - year) }))
      .sort((a, b) => a.d - b.d)[0];
    if (best && best.d <= 2) out.push({ id: `classic-${title}-${issue}`, year, cover: base + best.r.storage_path });
  }
  if (out.length < 8) throw new Error(`only ${out.length} classic covers found`);
  return out;
}

const cachedClassics = unstable_cache(loadClassicCovers, ["hero-wall-classics-v1"], { revalidate: 86400 });

// 12 covers for the hero: [{ id, cover }]. `featured` is the homepage's
// featured-series list (cover_path = full canonical URL).
export async function getHeroWall(featured = []) {
  const week = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  let classics = [];
  try {
    classics = await cachedClassics();
  } catch (err) {
    console.error("hero wall classics failed:", err);
  }
  const era = (lo, hi) => seededShuffle(classics.filter((c) => c.year >= lo && c.year <= hi), week);
  const picks = [...era(0, 1965).slice(0, 3), ...era(1966, 1985).slice(0, 3), ...era(1986, 2100).slice(0, 2)];
  const modern = seededShuffle(
    featured.filter((s) => s?.cover_path).map((s) => ({ id: s.id, cover: s.cover_path })),
    week + 7
  ).slice(0, 12 - picks.length);
  return seededShuffle([...picks, ...modern], week + 13);
}
