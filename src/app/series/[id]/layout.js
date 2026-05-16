const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://comixcatalog.com";

export async function generateMetadata({ params }) {
  const { id } = await params;

  try {
    const res = await fetch(`${SITE_URL}/api/series/${id}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error("series fetch failed");
    const data = await res.json();
    const series = data?.series;
    if (!series) throw new Error("no series");

    const yearRange =
      series.year_start && series.year_end && series.year_start !== series.year_end
        ? `${series.year_start}–${series.year_end}`
        : series.year_start
        ? String(series.year_start)
        : "";
    const title = `${series.title}${yearRange ? ` (${yearRange})` : ""}`;
    const description = [
      series.title,
      series.publisher,
      yearRange,
      series.issue_count
        ? `${series.issue_count} issue${series.issue_count === 1 ? "" : "s"}`
        : null,
      "Indexed on ComixCatalog.",
    ]
      .filter(Boolean)
      .join(" · ");

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
