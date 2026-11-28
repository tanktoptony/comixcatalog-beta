import { publisherAgrees, titleKey } from "./blankVolumeMatch.js";

const validYear = (value) => {
  const year = Number(value);
  return Number.isInteger(year) && year > 1800 && year < 2200 ? year : null;
};

const cleanName = (value) => String(value ?? "").trim();
const nameKey = (value) => cleanName(value).toLocaleLowerCase();

export function comicVineVolumeTitleVariants(value) {
  const title = cleanName(value);
  if (!title) return [];
  const withoutThe = title.replace(/^the\s+/i, "").trim();
  return [...new Set([title, withoutThe, `The ${withoutThe}`].filter(Boolean))];
}

export async function fetchComicVineVolumes(cv, title, {
  fieldList = "id,name,start_year,publisher",
  pageSize = 100,
  maxResultsPerTitle = 500,
} = {}) {
  const candidates = new Map();

  for (const variant of comicVineVolumeTitleVariants(title)) {
    let offset = 0;
    while (offset < maxResultsPerTitle) {
      const limit = Math.min(pageSize, maxResultsPerTitle - offset);
      const response = await cv.get("volumes", {
        filter: `name:${variant}`,
        field_list: fieldList,
        limit,
        offset,
      });
      const rows = response.results ?? [];
      for (const row of rows) {
        const id = Number(row?.id);
        if (id && !candidates.has(id)) candidates.set(id, row);
      }

      const total = Number(response.number_of_total_results) || rows.length;
      offset += rows.length;
      if (offset >= total || rows.length === 0) break;
      if (offset >= maxResultsPerTitle) {
        return {
          candidates: [],
          reason: `too many ComicVine volumes for \"${variant}\" (more than ${maxResultsPerTitle})`,
        };
      }
    }
  }

  return { candidates: [...candidates.values()], reason: null };
}

export function issueNumberKey(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function chooseComicVineVolume(comic, candidates) {
  const title = comic?.series_title ?? comic?.title;
  const year = validYear(comic?.start_year);
  const fits = (candidates ?? []).filter((candidate) => {
    const candidateYear = validYear(candidate.start_year);
    return titleKey(candidate.name) === titleKey(title)
      && publisherAgrees(comic?.publisher, candidate.publisher?.name ?? candidate.publisher)
      && year != null
      && candidateYear != null
      && Math.abs(year - candidateYear) <= 1;
  });

  if (fits.length === 1) return { match: fits[0], reason: null };
  return {
    match: null,
    reason: fits.length > 1
      ? `${fits.length} ComicVine volumes match title, publisher and year`
      : "no ComicVine volume matches title, publisher and year",
  };
}

export function chooseComicVineIssue(issueNumber, candidates) {
  const wanted = issueNumberKey(issueNumber);
  if (!wanted) return { match: null, reason: "comic has no issue number" };
  const fits = (candidates ?? []).filter((candidate) => issueNumberKey(candidate.issue_number) === wanted);
  if (fits.length === 1) return { match: fits[0], reason: null };
  return {
    match: null,
    reason: fits.length > 1
      ? `${fits.length} ComicVine issues have the exact issue number`
      : "no ComicVine issue has the exact issue number",
  };
}

export function splitComicVineRoles(value) {
  return String(value ?? "")
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
}

export function groupComicVineCredits(rows) {
  const grouped = new Map();
  for (const row of rows ?? []) {
    const name = cleanName(row?.name);
    if (!name) continue;
    const key = nameKey(name);
    const credit = grouped.get(key) ?? { name, roles: [] };
    const seen = new Set(credit.roles.map(nameKey));
    for (const role of splitComicVineRoles(row?.role)) {
      const key = nameKey(role);
      if (!seen.has(key)) {
        seen.add(key);
        credit.roles.push(role);
      }
    }
    grouped.set(key, credit);
  }
  return [...grouped.values()];
}

function uniqueNames(rows) {
  const names = new Map();
  for (const row of rows ?? []) {
    const name = cleanName(row?.name);
    if (name && !names.has(nameKey(name))) names.set(nameKey(name), name);
  }
  return [...names.values()];
}

function comicVineDate(value) {
  const match = String(value ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? match[0]
    : null;
}

export function shapeComicVineIssue(issue) {
  return {
    comicvine_issue_id: Number(issue?.id),
    issue_name: cleanName(issue?.name) || null,
    cover_date: comicVineDate(issue?.cover_date),
    store_date: comicVineDate(issue?.store_date),
    credits: groupComicVineCredits(issue?.person_credits),
    characters: uniqueNames(issue?.character_credits),
    story_arcs: uniqueNames(issue?.story_arc_credits),
    source_url: cleanName(issue?.site_detail_url) || null,
  };
}
