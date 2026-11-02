import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const [clientPath, outputArg = "youtube-token.json"] = process.argv.slice(2);

function openBrowser(url) {
  const command = process.platform === "win32" ? "rundll32" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

async function exchangeCode({ code, codeVerifier, redirectUri, clientId, clientSecret }) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error(`Token exchange failed: ${response.status} ${(await response.text()).trim().slice(0, 500)}`);
  return response.json();
}

async function main() {
  if (!clientPath) throw new Error("Usage: node scripts/youtubeAuth.js <path-to-client_secret.json> [out.json]");
  const config = JSON.parse(await readFile(resolve(clientPath), "utf8"));
  const clientId = config.installed?.client_id;
  const clientSecret = config.installed?.client_secret;
  if (!clientId || !clientSecret) throw new Error("Client JSON must contain installed.client_id and installed.client_secret");

  const state = randomBytes(24).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  let finish;
  const callback = new Promise((resolveCallback, rejectCallback) => { finish = { resolve: resolveCallback, reject: rejectCallback }; });
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.searchParams.get("state") !== state) throw new Error("OAuth callback state did not match");
      const code = url.searchParams.get("code");
      if (!code) throw new Error(`OAuth callback did not include a code${url.searchParams.get("error") ? `: ${url.searchParams.get("error")}` : ""}`);
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Done, you can close this tab.");
      finish.resolve(code);
    } catch (error) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(error.message);
      finish.reject(error);
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  try {
    const port = server.address().port;
    const redirectUri = `http://127.0.0.1:${port}`;
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: "https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.readonly",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    console.log(`Open this URL to authorize YouTube analytics:\n${authUrl}`);
    openBrowser(authUrl.href);
    const code = await callback;
    const token = await exchangeCode({ code, codeVerifier, redirectUri, clientId, clientSecret });
    if (!token.refresh_token) {
      throw new Error("No refresh_token returned. Remove the app's access at https://myaccount.google.com/permissions and rerun this script.");
    }
    const outputPath = resolve(outputArg);
    await writeFile(outputPath, `${JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refresh_token,
      scope: token.scope,
      obtained_at: new Date().toISOString(),
    }, null, 2)}\n`, { mode: 0o600 });
    console.log(`Saved YouTube credentials to ${outputPath}`);
  } finally {
    server.close();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
