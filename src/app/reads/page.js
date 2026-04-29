import Link from "next/link";
import ARTICLES from "./articles";

export const metadata = {
  title: "Reads · ComixCatalog",
  description:
    "Articles, guides, and collector deep-dives from the ComixCatalog editorial team.",
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ReadsPage() {
  return (
    <main className="reads-page">
      <header className="reads-hero">
        <p className="reads-kicker">Reads</p>
        <h1 className="reads-title">Articles for collectors</h1>
        <p className="reads-lede">
          Grading guides, market deep-dives, behind-the-database notes, and
          everything else worth reading about comic collecting.
        </p>
      </header>

      <ul className="reads-list">
        {ARTICLES.map((a) => (
          <li key={a.slug} className="reads-card">
            <Link href={`/reads/${a.slug}`} className="reads-card-link">
              <p className="reads-card-kicker">{a.kicker}</p>
              <h2 className="reads-card-title">{a.title}</h2>
              <p className="reads-card-dek">{a.dek}</p>
              <p className="reads-card-meta">
                {formatDate(a.publishedAt)} · {a.readingTime}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
