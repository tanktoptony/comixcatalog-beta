import { isCollectedEdition } from "../../src/lib/seriesFormat.js";

export function normalizeWorkTitle(title) {
  return String(title ?? "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the\s+/, "");
}

function isCollected(format) {
  return isCollectedEdition(format) || /graphic novel/i.test(format?.publishing_format ?? "");
}

function bestWork(totals, catalog) {
  return [...totals.entries()].sort((a, b) =>
    b[1] - a[1]
    || (catalog.get(b[0])?.issue_count ?? 0) - (catalog.get(a[0])?.issue_count ?? 0)
    || a[0] - b[0]
  )[0];
}

function strippedEditionTitle(title) {
  let value = normalizeWorkTitle(title);
  const words = /\b(?:compendium|omnibus|deluxe edition|deluxe|library edition|absolute edition|absolute|hardcover|hc|trade paperback|tpb|collection|collected edition|the complete|complete|(?:vol|volume|book|part)\s+\d+)\b/g;
  value = value.replace(words, " ").replace(/\s+/g, " ").trim();
  return value;
}

export function buildSeriesEditions({ series, formats, sources }) {
  const catalog = new Map(series.map((row) => [Number(row.gcd_id), {
    ...row,
    gcd_id: Number(row.gcd_id),
    issue_count: Number(row.issue_count ?? 0),
  }]));
  const collected = new Set([...catalog.keys()].filter((id) => isCollected(formats.get(id))));
  const byTarget = new Map();
  for (const source of sources) {
    const target = Number(source.target);
    const origin = Number(source.origin);
    const rows = byTarget.get(target) ?? [];
    rows.push({ origin, issues: Number(source.issues ?? 0) });
    byTarget.set(target, rows);
  }

  const links = new Map();
  const resolved = new Map();
  for (let pass = 0; pass < 3; pass += 1) {
    const prior = new Map(resolved);
    for (const edition of collected) {
      if (resolved.has(edition)) continue;
      const totals = new Map();
      for (const source of byTarget.get(edition) ?? []) {
        if (!catalog.has(source.origin) || source.origin === edition) continue;
        const work = collected.has(source.origin) ? prior.get(source.origin) : source.origin;
        if (!work || work === edition) continue;
        totals.set(work, (totals.get(work) ?? 0) + source.issues);
      }
      const total = [...totals.values()].reduce((sum, count) => sum + count, 0);
      const winner = bestWork(totals, catalog);
      if (!winner || winner[1] < 2 || winner[1] < 0.5 * total) continue;
      resolved.set(edition, winner[0]);
      links.set(edition, {
        edition_gcd_id: edition,
        work_gcd_id: winner[0],
        role: "collected",
        source: "reprints",
        shared_issues: winner[1],
      });
    }
  }

  const worksWithEditions = new Set(resolved.values());
  const specialCandidates = new Map();
  for (const [edition, work] of resolved) {
    for (const source of byTarget.get(edition) ?? []) {
      const candidate = catalog.get(source.origin);
      const workRow = catalog.get(work);
      if (!candidate || !workRow || collected.has(candidate.gcd_id) || candidate.gcd_id === work) continue;
      if (worksWithEditions.has(candidate.gcd_id)) continue;
      const candidateTitle = normalizeWorkTitle(candidate.title);
      const workTitle = normalizeWorkTitle(workRow.title);
      if (candidateTitle !== workTitle && !candidateTitle.startsWith(`${workTitle} `)) continue;
      if (formats.get(candidate.gcd_id)?.publisher_gcd_id !== formats.get(work)?.publisher_gcd_id) continue;
      if (candidate.issue_count > 12 || candidate.issue_count >= workRow.issue_count) continue;
      // A short early run is not a special of the run that continued it:
      // Incredible Hulk (1962, 6 issues) and Hulk (1968), or EC's Weird
      // Fantasy (1950) and a later reprint run, are separate runs.
      if (/ongoing/i.test(formats.get(candidate.gcd_id)?.publishing_format ?? "")) continue;
      // "JLA / WildC.A.T.s" belongs to two works, so neither gets it.
      if (/\s\/\s?|\/\s/.test(candidate.title ?? "")) continue;
      if (candidate.year_start != null && workRow.year_start != null && candidate.year_start < workRow.year_start) continue;
      const key = `${candidate.gcd_id}:${work}`;
      specialCandidates.set(key, (specialCandidates.get(key) ?? 0) + source.issues);
    }
  }
  const specialsByEdition = new Map();
  for (const [key, shared] of specialCandidates) {
    const [edition, work] = key.split(":").map(Number);
    const current = specialsByEdition.get(edition);
    if (!current || shared > current.shared || (shared === current.shared && work < current.work)) {
      specialsByEdition.set(edition, { work, shared });
    }
  }
  for (const [edition, { work, shared }] of specialsByEdition) {
    if (links.has(edition)) continue;
    links.set(edition, {
      edition_gcd_id: edition,
      work_gcd_id: work,
      role: "special",
      source: "reprints",
      shared_issues: shared,
    });
  }

  // Indexed by publisher + title: scanning the whole catalog per edition is
  // ~27k x ~98k comparisons on the live catalog.
  const runsByPublisherTitle = new Map();
  for (const row of catalog.values()) {
    if (collected.has(row.gcd_id)) continue;
    const key = `${formats.get(row.gcd_id)?.publisher_gcd_id}|${normalizeWorkTitle(row.title)}`;
    const rows = runsByPublisherTitle.get(key) ?? [];
    rows.push(row);
    runsByPublisherTitle.set(key, rows);
  }
  for (const edition of collected) {
    if (links.has(edition) || worksWithEditions.has(edition)) continue;
    const editionRow = catalog.get(edition);
    const title = strippedEditionTitle(editionRow.title);
    if (!title) continue;
    const key = `${formats.get(edition)?.publisher_gcd_id}|${title}`;
    const candidates = (runsByPublisherTitle.get(key) ?? []).filter((row) =>
      !links.has(row.gcd_id)
      && row.gcd_id !== edition
      && row.issue_count >= 2
      && (row.year_start == null || (editionRow.year_start != null && row.year_start <= editionRow.year_start))
    ).sort((a, b) => b.issue_count - a.issue_count || a.gcd_id - b.gcd_id);
    const work = candidates[0]?.gcd_id;
    if (!work) continue;
    links.set(edition, {
      edition_gcd_id: edition,
      work_gcd_id: work,
      role: "collected",
      source: "title",
      shared_issues: 0,
    });
  }

  return [...links.values()]
    .filter((row) => row.edition_gcd_id !== row.work_gcd_id && !links.has(row.work_gcd_id))
    .sort((a, b) => a.edition_gcd_id - b.edition_gcd_id);
}
