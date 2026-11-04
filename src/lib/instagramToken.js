// Is the Instagram bot's Meta token still good? The Monday email asks every week,
// so an expiring login shows up before posting stops. It stopped once already, on
// 2026-09-30, and nothing warned.
//
// Only expires_at matters here. data_access_expires_at is ignored on purpose: the
// user token's data access window closed on Oct 30, 2026 and it published fine on
// Nov 3. A Page token reports expires_at 0, meaning it never expires.

const GRAPH = "https://graph.facebook.com/v21.0";
const WARN_DAYS = 10;

// Pure.
export function instagramTokenStatus(debug, now = Date.now(), warnDays = WARN_DAYS) {
  if (!debug || debug.is_valid !== true) {
    return { level: "error", text: "Instagram login is invalid. The bot can't post until it's replaced." };
  }
  const expiresAt = Number(debug.expires_at || 0);
  const kind = String(debug.type || "unknown").toLowerCase();
  if (!expiresAt) return { level: "ok", text: `Instagram login: ${kind} token, doesn't expire.` };
  const days = Math.ceil((expiresAt * 1000 - now) / 864e5);
  const date = new Date(expiresAt * 1000).toISOString().slice(0, 10);
  if (days <= 0) return { level: "error", text: `Instagram login expired on ${date}. The bot can't post until it's replaced.` };
  if (days <= warnDays) return { level: "warn", text: `Instagram login expires in ${days} days (${date}). Posting stops then unless it's replaced.` };
  return { level: "ok", text: `Instagram login: ${kind} token, expires in ${days} days (${date}).` };
}

async function graphGet(path, params, token, fetchImpl) {
  const url = new URL(GRAPH + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", token);
  const response = await fetchImpl(url);
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`Graph API ${path.split("/").pop()}: ${body.error?.message || response.status}`);
  return body;
}

// Asks Meta about the token, then makes the same read a post depends on: the
// publishing limit endpoint needs instagram_content_publish, so it fails if the
// token could read the account but not post to it. Errors never carry the token.
export async function checkInstagramToken({ token, igUserId, now = Date.now(), fetchImpl = fetch }) {
  if (!token || !igUserId) return { level: "error", text: "Instagram login could not be checked: INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_BUSINESS_ACCOUNT_ID is not set." };
  try {
    const { data } = await graphGet("/debug_token", { input_token: token }, token, fetchImpl);
    const status = instagramTokenStatus(data, now);
    if (status.level === "error") return status;
    await graphGet(`/${igUserId}/content_publishing_limit`, { fields: "quota_usage" }, token, fetchImpl);
    return status;
  } catch (error) {
    return { level: "error", text: `Instagram login could not be checked: ${String(error.message).split(token).join("[token]")}` };
  }
}

export function instagramTokenHtml(status) {
  const color = status.level === "ok" ? "inherit" : "#b00020";
  const text = String(status.text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  return `<p style="color:${color}">${status.level === "ok" ? "" : "<strong>Action needed:</strong> "}${text}</p>`;
}
