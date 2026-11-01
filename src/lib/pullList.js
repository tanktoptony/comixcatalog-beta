import { issueKey, matchIssue } from "./csvImport/matchRow.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnly(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? match[0] : null;
}

function isoWeekKey(value) {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / DAY_MS) + 1) / 7);
  return `${date.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

export function issueIdentity(seriesGcdId, issueNumber) {
  return `${Number(seriesGcdId)}:${issueKey(issueNumber).reduced}`;
}

export function dedupePullListCovers(covers) {
  const picked = new Map();
  for (const cover of covers ?? []) {
    const key = issueIdentity(cover.series_gcd_id, cover.issue_number);
    if (key.endsWith(":")) continue;
    const current = picked.get(key);
    if (!current || (!current.gcd_issue_id && cover.gcd_issue_id)) picked.set(key, cover);
  }
  return [...picked.values()];
}

export function resolvePullListIssues(covers, issues) {
  const bySeries = new Map();
  for (const issue of issues ?? []) {
    const key = Number(issue.series_gcd_id);
    if (!bySeries.has(key)) bySeries.set(key, []);
    bySeries.get(key).push(issue);
  }
  return (covers ?? []).map((cover) => {
    if (Number(cover.gcd_issue_id) > 0) {
      return { ...cover, gcd_issue_id: Number(cover.gcd_issue_id) };
    }
    const match = matchIssue(bySeries.get(Number(cover.series_gcd_id)), cover.issue_number);
    return { ...cover, gcd_issue_id: match ? Number(match.gcd_id) : null };
  });
}

export function groupPullListWeeks(items) {
  const groups = new Map();
  for (const item of items ?? []) {
    const day = dateOnly(item.in_store_date);
    if (!day) continue;
    const key = isoWeekKey(day);
    if (!groups.has(key)) groups.set(key, { label_date: day, items: [] });
    const group = groups.get(key);
    if (day > group.label_date) group.label_date = day;
    group.items.push(item);
  }
  return [...groups.values()]
    .sort((left, right) => right.label_date.localeCompare(left.label_date))
    .map((group) => ({
      ...group,
      items: group.items.sort((left, right) =>
        String(left.series_title).localeCompare(String(right.series_title), undefined, { numeric: true })
      ),
    }));
}

export function pullListMonthWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const after = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
  return {
    startMonth: start.toISOString().slice(0, 7),
    endMonth: new Date(after.getTime() - DAY_MS).toISOString().slice(0, 7),
    startDate: start.toISOString().slice(0, 10),
    endDate: new Date(after.getTime() - DAY_MS).toISOString().slice(0, 10),
  };
}

// Coming soon: only issues whose GCD on-sale date is an exact future day.
// GCD's key_date is usually the cover date, about two months after the
// issue is in shops, so a key_date month would list books already out.
export function buildPullListUpcoming(issues, releasedItems, now = new Date(), cap = 60) {
  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + 92 * DAY_MS).toISOString().slice(0, 10);
  const released = new Set((releasedItems ?? []).map((item) =>
    issueIdentity(item.series_gcd_id, item.issue_number)
  ));
  const seen = new Set();
  const rows = [];
  for (const issue of issues ?? []) {
    const onSale = dateOnly(issue.on_sale_date);
    const identity = issueIdentity(issue.series_gcd_id, issue.issue_number);
    if (!onSale || onSale.endsWith("-00") || onSale <= today || onSale > horizon) continue;
    if (released.has(identity) || seen.has(identity)) continue;
    seen.add(identity);
    rows.push({
      series_title: issue.series_title,
      issue_number: issue.issue_number,
      on_sale_date: onSale,
      month: onSale.slice(0, 7),
    });
  }
  return rows.sort((left, right) =>
    left.on_sale_date.localeCompare(right.on_sale_date)
      || String(left.series_title).localeCompare(String(right.series_title), undefined, { numeric: true })
      || issueKey(left.issue_number).raw.localeCompare(issueKey(right.issue_number).raw, undefined, { numeric: true })
  ).slice(0, cap);
}

