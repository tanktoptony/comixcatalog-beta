import Link from "next/link";
import RunChecklist from "@/components/RunChecklist";
import ShareButton from "@/components/ShareButton";
import { getSeriesData } from "@/lib/pageData";
import { buildChecklistRows, seriesYearLabel } from "@/lib/shareableSeries";

export default async function SeriesChecklistPage({ params }) {
  const { id } = await params;
  const series = await getSeriesData(id);
  if (!series) return <p>Series not found.</p>;
  const rows = buildChecklistRows(series.issues, series.key_issues);
  const keyCount = (series.key_issues ?? []).length;

  return (
    <article className="shareable-series-page checklist-page">
      <header className="shareable-hero">
        <nav><Link href={`/series/${id}`}>← Back to {series.title}</Link></nav>
        <p className="shareable-eyebrow">Printable run checklist</p>
        <h1>{series.title} checklist</h1>
        <p className="shareable-years">{seriesYearLabel(series)}</p>
        <p className="shareable-statline">{rows.length} issue{rows.length === 1 ? "" : "s"}, {keyCount} key{keyCount === 1 ? "" : "s"}</p>
        <ShareButton title={`${series.title} checklist`} />
      </header>
      {rows.length > 0 ? (
        <RunChecklist rows={rows} seriesId={id} />
      ) : (
        <div className="shareable-empty">No issue data is available for this series.</div>
      )}
    </article>
  );
}
