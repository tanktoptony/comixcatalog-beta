import { getSeriesData } from "@/lib/pageData";
import { buildKeysDescription, seriesYearLabel } from "@/lib/shareableSeries";
import { SITE_URL } from "@/lib/siteUrl";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const series = await getSeriesData(id);
  if (!series) return {};
  const title = `Every ${series.title} (${seriesYearLabel(series)}) key issue | ComixCatalog`;
  const description = buildKeysDescription(series);
  const url = `${SITE_URL}/series/${id}/keys`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}

export default function KeysLayout({ children }) {
  return children;
}
