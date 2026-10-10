const ROLE_ORDER = ["writer", "penciller", "inker", "colorist", "letterer", "cover"];

const labelRole = (role) => role === "cover" ? "cover artist" : role;

function numericIssue(value) {
  const raw = String(value ?? "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

export function formatIssueRange(issueNumbers) {
  const values = (issueNumbers ?? []).map((value) => String(value ?? "").trim()).filter(Boolean);
  if (!values.length) return null;
  const numeric = values.map((value) => ({ value, number: numericIssue(value) }));
  if (numeric.some(({ number }) => number == null)) return `${values.length} issue${values.length === 1 ? "" : "s"}`;
  numeric.sort((a, b) => a.number - b.number || a.value.localeCompare(b.value));
  if (numeric.length === 1 || numeric[0].number === numeric.at(-1).number) return `#${numeric[0].value}`;
  return `#${numeric[0].value}-#${numeric.at(-1).value}`;
}

export function buildCreatorRuns(credits = [], issues = [], seriesRows = []) {
  const issuesById = new Map(issues.map((issue) => [String(issue.gcd_id), issue]));
  const seriesByGcdId = new Map(seriesRows.map((series) => [String(series.gcd_id), series]));
  const grouped = new Map();

  for (const credit of credits) {
    const issue = issuesById.get(String(credit.gcd_issue_id));
    const series = issue && seriesByGcdId.get(String(issue.series_gcd_id));
    if (!issue || !series) continue;
    let run = grouped.get(String(series.id));
    if (!run) {
      run = { id: series.id, title: series.title, year_start: series.year_start_cached, year_end: series.year_end_cached, publisher: series.resolved_publisher_cached, roles: new Set(), issues: new Map() };
      grouped.set(String(series.id), run);
    }
    run.roles.add(credit.role);
    run.issues.set(String(issue.gcd_id), issue.issue_number);
  }

  return [...grouped.values()].map((run) => ({
    id: run.id,
    title: run.title,
    year_start: run.year_start,
    year_end: run.year_end,
    publisher: run.publisher,
    roles: ROLE_ORDER.filter((role) => run.roles.has(role)),
    issue_count: run.issues.size,
    issue_range: formatIssueRange([...run.issues.values()]),
  })).sort((a, b) => b.issue_count - a.issue_count || a.title.localeCompare(b.title));
}

export function buildRoleCounts(credits = []) {
  const counts = Object.fromEntries(ROLE_ORDER.map((role) => [role, 0]));
  for (const { role } of credits) if (Object.hasOwn(counts, role)) counts[role] += 1;
  return counts;
}

export function topCreatorRole(roleCounts = {}) {
  return ROLE_ORDER.reduce((best, role) => (Number(roleCounts[role]) > Number(roleCounts[best]) ? role : best), ROLE_ORDER[0]);
}

export function buildCreatorSummary({ name, credit_count: count, role_counts: roles, year_start: start, year_end: end, capped } = {}) {
  const safeName = name || "This creator";
  const total = Number(count) || 0;
  const topRole = topCreatorRole(roles);
  const roleText = Number(roles?.[topRole]) > 0 ? `, mostly as a ${labelRole(topRole)}` : "";
  let years = "";
  if (start && end && start !== end) years = `, from ${start} to ${end}`;
  else if (start || end) years = `, in ${start || end}`;
  const sentence = `${safeName} has ${total.toLocaleString("en-US")} credit${total === 1 ? "" : "s"} in the ComixCatalog catalog${roleText}${years}.`;
  return capped ? `${sentence} This page is showing the first 3,000 credits.` : sentence;
}

export function creatorJsonLd(creator, url) {
  if (!creator) return null;
  const role = topCreatorRole(creator.role_counts);
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: creator.name,
    url,
    ...(Number(creator.role_counts?.[role]) > 0 ? { jobTitle: labelRole(role) } : {}),
  };
}

export function buildCreatorDescription(creator, maxLength = 160) {
  const full = buildCreatorSummary(creator);
  return full.length <= maxLength ? full : `${full.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}
