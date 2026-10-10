export function buildSeriesIntro({
  title,
  publisher,
  issue_count: issueCount,
  year_start: yearStart,
  year_end: yearEnd,
  format_noun: formatNoun = "series",
  top_creators: topCreators,
  creator_credited_issues: creatorCreditedIssues,
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
  const additions = [];
  const writer = topCreators?.writers?.[0];
  const artist = topCreators?.artists?.[0];
  const writerDenominator = Number(creatorCreditedIssues?.writers) || count;
  const artistDenominator = Number(creatorCreditedIssues?.artists) || count;
  if (writerDenominator > 0 && writer?.issues / writerDenominator >= 0.4) {
    additions.push(`Written mostly by ${writer.name}`);
  }
  if (artistDenominator > 0 && artist?.issues / artistDenominator >= 0.4) {
    additions.push(`art mostly by ${artist.name}`);
  }
  return `${safeTitle} is a ${countedType}${source}${dates}.${additions.length ? ` ${additions.join(", ")}.` : ""}`;
}

export function buildSeriesDescription(series, maxLength = 160) {
  const intro = buildSeriesIntro(series);
  const writer = series?.top_creators?.writers?.[0]?.name;
  const artist = series?.top_creators?.artists?.[0]?.name;
  const creatorText = writer || artist
    ? ` ${writer ? `Writer: ${writer}.` : ""}${artist ? ` Artist: ${artist}.` : ""}`
    : "";
  const numbers = (series?.key_issues ?? [])
    .map((keyIssue) => keyIssue.issue_number)
    .filter(Boolean);
  const full = numbers.length
    ? `${intro}${creatorText} Key issues: ${numbers.map((number) => `#${number}`).join(", ")}.`
    : `${intro}${creatorText}`;
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
