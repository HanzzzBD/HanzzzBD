// One-time Spotify setup for the profile's Spotify card.
// 1. Create an app at https://developer.spotify.com/dashboard with the redirect URI
//    http://127.0.0.1:8888/callback (Web API).
// 2. Run: node .github/scripts/spotify-auth.mjs <client_id> <client_secret>
// It opens Spotify's consent page, catches the callback, exchanges the code and stores
// SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET and SPOTIFY_REFRESH_TOKEN as repo secrets with the
// GitHub CLI. The token is never printed.
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const REPO = process.env.PROFILE_REPO || "HanzzzBD/HanzzzBD";
const REDIRECT = "http://127.0.0.1:8888/callback";
const SCOPES = "user-read-recently-played user-read-currently-playing";

const [clientId, clientSecret] = process.argv.slice(2);
if (!clientId || !clientSecret) {
  console.error("Usage: node .github/scripts/spotify-auth.mjs <client_id> <client_secret>");
  process.exit(1);
}

const state = randomBytes(12).toString("hex");
const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
  client_id: clientId, response_type: "code", redirect_uri: REDIRECT, scope: SCOPES, state,
})}`;

const code = await new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url, REDIRECT);
    if (url.pathname !== "/callback") { res.writeHead(404).end(); return; }
    const ok = url.searchParams.get("state") === state && url.searchParams.get("code");
    res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(ok ? "<h2>Spotify connected. You can close this tab.</h2>" : `<h2>Authorisation failed: ${url.searchParams.get("error") || "state mismatch"}</h2>`);
    server.close();
    ok ? resolve(url.searchParams.get("code")) : reject(new Error(url.searchParams.get("error") || "state mismatch"));
  });
  server.listen(8888, "127.0.0.1", () => {
    console.log("Opening Spotify in your browser. If it doesn't open, visit:\n" + authUrl + "\n");
    const opener = process.platform === "win32" ? ["cmd", ["/c", "start", "", authUrl]] : process.platform === "darwin" ? ["open", [authUrl]] : ["xdg-open", [authUrl]];
    spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).unref();
  });
});

const res = await fetch("https://accounts.spotify.com/api/token", {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT }),
});
const json = await res.json();
if (!json.refresh_token) {
  console.error(`Token exchange failed: ${json.error_description || json.error || res.status}`);
  process.exit(1);
}

for (const [name, value] of [["SPOTIFY_CLIENT_ID", clientId], ["SPOTIFY_CLIENT_SECRET", clientSecret], ["SPOTIFY_REFRESH_TOKEN", json.refresh_token]]) {
  execFileSync("gh", ["secret", "set", name, "--repo", REPO], { input: value, stdio: ["pipe", "ignore", "inherit"] });
  console.log(`Saved ${name} to ${REPO}`);
}
console.log("\nDone. The next workflow run will draw the Spotify card.");
