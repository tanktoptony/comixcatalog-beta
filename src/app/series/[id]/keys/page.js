import Link from "next/link";
import KeyTimeline from "@/components/KeyTimeline";
import KeyIssueRows from "@/components/KeyIssueRows";
import ShareButton from "@/components/ShareButton";
import { getKeyRulings, getSeriesData } from "@/lib/pageData";
import { groupKeysByEra, seriesYearLabel } from "@/lib/shareableSeries";

export default async function SeriesKeysPage({ params }) {
  const { id } = await params;
  const series = await getSeriesData(id);
  if (!series) return <p>Series not found.</p>;
  const keys = series.key_issues ?? [];
  const majorCount = keys.filter((issue) => Number(issue.tier) === 1).length;
  const rulings = await getKeyRulings(keys.map((issue) => issue.gcd_issue_id));

  return (
    <article className="shareable-series-page keys-page">
      <header className="shareable-hero">
        <nav><Link href={`/series/${id}`}>← Back to {series.title}</Link></nav>
        <p className="shareable-eyebrow">Collector guide</p>
        <h1>Every {series.title} key issue</h1>
        <p className="shareable-years">{seriesYearLabel(series)}</p>
        <p className="shareable-statline">{keys.length} key issue{keys.length === 1 ? "" : "s"}, {majorCount} major</p>
        <ShareButton title={`Every ${series.title} key issue`} />
      </header>
      {keys.length > 0 ? (
        <>
          <KeyTimeline issues={keys} />
          <div className="key-era-groups">
            <KeyIssueRows groups={groupKeysByEra(keys)} rulings={rulings} />
          </div>
        </>
      ) : (
        <div className="shareable-empty">No key issues are cataloged for this series yet.</div>
      )}
    </article>
  );
}
