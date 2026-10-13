function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function sameLabel(a, b) {
  return String(a ?? "").trim().toLocaleLowerCase() === String(b ?? "").trim().toLocaleLowerCase();
}

export function buildIssueDetailsRows(issue) {
  const details = issue?.details ?? {};
  const candidates = [
    { label: "Publisher", value: issue?.publisher },
    !sameLabel(details.indicia_publisher, issue?.publisher)
      ? { label: "Indicia publisher", value: details.indicia_publisher }
      : null,
    { label: "Series", value: issue?.series_title, href: issue?.series_id ? `/series/${issue.series_id}` : null },
    { label: "Issue", value: issue?.issue_number },
    { label: "Variant", value: details.variant_name },
    { label: "Cover date", value: details.keydate || issue?.display_date || issue?.publication_date },
    { label: "On sale", value: details.on_sale_date },
    { label: "Cover price", value: details.price },
    { label: "Pages", value: details.page_count },
    { label: "Frequency", value: details.indicia_frequency },
    { label: "Rating", value: details.rating },
    { label: "Editing", value: details.editing },
    { label: "UPC / Barcode", value: details.barcode },
    { label: "ISBN", value: details.isbn },
  ];
  return candidates.filter((row) => row && present(row.value));
}

export function humanizeStoryType(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Story";
  const normalized = raw.toLocaleLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const labels = {
    "comic story": "Story",
    story: "Story",
    "text story": "Text story",
    pinup: "Pin-up",
    "pin up": "Pin-up",
    cover: "Cover",
  };
  return labels[normalized] ?? `${normalized.charAt(0).toLocaleUpperCase()}${normalized.slice(1)}`;
}

export function buildStoryCreditSummary(story) {
  const fields = [
    ["Script", story?.script],
    ["Pencils", story?.pencils],
    ["Inks", story?.inks],
    ["Colors", story?.colors],
    ["Letters", story?.letters],
  ];
  return fields.filter(([, value]) => present(value)).map(([label, value]) => `${label} ${String(value).trim()}`).join(" · ");
}

