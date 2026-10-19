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

const CREDIT_TEXT_FIELDS = new Map([
  ["writer", "script"],
  ["penciller", "pencils"],
  ["inker", "inks"],
  ["colorist", "colors"],
  ["letterer", "letters"],
]);

export function fillStoryCreditText(story, credits) {
  const namesByField = new Map();
  for (const credit of credits) {
    for (const role of CREDIT_ROLES.get(Number(credit.credit_type_id)) ?? []) {
      const field = CREDIT_TEXT_FIELDS.get(role);
      const name = String(credit.name ?? "").trim();
      if (!field || !name) continue;
      if (!namesByField.has(field)) namesByField.set(field, []);
      const names = namesByField.get(field);
      if (!names.includes(name)) names.push(name);
    }
  }
  const filled = { ...story };
  // GCD writes "?" for an unknown credit. Treat it as empty so a structured
  // credit can fill it, and never show a bare "?" on the page.
  for (const field of CREDIT_TEXT_FIELDS.values())
    if (String(filled[field] ?? "").trim() === "?") filled[field] = null;
  for (const [field, names] of namesByField)
    if (!String(filled[field] ?? "").trim()) filled[field] = names.join("; ");
  return filled;
}

export function formatStoryCharacters(characterRows, relations) {
  const present = new Set(characterRows.map((row) => Number(row.character_id)));
  const civilianByHero = new Map();
  const pairedCivilians = new Set();
  for (const relation of relations) {
    const hero = Number(relation.from_character_id);
    const civilian = Number(relation.to_character_id);
    if (!present.has(hero) || !present.has(civilian) || civilianByHero.has(hero))
      continue;
    civilianByHero.set(hero, civilian);
    pairedCivilians.add(civilian);
  }
  const byId = new Map(
    characterRows.map((row) => [Number(row.character_id), row]),
  );
  const emitted = new Set();
  const output = [];
  for (const row of characterRows) {
    const id = Number(row.character_id);
    if (emitted.has(id) || pairedCivilians.has(id)) continue;
    emitted.add(id);
    const civilian = byId.get(civilianByHero.get(id));
    let name = String(row.name ?? "").trim();
    if (civilian) {
      emitted.add(Number(civilian.character_id));
      name += ` [${String(civilian.name ?? "").trim()}]`;
    }
    const notes = String(row.notes ?? "").trim();
    if (notes) name += ` (${notes})`;
    if (name) output.push(name);
  }
  return output;
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

export function staleKeys(existingRows, replacementRows, fields) {
  const replacementKeys = new Set(
    replacementRows.map((row) => fields.map((field) => row[field]).join("\0")),
  );
  return existingRows.filter(
    (row) =>
      !replacementKeys.has(fields.map((field) => row[field]).join("\0")),
  );
}

export function resolveBases(rows, maxHops = 5) {
  const byId = new Map(rows.map((row) => [Number(row.gcd_id), row]));
  return rows.map((row) => {
    const gcdId = Number(row.gcd_id);
    let current = row;
    let hops = 0;
    const seen = new Set([gcdId]);
    for (;;) {
      const parentId = Number(current.variant_of_id);
      if (!Number.isInteger(parentId) || parentId < 1)
        return { ...row, base_gcd_issue_id: Number(current.gcd_id), reason: null, hops };
      if (seen.has(parentId))
        return { ...row, base_gcd_issue_id: gcdId, reason: "cycle", hops };
      if (hops >= maxHops)
        return { ...row, base_gcd_issue_id: gcdId, reason: "too_deep", hops };
      const parent = byId.get(parentId);
      if (!parent)
        return {
          ...row,
          base_gcd_issue_id: gcdId,
          reason: "parent_not_mirrored",
          hops,
        };
      seen.add(parentId);
      current = parent;
      hops += 1;
    }
  });
}

export function missingIssueIds(dumpRows, mirrorIds) {
  return new Set(
    dumpRows
      .map((row) => Number(row.id ?? row.gcd_id))
      .filter((id) => Number.isInteger(id) && !mirrorIds.has(id)),
  );
}

export function mapDumpIssueRows(dumpRows, mirrorIds) {
  const sourceById = new Map(
    dumpRows.map((row) => [Number(row.id ?? row.gcd_id), row]),
  );
  const missing = missingIssueIds(dumpRows, mirrorIds);
  return resolveBases(dumpRows.map((row) => ({
    gcd_id: Number(row.id ?? row.gcd_id),
    variant_of_id: row.variant_of_id == null ? null : Number(row.variant_of_id),
    variant_name: row.variant_name == null || !String(row.variant_name).trim()
      ? null
      : String(row.variant_name).trim(),
  })))
    .filter((row) => missing.has(row.gcd_id))
    .map((resolved) => {
      const source = sourceById.get(resolved.gcd_id);
      const cleaned = (value) => value == null || !String(value).trim()
        ? null
        : String(value).trim();
      return {
        gcd_id: resolved.gcd_id,
        series_gcd_id: Number(source.series_id),
        issue_number: source.number == null ? null : String(source.number),
        title: cleaned(source.title),
        publication_date: cleaned(source.publication_date),
        key_date: cleaned(source.key_date),
        publisher_gcd_id: source.publisher_id == null ? null : Number(source.publisher_id),
        variant_of_gcd_id: resolved.variant_of_id,
        variant_name: resolved.variant_name,
        base_gcd_issue_id: resolved.base_gcd_issue_id,
      };
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
