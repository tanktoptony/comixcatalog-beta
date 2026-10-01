import Link from "next/link";
import MarketplaceGrid from "@/components/MarketplaceGrid";
import { getListings } from "@/lib/marketplace";

export const metadata = {
  title: "Marketplace",
  description:
    "Comics for sale from real collections on ComixCatalog. Every listing is linked to its exact issue, with condition and grade up front. Make an offer directly to the collector.",
};

// Rebuilt at most every 2 minutes from the cached listings.
export const revalidate = 120;

export default async function MarketplacePage() {
  let listings = null;
  try {
    listings = await getListings();
  } catch (err) {
    console.error("marketplace page listings failed:", err);
  }
  const sellers = listings ? new Set(listings.map((l) => l.seller)).size : 0;

  return (
    <section className="marketplace-page">
      <div className="mkt-hero mkt-hero-live">
        <div className="mkt-status-pill">Beta</div>
        <h1 className="mkt-title">Comics from real collections.</h1>
        <p className="mkt-lede">
          Every listing is a book a collector actually owns, linked to its exact
          issue, with condition and grade up front. See something you want?
          Make an offer straight to the collector. No fees during the beta.
        </p>
        {listings && listings.length > 0 && (
          <p className="mkt-counts">
            <b>{listings.length.toLocaleString("en-US")}</b> book{listings.length === 1 ? "" : "s"} for sale from{" "}
            <b>{sellers.toLocaleString("en-US")}</b> collector{sellers === 1 ? "" : "s"}
          </p>
        )}
        <div className="mkt-hero-ctas">
          <Link href="/library?tab=for_sale" className="mkt-cta-primary">
            Sell from your collection →
          </Link>
        </div>
      </div>

      {listings === null ? (
        <p className="mkt-empty">The marketplace couldn&rsquo;t load right now. Please try again in a minute.</p>
      ) : listings.length === 0 ? (
        <p className="mkt-empty">
          Nothing listed yet. Be the first: open your <Link href="/library">library</Link> and hit
          &ldquo;List everything for sale&rdquo;, or mark single books for sale.
        </p>
      ) : (
        <MarketplaceGrid listings={listings} />
      )}

      <div className="mkt-how">
        <div><b>Listed from real collections.</b> Sellers list straight from their ComixCatalog library, so the issue and variant are exact.</div>
        <div><b>Condition up front.</b> Raw grade, slab company and certified grade where the seller has them.</div>
        <div><b>Make an offer.</b> Prices start at the book&rsquo;s estimated value from real sold comps. Message the collector to deal.</div>
      </div>
    </section>
  );
}
