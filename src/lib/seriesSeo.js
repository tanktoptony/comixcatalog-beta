export function buildSeriesIntro({
  title,
  publisher,
  issue_count: issueCount,
  year_start: yearStart,
  year_end: yearEnd,
  format_noun: formatNoun = "series",
} = {}) {
  const safeTitle = title || "This title";
  const type = formatNoun || "series";
  const count = Number(issueCount);
  const countedType =
    type === "series" && Number.isFinite(count) && count > 0
      ? `${count}-issue series`
      : type;
  const source = publisher ? ` from ${publisher}` : "";
  const start = Number(yearStart) || null;
  const end = Number(yearEnd) || null;
  let dates = "";
  if (start && end && start !== end) dates = `, published from ${start} to ${end}`;
  else if (start || end) dates = `, published in ${start || end}`;
  return `${safeTitle} is a ${countedType}${source}${dates}.`;
}

export function buildSeriesDescription(series, maxLength = 160) {
  const intro = buildSeriesIntro(series);
  const numbers = (series?.key_issues ?? [])
    .map((keyIssue) => keyIssue.issue_number)
    .filter(Boolean);
  const full = numbers.length
    ? `${intro} Key issues: ${numbers.map((number) => `#${number}`).join(", ")}.`
    : intro;
  if (full.length <= maxLength) return full;
  if (numbers.length) {
    const suffix = ` Key issues: ${numbers.map((number) => `#${number}`).join(", ")}.`;
    const introLimit = Math.max(1, maxLength - suffix.length - 3);
    return `${intro.slice(0, introLimit).trimEnd()}...${suffix}`;
  }
  return `${intro.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

export function seriesJsonLd(series, url) {
  if (!series) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ComicSeries",
    name: series.title,
    url,
    ...(series.publisher
      ? { publisher: { "@type": "Organization", name: series.publisher } }
      : {}),
    ...(series.year_start ? { startDate: String(series.year_start) } : {}),
    ...(series.year_end ? { endDate: String(series.year_end) } : {}),
    ...(series.featured_cover ? { image: series.featured_cover } : {}),
  };
}
