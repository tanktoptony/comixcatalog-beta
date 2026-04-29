import Link from "next/link";
import { notFound } from "next/navigation";
import ARTICLES, { getArticle } from "../articles";

export async function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return { title: "Reads · ComixCatalog" };
  return {
    title: `${article.title} · Reads · ComixCatalog`,
    description: article.dek,
  };
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ReadArticlePage({ params }) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  return (
    <main className="reads-article-page">
      <article className="reads-article">
        <p className="reads-article-back">
          <Link href="/reads">← All articles</Link>
        </p>

        <p className="reads-article-kicker">{article.kicker}</p>
        <h1 className="reads-article-title">{article.title}</h1>
        <p className="reads-article-dek">{article.dek}</p>

        <p className="reads-article-meta">
          {formatDate(article.publishedAt)} · {article.readingTime}
        </p>

        <div className="reads-article-body">{article.body()}</div>

        <hr className="reads-article-divider" />

        <p className="reads-article-footer">
          Want more like this? Find us on{" "}
          <a
            href="https://discord.gg/aQruGVnD3y"
            target="_blank"
            rel="noreferrer"
          >
            Discord
          </a>{" "}
          and{" "}
          <a
            href="https://www.reddit.com/r/comixcatalog"
            target="_blank"
            rel="noreferrer"
          >
            r/comixcatalog
          </a>
          , or{" "}
          <Link href="/get-started">start tracking your collection</Link>.
        </p>
      </article>
    </main>
  );
}
