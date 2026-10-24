import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getPublisherPage } from "@/lib/publisherData";
import { SITE_URL } from "@/lib/siteUrl";

export const revalidate = 86400;

const years = (run) => run.year_start && run.year_end && run.year_start !== run.year_end
  ? `${run.year_start}-${run.year_end}`
  : String(run.year_start || run.year_end || "Years unknown");
const issues = (n) => `${n.toLocaleString("en-US")} issue${n === 1 ? "" : "s"}`;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const publisher = await getPublisherPage(slug);
  if (!publisher) return {};
  const title = `${publisher.name} comics: every series`;
  const description = `${publisher.series_count.toLocaleString("en-US")} ${publisher.name} series on ComixCatalog${publisher.since ? `, from ${publisher.since} to today` : ""}. Browse the biggest runs and the newest launches, then track what you own.`;
  const url = `${SITE_URL}/publisher/${publisher.slug}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url } };
}

function RunList({ runs }) {
  return (
    <ul className="creator-run-list">
      {runs.map((run) => (
        <li key={run.id}>
          <Link href={`/series/${run.id}`} className="creator-run-card">
            <Image src={run.cover || "/fallback-cover.png"} alt="" width={72} height={108} loading="lazy" unoptimized />
            <div>
              <div className="creator-run-title"><strong>{run.title}</strong></div>
              <div className="muted">{years(run)} · {issues(run.issue_count)}</div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function PublisherPage({ params }) {
  const { slug } = await params;
  const publisher = await getPublisherPage(slug);
  if (!publisher) notFound();

  return (
    <main className="page-wrapper creator-page">
      <section className="comic-panel">
        <div className="section-label badge-x">Publisher</div>
        <h1 className="hero-title">{publisher.name}</h1>
        <div className="creator-stats">
          <div><strong>{publisher.series_count.toLocaleString("en-US")}</strong><span>Series</span></div>
          {publisher.since && <div><strong>{publisher.since}</strong><span>First series</span></div>}
        </div>

        {publisher.newest.length > 0 && (
          <section className="creator-section" aria-labelledby="publisher-new">
            <h2 id="publisher-new" className="issue-section-title">New series</h2>
            <RunList runs={publisher.newest} />
          </section>
        )}

        <section className="creator-section" aria-labelledby="publisher-biggest">
          <h2 id="publisher-biggest" className="issue-section-title">Biggest runs</h2>
          {publisher.biggest.length
            ? <RunList runs={publisher.biggest} />
            : <p className="creator-empty muted">No series with covers yet.</p>}
        </section>

      </section>
    </main>
  );
}
