import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { aggregateReach, completedWeeks, parseCsv, parseIsoDuration, weeklyReach } from "../src/lib/youtubeStats.js";

const REPORTING_BASE = "https://youtubereporting.googleapis.com/v1";
const ANALYTICS_URL = "https://youtubeanalytics.googleapis.com/v2/reports";

export async function googleRequest(url, accessToken, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, ...options.headers },
  });
  if (!response.ok) {
    const body = (await response.text()).trim().slice(0, 500);
    throw new Error(`Google API request failed: ${response.status} ${body}`);
  }
  return response;
}

export async function getAccessToken(env = process.env) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      refresh_token: env.YOUTUBE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const body = (await response.text()).trim().slice(0, 500);
    if (response.status === 400 && body.includes("invalid_grant")) {
      throw new Error("YouTube refresh token expired or revoked; rerun `node scripts/youtubeAuth.js` and update the YOUTUBE_REFRESH_TOKEN secret");
    }
    throw new Error(`Google API request failed: ${response.status} ${body}`);
  }
  return (await response.json()).access_token;
}

async function listPages(path, property, accessToken) {
  const items = [];
  let pageToken;
  do {
    const url = new URL(`${REPORTING_BASE}${path}`);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await (await googleRequest(url, accessToken)).json();
    items.push(...(data[property] || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return items;
}

async function upsertBatches(client, table, rows, options) {
  for (let index = 0; index < rows.length; index += 1000) {
    const { error } = await client.from(table).upsert(rows.slice(index, index + 1000), options);
    if (error) throw error;
  }
}

export async function importReach({ client, accessToken, dryRun = false, log = console }) {
  try {
    const reportTypes = await listPages("/reportTypes", "reportTypes", accessToken);
    if (!reportTypes.some((item) => item.id === "channel_reach_basic_a1")) {
      log.warn("YouTube reach report type is unavailable; continuing without reach data.");
      return [];
    }
    const jobs = await listPages("/jobs", "jobs", accessToken);
    let job = jobs.find((item) => item.reportTypeId === "channel_reach_basic_a1");
    if (!job) {
      if (dryRun) log.log("Would create reporting job; first reports take about two days.");
      else {
        job = await (await googleRequest(`${REPORTING_BASE}/jobs`, accessToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportTypeId: "channel_reach_basic_a1", name: "ComixCatalog reach" }),
        })).json();
        log.log("Created reporting job; first reports take about two days.");
      }
      return [];
    }
    const reports = await listPages(`/jobs/${encodeURIComponent(job.id)}/reports`, "reports", accessToken);
    const { data: imported, error } = await client.from("youtube_report_imports").select("report_id");
    if (error) throw error;
    const importedIds = new Set((imported || []).map((row) => row.report_id));
    const fresh = reports.filter((report) => !importedIds.has(report.id)).sort((a, b) =>
      String(a.startTime || a.createTime).localeCompare(String(b.startTime || b.createTime)) ||
      String(a.createTime).localeCompare(String(b.createTime))
    );
    const downloadedRows = [];
    for (const report of fresh) {
      const csv = await (await googleRequest(report.downloadUrl, accessToken)).text();
      const rows = aggregateReach(parseCsv(csv));
      downloadedRows.push(...rows);
      if (!dryRun) {
        await upsertBatches(client, "youtube_reach_daily", rows.map((row) => ({ ...row, imported_at: new Date().toISOString() })), { onConflict: "day,video_id" });
        const { error: insertError } = await client.from("youtube_report_imports").insert({
          report_id: report.id,
          report_type: "channel_reach_basic_a1",
          start_time: report.startTime || null,
          end_time: report.endTime || null,
          rows: rows.length,
        });
        if (insertError) throw insertError;
      }
    }
    return downloadedRows;
  } catch (error) {
    log.warn(`YouTube reach import skipped: ${error.message}`);
    return [];
  }
}

function rowsByHeader(data) {
  const headers = (data.columnHeaders || []).map((header) => header.name);
  return (data.rows || []).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]])));
}

async function analyticsRows(accessToken, week, perVideo) {
  const url = new URL(ANALYTICS_URL);
  url.search = new URLSearchParams({
    ids: "channel==MINE",
    startDate: week.start,
    endDate: week.end,
    metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost",
    ...(perVideo ? { dimensions: "video", sort: "-views", maxResults: "200" } : {}),
  });
  return rowsByHeader(await (await googleRequest(url, accessToken)).json());
}

async function videoMetadata(accessToken, videoIds) {
  const metadata = new Map();
  for (let index = 0; index < videoIds.length; index += 50) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.search = new URLSearchParams({ part: "snippet,contentDetails", id: videoIds.slice(index, index + 50).join(",") });
    const data = await (await googleRequest(url, accessToken)).json();
    for (const item of data.items || []) metadata.set(item.id, {
      title: item.snippet?.title || null,
      duration_seconds: parseIsoDuration(item.contentDetails?.duration),
      published_at: item.snippet?.publishedAt || null,
    });
  }
  return metadata;
}

function metricRow(row) {
  return {
    views: Number(row?.views) || 0,
    watch_minutes: Number(row?.estimatedMinutesWatched) || 0,
    subscribers_gained: Number(row?.subscribersGained) || 0,
    subscribers_lost: Number(row?.subscribersLost) || 0,
  };
}

export async function buildWeeklyRows({ client, accessToken, weeks, downloadedReach = [], log = console }) {
  const first = weeks.at(-1).start;
  const last = weeks[0].end;
  const { data, error } = await client.from("youtube_reach_daily").select("day,video_id,impressions,clicks").gte("day", first).lte("day", last);
  const storedReach = error ? [] : data;
  if (error) log.warn(`YouTube reach read skipped: ${error.message}`);
  const reachByKey = new Map((storedReach || []).map((row) => [`${row.day}\0${row.video_id}`, row]));
  for (const row of downloadedReach) reachByKey.set(`${row.day}\0${row.video_id}`, row);
  const results = [];
  for (const week of weeks) {
    const [videoAnalytics, channelAnalytics] = await Promise.all([
      analyticsRows(accessToken, week, true),
      analyticsRows(accessToken, week, false),
    ]);
    const metadata = await videoMetadata(accessToken, videoAnalytics.map((row) => row.video));
    const reach = weeklyReach([...reachByKey.values()], week);
    const videos = videoAnalytics.map((row) => ({
      week_start: week.start,
      video_id: row.video,
      ...metadata.get(row.video),
      ...metricRow(row),
      ...(reach.videos.get(row.video) || { impressions: null, impressions_ctr: null }),
      updated_at: new Date().toISOString(),
    }));
    const channel = {
      week_start: week.start,
      ...metricRow(channelAnalytics[0]),
      ...reach.channel,
      updated_at: new Date().toISOString(),
    };
    results.push({ week, videos, channel });
  }
  return results;
}

export async function main({ env = process.env, dryRun = process.argv.includes("--dry-run"), log = console } = {}) {
  const required = ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing required environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const accessToken = await getAccessToken(env);
  const downloadedReach = await importReach({ client, accessToken, dryRun, log });
  const weekly = await buildWeeklyRows({ client, accessToken, weeks: completedWeeks(new Date(), 2), downloadedReach, log });
  if (dryRun) log.log(JSON.stringify(weekly, null, 2));
  else {
    for (const result of weekly) {
      await upsertBatches(client, "youtube_weekly_video_stats", result.videos, { onConflict: "week_start,video_id" });
      const { error } = await client.from("youtube_weekly_channel_stats").upsert(result.channel, { onConflict: "week_start" });
      if (error) throw error;
    }
    log.log(`Stored YouTube stats for ${weekly.length} completed weeks.`);
  }
  return weekly;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error); process.exitCode = 1; });
