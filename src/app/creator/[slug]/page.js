import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getCreatorPage } from "@/lib/creatorData";
import { buildCreatorSummary, creatorJsonLd } from "@/lib/creatorPage";
import { safeJsonLd } from "@/lib/jsonLd";
import { SITE_URL } from "@/lib/siteUrl";

const roleLabel = (role) => role === "cover" ? "Cover artist" : `${role[0].toUpperCase()}${role.slice(1)}`;
const yearLabel = (run) => run.year_start && run.year_end && run.year_start !== run.year_end
  ? `${run.year_start}-${run.year_end}`
  : String(run.year_start || run.year_end || "Years unknown");

export default async function CreatorPage({ params }) {
  const { slug } = await params;
  const creator = await getCreatorPage(slug);
  if (!creator) notFound();
  const jsonLd = creatorJsonLd(creator, `${SITE_URL}/creator/${creator.slug}`);

  return (
    <main className="page-wrapper creator-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <section className="comic-panel">
        <div className="section-label badge-x">Creator</div>
        <h1 className="hero-title">{creator.name}</h1>
        <p className="creator-intro">{buildCreatorSummary(creator)}</p>

        <section className="creator-section" aria-labelledby="creator-roles">
          <h2 id="creator-roles" className="issue-section-title">Credits by role</h2>
          <div className="creator-role-list">
            {Object.entries(creator.role_counts).filter(([, count]) => count > 0).map(([role, count]) => (
              <span className="pill" key={role}>{roleLabel(role)}: {count.toLocaleString("en-US")}</span>
            ))}
          </div>
        </section>

        {creator.key_issues.length > 0 && (
          <section className="creator-section" aria-labelledby="creator-keys">
            <h2 id="creator-keys" className="issue-section-title">Key issues</h2>
            <ul className="creator-card-list creator-key-list">
              {creator.key_issues.map((issue) => (
                <li key={`${issue.gcd_issue_id}-${issue.reason}`}>
                  {issue.cover && <Image src={issue.cover} alt="" width={64} height={96} loading="lazy" unoptimized />}
                  <div>
                    <Link href={`/issue/gcd-${issue.gcd_issue_id}`}><strong>{issue.series_title} #{issue.issue_number}</strong></Link>
                    {issue.title && <div>{issue.title}</div>}
                    <div className="muted">{issue.reason}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="creator-section" aria-labelledby="creator-runs">
          <h2 id="creator-runs" className="issue-section-title">Runs</h2>
          {creator.runs.length ? (
            <ul className="creator-card-list">
              {creator.runs.map((run) => (
                <li key={run.id}>
                  <div>
                    <Link href={`/series/${run.id}`}><strong>{run.title}</strong></Link>
                    <div className="muted">{[run.publisher, yearLabel(run)].filter(Boolean).join(" · ")}</div>
                    <div>{run.roles.map(roleLabel).join(", ")} · {run.issue_range}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="muted">No catalog runs are available for these credits.</p>}
        </section>

        <p className="creator-attribution">
          Credits from the <a href="https://www.comics.org/">Grand Comics Database</a> (CC BY-SA 4.0)
        </p>
      </section>
    </main>
  );
}
