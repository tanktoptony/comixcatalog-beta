const DAY_MS = 86_400_000;

function dateText(date) {
  return date.toISOString().slice(0, 10);
}

export function completedWeeks(now, count) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  const currentMonday = new Date(today.getTime() - daysSinceMonday * DAY_MS);
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(currentMonday.getTime() - (index + 1) * 7 * DAY_MS);
    const end = new Date(start.getTime() + 6 * DAY_MS);
    return { start: dateText(start), end: dateText(end) };
  });
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [headers = [], ...values] = rows;
  return values.map((fields) => Object.fromEntries(headers.map((header, index) => [header, fields[index] ?? ""])));
}

export function aggregateReach(rows) {
  const percentages = rows.some((row) => Number(row.video_thumbnail_impressions_ctr) > 1);
  const grouped = new Map();
  for (const row of rows) {
    if (!row.video_id) continue;
    const day = String(row.date || "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
    const key = `${day}\0${row.video_id}`;
    const impressions = Number(row.video_thumbnail_impressions) || 0;
    const ctr = (Number(row.video_thumbnail_impressions_ctr) || 0) / (percentages ? 100 : 1);
    const current = grouped.get(key) || { day, video_id: row.video_id, impressions: 0, clicks: 0 };
    current.impressions += impressions;
    current.clicks += impressions * ctr;
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

export function weeklyReach(dailyRows, week) {
  const videos = new Map();
  let channelImpressions = 0;
  let channelClicks = 0;
  for (const row of dailyRows) {
    if (row.day < week.start || row.day > week.end) continue;
    const current = videos.get(row.video_id) || { impressions: 0, clicks: 0 };
    current.impressions += Number(row.impressions) || 0;
    current.clicks += Number(row.clicks) || 0;
    videos.set(row.video_id, current);
    channelImpressions += Number(row.impressions) || 0;
    channelClicks += Number(row.clicks) || 0;
  }
  for (const [videoId, value] of videos) {
    videos.set(videoId, {
      impressions: value.impressions,
      impressions_ctr: value.impressions ? value.clicks / value.impressions : null,
    });
  }
  // No reach rows (the reporting job's first days) is unknown, not zero.
  return {
    videos,
    channel: {
      impressions: videos.size ? channelImpressions : null,
      impressions_ctr: channelImpressions ? channelClicks / channelImpressions : null,
    },
  };
}

export function parseIsoDuration(text) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(text || "");
  if (!match || !match.slice(1).some(Boolean)) return null;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

function escapeHtml(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function change(current, previous) {
  if (previous === null || previous === undefined || Number(previous) === 0) return "new";
  const percent = Math.round(((Number(current) - Number(previous)) / Math.abs(Number(previous))) * 100);
  return `${percent >= 0 ? "+" : ""}${percent}%`;
}

function ctr(value) {
  return value === null || value === undefined ? "n/a" : `${(Number(value) * 100).toFixed(1)}%`;
}

export function youtubeDigestHtml({ thisWeek, lastWeek, topVideos = [] }) {
  if (!thisWeek) return "";
  const net = (row) => Number(row?.subscribers_gained || 0) - Number(row?.subscribers_lost || 0);
  const metrics = [
    `views <strong>${Number(thisWeek.views || 0).toLocaleString("en-US")}</strong> (${change(thisWeek.views, lastWeek?.views)})`,
    `watch hours <strong>${(Number(thisWeek.watch_minutes || 0) / 60).toFixed(1)}</strong> (${change(thisWeek.watch_minutes, lastWeek?.watch_minutes)})`,
    `net subscribers <strong>${net(thisWeek)}</strong> (${change(net(thisWeek), lastWeek ? net(lastWeek) : null)})`,
    thisWeek.impressions === null || thisWeek.impressions === undefined
      ? "impressions <strong>n/a</strong>"
      : `impressions <strong>${Number(thisWeek.impressions).toLocaleString("en-US")}</strong> (${change(thisWeek.impressions, lastWeek?.impressions)})`,
    `CTR <strong>${ctr(thisWeek.impressions_ctr)}</strong> (${change(thisWeek.impressions_ctr, lastWeek?.impressions_ctr)})`,
  ];
  const videos = topVideos.slice(0, 5).map((video) => `<li>${escapeHtml(video.title || video.video_id)}: ${Number(video.views || 0).toLocaleString("en-US")} views, ${net(video)} net subs, ${ctr(video.impressions_ctr)} CTR</li>`).join("");
  return `<h2>YouTube</h2><p>Last week: ${metrics.join(", ")}.</p><ul>${videos || "<li>None</li>"}</ul>`;
}
