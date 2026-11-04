// Swaps the Instagram bot's 60-day user token for its Facebook Page token, which
// doesn't expire. Tony runs this himself: writing GitHub secrets is blocked for
// agents. It reads the extended user token from IG_USER_TOKEN and changes nothing
// unless every check passes. Tokens are never printed.
//
// From the main checkout, with the extended token on the clipboard:
//   $env:IG_USER_TOKEN = Get-Clipboard; node --env-file=.env.local <path to this file>; Remove-Item Env:\IG_USER_TOKEN
//
// Afterwards `gh workflow run traction-digest.yml -f dry_run=true` prints the
// secret's status in the run log without sending the email.

import { spawnSync } from "node:child_process";
import fs from "node:fs";

const GRAPH = "https://graph.facebook.com/v21.0";
const REPO = "tanktoptony/comixcatalog-beta";
const userToken = String(process.env.IG_USER_TOKEN || "").trim();
const igId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

function stop(message) {
  console.error(`Nothing was changed. ${message}`);
  process.exit(1);
}

async function get(path, params, token) {
  const url = new URL(GRAPH + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", token);
  const response = await fetch(url);
  return { ok: response.ok, body: await response.json() };
}

if (!userToken) stop("IG_USER_TOKEN is empty. Copy the extended token first.");
if (!igId) stop("INSTAGRAM_BUSINESS_ACCOUNT_ID is not set. Run this with --env-file=.env.local from the main checkout.");

const accounts = await get("/me/accounts", { fields: "id,name,instagram_business_account,access_token" }, userToken);
if (!accounts.ok) stop(`Meta refused the token: ${accounts.body.error?.message}`);
const pages = accounts.body.data || [];
if (pages.length === 0) {
  stop("Meta returned no Pages for this token. Generate it again in Graph API Explorer, add business_management, and tick the ComixCatalog Page and the Instagram account in the popup.");
}
const page = pages.find((p) => p.instagram_business_account?.id === igId);
if (!page) stop(`None of the ${pages.length} Pages returned is linked to the bot's Instagram account.`);
const pageToken = page.access_token;

const debug = await get("/debug_token", { input_token: pageToken }, pageToken);
const info = debug.body.data || {};
if (!info.is_valid) stop("Meta says the Page token isn't valid.");
if (info.type !== "PAGE") stop(`Expected a Page token and got ${info.type}.`);
if (Number(info.expires_at || 0) !== 0) stop("This Page token expires, which means the user token wasn't extended. Use Extend Access Token in the Access Token Debugger, copy that, and run this again.");
if (!(info.scopes || []).includes("instagram_content_publish")) stop("The token doesn't have instagram_content_publish, so the bot couldn't post.");

const account = await get(`/${igId}`, { fields: "username,media_count" }, pageToken);
if (!account.ok) stop(`The Page token can't read the Instagram account: ${account.body.error?.message}`);
const limit = await get(`/${igId}/content_publishing_limit`, { fields: "quota_usage" }, pageToken);
if (!limit.ok) stop(`The Page token can't reach the publishing endpoint: ${limit.body.error?.message}`);
console.log(`Checked: Page token for "${page.name}", doesn't expire, reads @${account.body.username}, publishing endpoint OK.`);

const secret = spawnSync("gh", ["secret", "set", "INSTAGRAM_ACCESS_TOKEN", "--repo", REPO], { input: pageToken, encoding: "utf8", shell: process.platform === "win32" });
if (secret.status !== 0) stop(`gh secret set failed: ${secret.stderr}`);
console.log("GitHub secret INSTAGRAM_ACCESS_TOKEN updated.");

// Keep the old token until a post has gone out on the new one. It's the rollback.
const envFile = ".env.local";
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);
  const at = lines.findIndex((line) => line.startsWith("INSTAGRAM_ACCESS_TOKEN="));
  if (at >= 0) {
    const old = lines[at].slice("INSTAGRAM_ACCESS_TOKEN=".length);
    lines[at] = `INSTAGRAM_ACCESS_TOKEN=${pageToken}`;
    if (!lines.some((line) => line.startsWith("INSTAGRAM_ACCESS_TOKEN_OLD_USER="))) lines.splice(at + 1, 0, `INSTAGRAM_ACCESS_TOKEN_OLD_USER=${old}`);
    fs.writeFileSync(envFile, lines.join("\n"));
    console.log(".env.local updated; the old token is kept as INSTAGRAM_ACCESS_TOKEN_OLD_USER.");
  }
}
console.log("Done.");
