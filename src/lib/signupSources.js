// "Signups by source" in the Monday email (scripts/weeklyTractionDigest.js).
// Reads profiles.signup_*, which src/lib/attribution.js fills on every new
// signup. Counting starts Nov 3, 2026, the first day tagged links were proven to
// save a source; the 35 members before that mostly have nothing recorded.

import { excludeTestAccounts } from "./traction.js";

export const SOURCE_REPORT_START = "2026-11-03T00:00:00.000Z";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Pure: which line of the report a signup counts on. YouTube and Instagram roll
// up every yt-* and vs-* campaign; shops roll up by shop, whose slug is the source
// on a /s/<shop> link.
export function signupChannel({ signup_source: source, signup_medium: medium, signup_campaign: campaign }) {
  if (!source) return { channel: "No source saved", detail: null };
  if (source === "youtube") return { channel: "YouTube", detail: campaign || "no campaign" };
  if (source === "instagram") return { channel: "Instagram", detail: campaign || "no campaign" };
  if (medium === "print" || campaign === "shop-kit") return { channel: "Shop bookmarks", detail: source };
  if (source === "invite") return { channel: "Member invites", detail: null };
  if (medium === "organic") return { channel: "Search", detail: source };
  if (source === "direct") return { channel: "Direct", detail: null };
  return { channel: "Other sites", detail: campaign ? `${source} / ${campaign}` : source };
}

// The earliest created_at the report needs: until Nov 10 the 7-day window reaches
// further back than Nov 3.
export function sourceReportFrom(now = Date.now()) {
  return new Date(Math.min(Date.parse(SOURCE_REPORT_START), now - WEEK_MS)).toISOString();
}

const bySinceThenName = (a, b) => b.since - a.since || b.last7 - a.last7 || String(a.name).localeCompare(String(b.name));

// Pure: profile rows to the two-window report. A signup counts once, on the
// source it arrived from. `invited` is separate because someone who found the site
// first and was invited later keeps their first source but did accept an invite.
export function buildSignupSources(rows, now = Date.now()) {
  const start = Date.parse(SOURCE_REPORT_START);
  const weekAgo = now - WEEK_MS;
  const channels = new Map();
  const report = { last7: 0, since: 0, invited: { last7: 0, since: 0 }, channels: [] };
  for (const row of excludeTestAccounts(rows)) {
    const created = Date.parse(row.created_at);
    const inWeek = created >= weekAgo;
    const inSince = created >= start;
    if (!inWeek && !inSince) continue;
    const add = (item) => {
      if (inWeek) item.last7 += 1;
      if (inSince) item.since += 1;
    };
    add(report);
    if (row.invited_by) add(report.invited);
    const { channel, detail } = signupChannel(row);
    if (!channels.has(channel)) channels.set(channel, { name: channel, last7: 0, since: 0, details: new Map() });
    const line = channels.get(channel);
    add(line);
    if (detail) {
      if (!line.details.has(detail)) line.details.set(detail, { name: detail, last7: 0, since: 0 });
      add(line.details.get(detail));
    }
  }
  report.channels = [...channels.values()]
    .map((line) => ({ ...line, details: [...line.details.values()].sort(bySinceThenName) }))
    .sort(bySinceThenName);
  return report;
}

const esc = (value) => String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function signupSourcesHtml(report) {
  const cell = (value) => `<td align="right" style="padding:2px 12px">${value}</td>`;
  const rows = report.channels.flatMap((line) => [
    `<tr><td style="padding:2px 0"><strong>${esc(line.name)}</strong></td>${cell(line.last7)}${cell(line.since)}</tr>`,
    ...line.details.map((detail) => `<tr><td style="padding:2px 0 2px 16px">${esc(detail.name)}</td>${cell(detail.last7)}${cell(detail.since)}</tr>`),
  ]);
  return `<h2>Signups by source</h2><table style="border-collapse:collapse"><tr><th></th><th align="right" style="padding:2px 12px">Last 7 days</th><th align="right" style="padding:2px 12px">Since Nov 3</th></tr><tr><td style="padding:2px 0"><strong>All signups</strong></td>${cell(report.last7)}${cell(report.since)}</tr>${rows.join("")}</table><p>Accepted a member's invite: ${report.invited.last7} in the last 7 days, ${report.invited.since} since Nov 3.</p>`;
}
