import Link from "next/link";
import { notFound } from "next/navigation";
import { getListing, getListingsForIssue } from "@/lib/marketplace";
import { conditionLabel, contactLabel, formatValue, offerHref, shippingLabel } from "@/lib/marketplaceFormat";
import { SITE_URL } from "@/lib/siteUrl";
import ListingGallery from "@/components/ListingGallery";
import { safeJsonLd } from "@/lib/jsonLd";

// One copy for sale, Discogs item-page style: the copy, its condition, the
// seller, the price, and the way to buy (an offer or a message while there's
// no checkout). Server-rendered from the cached listing read.

export const revalidate = 120;

const titleOf = (l) => `${l.title}${l.issueNumber ? ` #${l.issueNumber}` : ""}`;

export async function generateMetadata({ params }) {
  const { id } = await params;
  const l = await getListing(id).catch(() => null);
  if (!l) return { title: "Listing not found" };
  const price = l.price != null ? formatValue(l.price) : null;
  const title = `${titleOf(l)}${l.year ? ` (${l.year})` : ""} for sale`;
  const description = [conditionLabel(l), price ?? "Open to offers", `from @${l.seller}`, "on ComixCatalog"].join(" · ");
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/listing/${id}` },
    openGraph: { title, description, url: `${SITE_URL}/listing/${id}`, images: l.cover ? [{ url: l.cover }] : [] },
  };
}

export default async function ListingPage({ params }) {
  const { id } = await params;
  const l = await getListing(id);
  if (!l) notFound();

  const others = (await getListingsForIssue(l.gcdIssueId).catch(() => [])).filter((o) => o.id !== l.id);
  const sold = l.status === "sold";
  const reserved = l.status === "reserved";
  const since = new Date(l.sellerInfo.since).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const jsonLd =
    l.price != null && !sold
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: titleOf(l),
          image: l.photos?.[0]?.url || l.cover || undefined,
          description: l.notes || `${titleOf(l)}, ${conditionLabel(l)}`,
          offers: {
            "@type": "Offer",
            price: l.price.toFixed(2),
            priceCurrency: "USD",
            availability: reserved ? "https://schema.org/LimitedAvailability" : "https://schema.org/InStock",
            itemCondition: "https://schema.org/UsedCondition",
            url: `${SITE_URL}/listing/${l.id}`,
            seller: { "@type": "Person", name: l.seller },
          },
        }
      : null;

  return (
    <main className="lp">
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />}
      <nav className="lp-crumbs" aria-label="Breadcrumb">
        <Link href="/marketplace">Marketplace</Link> <span className="mk-beta">Beta</span>
        {l.publisher && (
          <>
            <span aria-hidden="true">/</span>
            <Link href={`/marketplace?publisher=${encodeURIComponent(l.publisher)}`}>{l.publisher.replace(/ Comics$/, "")}</Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        <span>{titleOf(l)}</span>
      </nav>

      <div className="lp-grid">
        <div className="lp-cover">
          <ListingGallery photos={l.photos} cover={l.cover} title={titleOf(l)} />
        </div>

        <div className="lp-main">
          <h1>
            {titleOf(l)}
            {l.year ? <span> ({l.year})</span> : null}
          </h1>
          <p className="lp-sub">
            {[l.publisher, l.variant].filter(Boolean).join(" · ")}
            {" · "}
            <Link href={l.href}>See this issue in the catalog</Link>
          </p>

          <div className="lp-buy">
            {sold ? (
              <div className="lp-status">Sold</div>
            ) : (
              <>
                <div className="lp-price">
                  {l.price != null ? (
                    <b>{formatValue(l.price)}</b>
                  ) : (
                    <b>Open to offers</b>
                  )}
                </div>
                {shippingLabel(l) && <div className="lp-ship">{shippingLabel(l)}</div>}
                {reserved ? (
                  <div className="lp-status">On hold</div>
                ) : (
                  <Link href={offerHref(l)} className="lp-cta">
                    {contactLabel(l)}
                  </Link>
                )}
                <p className="lp-fine">No fees during the beta. You and the seller work out payment and shipping by message.</p>
              </>
            )}
          </div>

          <section className="lp-block">
            <h2>Condition</h2>
            <dl className="lp-facts">
              <dt>Grade</dt>
              <dd>{conditionLabel(l)}</dd>
              {l.certNumber && (
                <>
                  <dt>Cert</dt>
                  <dd>{l.certNumber}</dd>
                </>
              )}
              <dt>Restored</dt>
              <dd>{l.restored ? "Yes" : "No"}</dd>
              <dt>Signed</dt>
              <dd>{l.signed ? "Yes" : "No"}</dd>
            </dl>
            {l.notes ? <p className="lp-notes">{l.notes}</p> : <p className="lp-muted">The seller hasn&rsquo;t added condition notes. Ask them before you buy.</p>}
            {l.photos.length === 0 && <p className="lp-muted">No seller photos yet, so the image is the catalog cover. Ask for photos of this exact copy.</p>}
          </section>

          <section className="lp-block lp-seller">
            <h2>Seller</h2>
            <Link href={`/u/${encodeURIComponent(l.seller)}`} className="lp-seller-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.sellerInfo.avatar} alt="" width={44} height={44} />
              <span>
                <b>@{l.seller}</b>
                <small>
                  Collecting on ComixCatalog since {since}
                  {l.sellerInfo.founder ? " · Founding Collector" : ""}
                </small>
              </span>
            </Link>
            {l.sellerInfo.otherListings > 0 && (
              <Link href={`/u/${encodeURIComponent(l.seller)}?tab=for_sale`} className="lp-link">
                {l.sellerInfo.otherListings.toLocaleString("en-US")} more {l.sellerInfo.otherListings === 1 ? "book" : "books"} for sale from @{l.seller}
              </Link>
            )}
          </section>

          {others.length > 0 && (
            <section className="lp-block">
              <h2>Other copies of this issue</h2>
              <ul className="lp-others">
                {others.slice(0, 8).map((o) => (
                  <li key={o.id}>
                    <Link href={`/listing/${o.id}`}>
                      <span>{conditionLabel(o)}</span>
                      <span>@{o.seller}</span>
                      <b>{o.price != null ? formatValue(o.price) : "Offers"}</b>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
