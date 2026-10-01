import HomeClient from "./HomeClient";
import { getFeaturedSeries } from "@/lib/featuredSeriesData";
import { getHomeData } from "@/lib/homeDispatch";

// The homepage is static HTML, rebuilt at most hourly. The featured
// carousel, the live catalog numbers and the Dispatch feed are rendered into
// it from cached server reads, so visitors see them on first paint instead
// of after client round trips. The interactive parts (hero search,
// auth-aware CTAs) live in HomeClient.
export const revalidate = 3600;

export default async function HomePage() {
  const [featuredResult, home] = await Promise.all([
    getFeaturedSeries().catch((err) => {
      // Empty falls back to the carousel's own client fetch.
      console.error("homepage featured series failed:", err);
      return [];
    }),
    getHomeData(),
  ]);
  return <HomeClient featured={featuredResult.slice(0, 12)} stats={home.stats} dispatch={home} />;
}
