function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function sameLabel(a, b) {
  return String(a ?? "").trim().toLocaleLowerCase() === String(b ?? "").trim().toLocaleLowerCase();
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// GCD dates are "YYYY-MM-DD" with 00 for an unknown month or day
// ("1963-09-00" is a September 1963 cover). Anything else passes through.
export function formatGcdDate(value) {
  const match = String(value ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return present(value) ? String(value).trim() : null;
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return year;
  return Number(day) ? `${monthName} ${Number(day)}, ${year}` : `${monthName} ${year}`;
}

// "0.12 USD; 0.15 CAD" -> "$0.12 · 0.15 CAD". Only USD gets a symbol; other
// currencies stay as GCD wrote them.
const CURRENCY_SYMBOLS = { USD: "$", CAD: "$", GBP: "£" };

export function formatGcdPrice(value) {
  if (!present(value)) return null;
  return String(value)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(\d+(?:\.\d+)?)\s*([A-Z]{3})$/i);
      if (!match) return part;
      const [, amount, rawCode] = match;
      const code = rawCode.toUpperCase();
      return `${CURRENCY_SYMBOLS[code] ?? ""}${amount} ${code}`;
    })
    .join(" · ");
}

const CREDIT_NOTE = /\s*\((?:credited|uncredited|signed\s+as\s+[^)]+)\)\s*/gi;
const CHARACTER_NOTE = /\s*\((featured|cameo|flashback)\)\s*$/i;

export function stripGcdCreditNoise(value) {
  const notes = [];
  const name = String(value ?? "").replace(CREDIT_NOTE, (note) => {
    notes.push(note.trim().slice(1, -1));
    return " ";
  }).replace(/\s+/g, " ").trim();
  return { name, note: notes.join("; ") };
}

export function stripGcdCharacterNoise(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(CHARACTER_NOTE);
  if (!match) return { name: raw, note: "" };
  return { name: raw.slice(0, match.index).trim(), note: match[1].toLocaleLowerCase() };
}

export function parseGcdCreditList(value) {
  return String(value ?? "").split(/\s*;\s*/).map(stripGcdCreditNoise).filter((item) => item.name);
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
    { label: "Cover date", value: formatGcdDate(details.keydate) || issue?.display_date || issue?.publication_date },
    { label: "On sale", value: formatGcdDate(details.on_sale_date) },
    { label: "Cover price", value: formatGcdPrice(details.price) },
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

