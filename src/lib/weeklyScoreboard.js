import { fetchAllPages } from "./supabase/fetchAllPages.js";
import { TEST_ACCOUNT_USERNAMES } from "./traction.js";

// Tony's own non-test account (thrice347, the bulk beta lister) is left out of
// the scoreboard too, matching the 2026-11-17 level-set numbers. It stays out of
// TEST_ACCOUNT_USERNAMES because other features rely on that list.
export const SCOREBOARD_EXCLUDED_USERNAMES = Object.freeze([...TEST_ACCOUNT_USERNAMES, "thrice347"]);

const number = (value) => Number(value) || 0;
const integer = (value) => number(value).toLocaleString("en-US");
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

export function weekStartUtc(value = new Date()) {
  const date = new Date(value);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export function excludeScoreboardTestAccounts(rows, excluded = SCOREBOARD_EXCLUDED_USERNAMES) {
  const names = new Set(excluded.map((name) => name.toLowerCase()));
  return rows.filter((row) => !names.has(String(row.username ?? "").toLowerCase()));
}

export function isInReleaseWindow(publishedAt, runAt = new Date()) {
  const age = new Date(runAt).getTime() - new Date(publishedAt).getTime();
  return age >= 7 * 86400000 && age <= 21 * 86400000;
}

export function formatDelta(value, previous, formatter = integer) {
  const rendered = formatter(value);
  if (previous == null) return `${rendered} (first week)`;
  const delta = number(value) - number(previous);
  if (delta === 0) return `${rendered} (no change)`;
  return `${rendered} (${delta > 0 ? "+" : ""}${formatter(delta)})`;
}

function percent(numerator, denominator) {
  return denominator ? (100 * number(numerator)) / number(denominator) : 0;
}

function metricValue(metrics, key) {
  if (key === "founders") return `${integer(metrics.founders)} / 100`;
  if (key === "gmvAllTimeCents" || key === "platformFeesAllTimeCents") {
    return `$${(number(metrics[key]) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (key === "scanConfirmTop1") return `${percent(metrics.scanConfirmTop1, metrics.scanConfirmedAllTime).toFixed(1)}%`;
  return integer(metrics[key]);
}

function metricDelta(metrics, previous, key) {
  const value = metricValue(metrics, key);
  if (!previous) return `${value} (first week)`;
  if (key === "scanConfirmTop1") {
    const current = percent(metrics.scanConfirmTop1, metrics.scanConfirmedAllTime);
    const prior = percent(previous.scanConfirmTop1, previous.scanConfirmedAllTime);
    const delta = current - prior;
    return `${value} (${delta === 0 ? "no change" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} pp`})`;
  }
  const suffix = formatDelta(metrics[key], previous[key], (valueToFormat) => {
    if (key === "gmvAllTimeCents" || key === "platformFeesAllTimeCents") {
      const sign = number(valueToFormat) < 0 ? "-" : "";
      return `${sign}$${(Math.abs(number(valueToFormat)) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return integer(valueToFormat);
  });
  return `${value}${suffix.slice(suffix.indexOf(" ("))}`;
}

const GROUPS = [
  ["Members and money", [["Members", "members"], ["New members", "newMembers7d"], ["Founders", "founders"], ["Paying members", "payingMembers"], ["GMV", "gmvAllTimeCents"], ["Platform fees", "platformFeesAllTimeCents"]]],
  ["Activation", [["With a book", "withBook"], ["With 25 books", "with25"], ["With a wantlist", "withWantlist"], ["Active collectors", "activeCollectors7d"]]],
  ["Marketplace and wantlists", [["Active listings", "activeListings"], ["Priced listings", "pricedListings"], ["Priced, other sellers", "pricedListingsOtherSellers"], ["Real orders, 7d", "realOrders7d"], ["Real orders, all time", "realOrdersAllTime"], ["Wants with native listing", "wantsWithNativeListing"], ["Wants with eBay copy", "wantsWithEbayCopy"]]],
  ["Product use", [["Scans, 7d", "scans7d"], ["Matched scans, 7d", "scanMatched7d"], ["Top-1 confirmation accuracy", "scanConfirmTop1"], ["Follows", "follows"], ["Pull list series", "pullListSeries"]]],
];

export function scoreboardHtml(metrics, previous) {
  const rows = GROUPS.map(([group, items]) => items.map(([label, key], index) => `<tr>${index === 0 ? `<th rowspan="${items.length}" style="text-align:left;vertical-align:top;padding:6px 12px 6px 0;border-top:1px solid #ddd">${group}</th>` : ""}<td style="padding:6px;border-top:1px solid #ddd">${label}</td><td style="padding:6px;text-align:right;border-top:1px solid #ddd;white-space:nowrap"><strong>${metricDelta(metrics, previous, key)}</strong></td></tr>`).join("")).join("");
  return `<h1>Weekly scoreboard</h1><table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;width:100%;max-width:760px"><tbody>${rows}</tbody></table>`;
}

export function releaseResultsHtml({ videos = [], campaignSignups = [], instagramSignups = 0 }) {
  const rows = videos.map((video) => {
    return `<tr><td style="padding:5px;border-top:1px solid #ddd">${escapeHtml(video.title || video.video_id)}</td><td style="padding:5px;text-align:right;border-top:1px solid #ddd">${integer(video.views)}</td><td style="padding:5px;text-align:right;border-top:1px solid #ddd">${(number(video.impressions_ctr) * 100).toFixed(1)}%</td><td style="padding:5px;text-align:right;border-top:1px solid #ddd">${integer(video.subscribers_gained)}</td><td style="padding:5px;text-align:right;border-top:1px solid #ddd">n/a</td></tr>`;
  }).join("");
  const links = campaignSignups.map((row) => `<tr><td style="padding:5px;border-top:1px solid #ddd">${escapeHtml(row.campaign)}</td><td colspan="3" style="border-top:1px solid #ddd"></td><td style="padding:5px;text-align:right;border-top:1px solid #ddd">${integer(row.signups)}</td></tr>`).join("");
  return `<h2>Release results</h2><table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;width:100%;max-width:760px"><thead><tr><th style="text-align:left">Release or link</th><th>Views, last week</th><th>CTR</th><th>Subs</th><th>Signups, 30d</th></tr></thead><tbody>${rows || '<tr><td colspan="5" style="padding:5px">No YouTube releases in the 7 to 21 day window.</td></tr>'}${links}<tr><td style="padding:5px;border-top:1px solid #ddd">Instagram</td><td colspan="3" style="border-top:1px solid #ddd"></td><td style="padding:5px;text-align:right;border-top:1px solid #ddd">${integer(instagramSignups)}</td></tr></tbody></table>`;
}

export async function loadWeeklyScoreboard(client, runAt = new Date()) {
  const weekStart = weekStartUtc(runAt).toISOString().slice(0, 10);
  const [{ data: metrics, error: metricsError }, { data: snapshots, error: snapshotError }, { data: weeks, error: weeksError }] = await Promise.all([
    client.rpc("weekly_scoreboard_metrics", { p_week_start: weekStart, p_run_at: runAt.toISOString(), p_excluded_usernames: SCOREBOARD_EXCLUDED_USERNAMES }),
    client.from("weekly_scoreboard_snapshots").select("week_start,metrics").lt("week_start", weekStart).order("week_start", { ascending: false }).limit(1),
    client.from("youtube_weekly_video_stats").select("week_start").order("week_start", { ascending: false }).limit(1),
  ]);
  if (metricsError) throw metricsError;
  if (snapshotError) throw snapshotError;
  if (weeksError) throw weeksError;
  let videos = [];
  if (weeks?.[0]) {
    const { data, error } = await client.from("youtube_weekly_video_stats").select("video_id,title,published_at,views,impressions_ctr,subscribers_gained").eq("week_start", weeks[0].week_start);
    if (error) throw error;
    videos = (data ?? []).filter((video) => isInReleaseWindow(video.published_at, runAt));
  }
  const cutoff = new Date(runAt.getTime() - 30 * 86400000).toISOString();
  const profiles = await fetchAllPages(() => client.from("profiles").select("username,signup_source,signup_campaign").gte("created_at", cutoff));
  const eligible = excludeScoreboardTestAccounts(profiles);
  const campaignCounts = new Map();
  for (const profile of eligible) if (String(profile.signup_campaign ?? "").startsWith("yt-")) campaignCounts.set(profile.signup_campaign, (campaignCounts.get(profile.signup_campaign) ?? 0) + 1);
  return {
    weekStart, metrics, previous: snapshots?.[0]?.metrics ?? null, videos,
    campaignSignups: [...campaignCounts].map(([campaign, signups]) => ({ campaign, signups })),
    instagramSignups: eligible.filter((profile) => profile.signup_source === "instagram").length,
  };
}
