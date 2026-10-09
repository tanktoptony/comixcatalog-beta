import { SITE_URL } from "@/lib/siteUrl";
import { getSeriesData } from "@/lib/pageData";
import { buildSeriesDescription } from "@/lib/seriesSeo";

export async function generateMetadata({ params }) {
  const { id } = await params;

  try {
    // Same cached read the page itself renders from (src/lib/pageData.js),
    // instead of a separate HTTP round trip to our own API.
    const series = await getSeriesData(id);
    if (!series) throw new Error("no series");

    const yearRange =
      series.year_start && series.year_end && series.year_start !== series.year_end
        ? `${series.year_start}–${series.year_end}`
        : series.year_start
        ? String(series.year_start)
        : "";
    const title = `${series.title}${yearRange ? ` (${yearRange})` : ""}`;
    const description = buildSeriesDescription(series);

    return {
      title,
      description,
      openGraph: {
        title: `${title} — ComixCatalog`,
        description,
        url: `${SITE_URL}/series/${id}`,
        type: "website",
        images: series.featured_cover
          ? [{ url: series.featured_cover, alt: title }]
          : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title: `${title} — ComixCatalog`,
        description,
        images: series.featured_cover ? [series.featured_cover] : undefined,
      },
      alternates: { canonical: `${SITE_URL}/series/${id}` },
    };
  } catch {
    return {};
  }
}

export default function SeriesLayout({ children }) {
  return children;
}
