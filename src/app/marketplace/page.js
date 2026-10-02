import MarketplaceBrowser from "@/components/MarketplaceBrowser";
import { getListings } from "@/lib/marketplace";

export const metadata = {
  title: "Marketplace",
  description:
    "Comics for sale from real collections on ComixCatalog. Search or browse by publisher and series, with condition and grade up front. Make an offer directly to the collector.",
};

// Rebuilt at most every 2 minutes from the cached listings (sooner when a
// listing changes, see revalidateListings). Search, filters and pages run
// in the browser over this list (src/components/MarketplaceBrowser.js).
export const revalidate = 120;

export default async function MarketplacePage() {
  let listings = null;
  try {
    listings = await getListings();
  } catch (err) {
    console.error("marketplace page listings failed:", err);
  }

  return (
    <section className="marketplace-page">
      {listings === null ? (
        <p className="mk-empty">The marketplace couldn&rsquo;t load right now. Please try again in a minute.</p>
      ) : (
        <MarketplaceBrowser listings={listings} />
      )}
    </section>
  );
}
