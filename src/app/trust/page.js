import Link from "next/link";

export default function TrustPage() {
  return (
    <main className="page-shell">
      <section className="content-panel">
        <div className="section-label badge-x">Trust</div>
        <h1>Trust & Safety</h1>
        <p>
          The ComixCatalog marketplace is in beta. Collectors list books from
          their own libraries, and buyers message them to make an offer. No money
          moves through ComixCatalog yet, so there&apos;s no buyer protection from us.
          Here&apos;s how to trade safely.
        </p>
        <h2>Trading safely</h2>
        <ul>
          <li>
            Pay with PayPal Goods & Services, not Friends & Family. Goods &
            Services gives you PayPal&apos;s buyer protection if a book never shows
            up or isn&apos;t as described.
          </li>
          <li>Ask for photos of the exact copy, front and back, before you pay.</li>
          <li>
            For slabbed books, check the cert number on the grading company&apos;s
            website.
          </li>
          <li>
            Keep the conversation in ComixCatalog messages so there&apos;s a record.
          </li>
          <li>
            Walk away from anyone who pushes gift cards, wire transfers, or
            payment apps with no protection.
          </li>
        </ul>
        <h2>What you can see about a seller</h2>
        <p>
          Every listing shows the seller&apos;s username, how long they&apos;ve been
          collecting on ComixCatalog, and their other books for sale. Public
          profiles show their collection. We don&apos;t have seller ratings yet.
        </p>
        <h2>Something wrong?</h2>
        <p>
          If a listing or a member looks off, email{" "}
          <a href="mailto:comixcatalog@gmail.com">comixcatalog@gmail.com</a> with a
          link and we&apos;ll look into it.
        </p>
        <Link href="/marketplace" className="primary-btn">
          View Marketplace
        </Link>
      </section>
    </main>
  );
}
