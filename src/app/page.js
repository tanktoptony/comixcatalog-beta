import HomeClient from "./HomeClient";
import { getFeaturedSeries } from "@/lib/featuredSeriesData";

// The homepage is static HTML, rebuilt at most hourly. The featured
// carousel is rendered into it from the cached list, so visitors see covers
// on first paint instead of after a multi-second /api/comics round trip. The
// interactive parts (hero search, auth-aware CTAs) live in HomeClient.
export const revalidate = 3600;

export default async function HomePage() {
  let featured = [];
  try {
    featured = (await getFeaturedSeries()).slice(0, 12);
  } catch (err) {
    // Empty falls back to the carousel's own client fetch.
    console.error("homepage featured series failed:", err);
  }
  return <HomeClient featured={featured} />;
}
