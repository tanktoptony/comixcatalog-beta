import { getSeriesData } from "@/lib/pageData";
import { buildChecklistRows, seriesYearLabel } from "@/lib/shareableSeries";
import { SITE_URL } from "@/lib/siteUrl";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const series = await getSeriesData(id);
  if (!series) return {};
  const rows = buildChecklistRows(series.issues, series.key_issues);
  const title = `${series.title} (${seriesYearLabel(series)}) checklist: ${rows.length} issues, ${(series.key_issues ?? []).length} keys | ComixCatalog`;
  const description = `A printable ${series.title} run checklist with ${rows.length} issues and ${(series.key_issues ?? []).length} key issues.`;
  const url = `${SITE_URL}/series/${id}/checklist`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}

export default function ChecklistLayout({ children }) {
  return children;
}
