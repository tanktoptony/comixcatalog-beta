import HomeClient from "./HomeClient";
import { getExcitedPicks } from "@/lib/excitedPicksData";
import { getFeaturedSeries } from "@/lib/featuredSeriesData";
import { getHomeData } from "@/lib/homeDispatch";
import { getHeroWall } from "@/lib/heroWall";

// The homepage is static HTML, rebuilt at most hourly. The featured
// carousel, the live catalog numbers and the Dispatch feed are rendered into
// it from cached server reads, so visitors see them on first paint instead
// of after client round trips. The interactive parts (hero search,
// auth-aware CTAs) live in HomeClient.
export const revalidate = 3600;

export default async function HomePage() {
  const [featuredResult, home, excited] = await Promise.all([
    getFeaturedSeries().catch((err) => {
      // Empty falls back to the carousel's own client fetch.
      console.error("homepage featured series failed:", err);
      return [];
    }),
    getHomeData(),
    getExcitedPicks(),
  ]);
  const heroWall = await getHeroWall(featuredResult);
  // Signed-in members get Your shelf, which the static HTML can't know about.
  // This runs before paint and marks <html> when supabase-js has a stored
  // session (same key AuthContext reads), so CSS swaps the hero for a shelf
  // skeleton instead of flashing the marketing page.
  const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/^https?:\/\/([^.]+)\./)?.[1] ?? "";
  const storageKey = `sb-${projectRef}-auth-token`;
  const authHint = `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)})||"null");if(s&&s.user&&s.user.id)document.documentElement.dataset.signedIn="1";}catch(e){/* storage blocked: render signed out */}})();`;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: authHint }} />
      <div className="signed-in-shelf-skeleton" aria-hidden="true"><div /><div /></div>
      <HomeClient
        featured={featuredResult.slice(0, 12)}
        heroWall={heroWall}
        stats={home.stats}
        dispatch={home}
        excited={excited}
      />
    </>
  );
}
