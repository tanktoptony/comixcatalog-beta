import Link from "next/link";

export const metadata = {
  title: "Contribution Guidelines",
  description: "How to report missing or incorrect comic catalog data to ComixCatalog.",
};

export default function ContributeGuidelinesPage() {
  return (
    <main className="page-shell">
      <section className="content-panel">
        <div className="section-label badge-x">Contribute</div>
        <h1>Contribution Guidelines</h1>
        <p>
          ComixCatalog&apos;s catalog comes from the Grand Comics Database and ComicVine, plus fixes we make by hand. If something is wrong, we want to know.
        </p>
        <h2>Spotted a mistake?</h2>
        <ul>
          <li>A wrong or missing cover</li>
          <li>A missing issue or a whole missing series</li>
          <li>A wrong creator credit, date or price</li>
        </ul>
        <p>
          Email <a href="mailto:comixcatalog@gmail.com">comixcatalog@gmail.com</a> with a link to the page and what&apos;s wrong. A source helps (a GCD page, a photo of your copy, an indicia).
        </p>
        <Link href="/search" className="primary-btn">
          Search the catalog
        </Link>
      </section>
    </main>
  );
}
