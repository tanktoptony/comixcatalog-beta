import { formatTag } from "./seriesFormat.js";

export const EDITION_GROUP_ORDER = [
  "TPB",
  "HC",
  "Deluxe",
  "Omnibus",
  "Compendium",
  "Absolute",
  "Library Edition",
  "Artist's Edition",
  "Collected",
  "Graphic Novel",
  "Specials",
];

const COLLECTED_GROUPS = new Set(EDITION_GROUP_ORDER.slice(0, -1));

export function editionGroup({ title, format, role }) {
  const tag = formatTag({ name: title, ...format });
  const label = role === "special"
    ? "Specials"
    : COLLECTED_GROUPS.has(tag) ? tag : "Collected";
  return {
    label,
    slug: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  };
}

export function summarizeEditions({ work, editions }) {
  const grouped = new Map();
  const sorted = [...editions].sort((a, b) => Number(a.gcd_id) - Number(b.gcd_id));

  for (const edition of sorted) {
    const { label } = editionGroup(edition);
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label).push(edition);
  }

  const groups = EDITION_GROUP_ORDER.filter((label) => grouped.has(label)).map((label) => {
    const rows = grouped.get(label);
    const seriesId = rows.length === 1 ? rows[0].id : null;
    const { slug } = editionGroup(rows[0]);
    return {
      label,
      books: rows.reduce((sum, row) => sum + Math.max(1, Number(row.issue_count) || 0), 0),
      series_count: rows.length,
      series_id: seriesId,
      cover_path: rows.find((row) => row.card_cover_path)?.card_cover_path ?? null,
      href: `/work/${work.id}?tab=${slug}`,
    };
  });

  return {
    total_books: groups.reduce((sum, group) => sum + group.books, 0),
    groups,
  };
}

export function foldWorks(rows) {
  const workIds = new Set(rows.map((row) => Number(row.gcd_id)).filter(Number.isFinite));
  return rows.filter((row) => !Number.isFinite(Number(row.work_gcd_id)) || !workIds.has(Number(row.work_gcd_id)));
}
