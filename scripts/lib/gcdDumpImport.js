import { slugify } from "./gcdCredits.js";

export const CREDIT_ROLES = new Map([
  [1, ["writer"]],
  [2, ["penciller"]],
  [3, ["inker"]],
  [4, ["colorist"]],
  [5, ["letterer"]],
  [6, []],
  [7, ["penciller", "inker"]],
  [8, ["penciller", "inker", "colorist"]],
  [9, ["penciller"]],
  [10, ["writer", "penciller", "inker"]],
  [11, ["writer", "penciller", "inker", "colorist"]],
  [12, ["writer", "penciller", "inker", "letterer"]],
  [13, ["writer", "penciller", "inker", "colorist", "letterer"]],
  [14, ["penciller", "inker", "letterer"]],
]);

export function rolesForCreditType(typeId, storyType) {
  if (
    String(storyType ?? "")
      .trim()
      .toLowerCase() === "cover"
  )
    // Only the art on a cover makes someone a cover artist. Cover lettering,
    // coloring and blurb script (Sam Rosen, Stan Goldberg, Stan Lee on
    // X-Men 1963) are credited on the cover sequence too, matching how
    // creditsForIssue only reads pencils and inks there.
    return (CREDIT_ROLES.get(Number(typeId)) ?? []).some((role) => role === "penciller" || role === "inker")
      ? ["cover"]
      : [];
  return CREDIT_ROLES.get(Number(typeId)) ?? [];
}

export function reserveSlug(name, usedSlugs) {
  const base = slugify(name) || "creator";
  let slug = base;
  for (let suffix = 2; usedSlugs.has(slug); suffix += 1)
    slug = `${base}-${suffix}`;
  usedSlugs.add(slug);
  return slug;
}

export function unambiguousLegacyAttachments(legacyRows, dumpCreators) {
  const idsByName = new Map();
  for (const row of dumpCreators) {
    if (!row.name) continue;
    if (!idsByName.has(row.name)) idsByName.set(row.name, new Set());
    idsByName.get(row.name).add(Number(row.gcd_creator_id));
  }
  return legacyRows.flatMap((row) => {
    const ids = idsByName.get(row.name);
    return ids?.size === 1 ? [{ ...row, gcd_creator_id: [...ids][0] }] : [];
  });
}

export function dedupeRows(rows, fields) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = fields.map((field) => row[field]).join("\0");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function aggregateSeriesCredits(rows) {
  const aggregator = createSeriesCreditAggregator();
  aggregator.add(rows);
  return aggregator.rows();
}

export function createSeriesCreditAggregator() {
  const grouped = new Map();

  function add(rows) {
    for (const row of dedupeRows(rows, [
      "series_gcd_id",
      "gcd_issue_id",
      "creator_id",
      "role",
    ])) {
      const key = `${row.series_gcd_id}\0${row.creator_id}\0${row.role}`;
      const year =
        row.year != null && Number.isInteger(Number(row.year))
          ? Number(row.year)
          : null;
      const current = grouped.get(key) ?? {
        series_gcd_id: Number(row.series_gcd_id),
        creator_id: Number(row.creator_id),
        role: row.role,
        issue_ids: new Set(),
        year_first: null,
        year_last: null,
      };
      current.issue_ids.add(Number(row.gcd_issue_id));
      if (year != null) {
        current.year_first =
          current.year_first == null
            ? year
            : Math.min(current.year_first, year);
        current.year_last =
          current.year_last == null ? year : Math.max(current.year_last, year);
      }
      grouped.set(key, current);
    }
  }

  function rows() {
    return [...grouped.values()].map(({ issue_ids, ...row }) => ({
      ...row,
      issue_count: issue_ids.size,
    }));
  }

  return { add, rows };
}
