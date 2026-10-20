// Recently played on Spotify, as a Mobile Legends-style card the same size as the rank card.
// Needs SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET and SPOTIFY_REFRESH_TOKEN (set them once with
// `node .github/scripts/spotify-auth.mjs`). Without them it exits quietly and writes nothing.
// Run hourly by the profile workflow: node .github/scripts/spotify-card.mjs <out.svg>
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { C, cham, fontFace, uniq } from "./rank-card.mjs";

const TEAL = C.cyan;
const SPOTIFY_GREEN = "#1ed760";
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const TZ_OFFSET_H = 7; // times are shown in WIB

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

async function accessToken({ clientId, clientSecret, refreshToken }) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`Spotify token refresh failed: ${json.error_description || json.error || res.status}`);
  return json.access_token;
}

async function art(url) {
  if (!url) return null;
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

const smallest = (images = []) => [...images].sort((a, b) => a.width - b.width)[0]?.url;

export async function fetchTracks(creds) {
  const token = await accessToken(creds);
  const headers = { Authorization: `Bearer ${token}` };
  const now = await fetch("https://api.spotify.com/v1/me/player/currently-playing", { headers });
  const playing = now.status === 200 ? await now.json() : null;
  const recent = await (await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=3", { headers })).json();
  const tracks = (recent.items || []).map((it) => ({ track: it.track, playedAt: it.played_at }));
  if (playing?.is_playing && playing.item?.type === "track") {
    tracks.unshift({ track: playing.item, playedAt: null });
  }
  const seen = new Set();
  const out = [];
  for (const { track, playedAt } of tracks) {
    if (seen.has(track.id) || out.length === 3) continue;
    seen.add(track.id);
    out.push({
      title: track.name,
      artist: track.artists.map((a) => a.name).join(", "),
      art: await art(smallest(track.album?.images)),
      playedAt,
    });
  }
  return { nowPlaying: Boolean(playing?.is_playing), tracks: out };
}

function when(iso) {
  if (!iso) return "NOW";
  const t = new Date(Date.parse(iso) + TZ_OFFSET_H * 3600e3);
  const today = new Date(Date.now() + TZ_OFFSET_H * 3600e3);
  const hhmm = `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
  const day = (d) => Math.floor(d.getTime() / 86400e3);
  const diff = day(today) - day(t);
  if (diff === 0) return `TODAY ${hhmm}`;
  if (diff === 1) return `YESTERDAY ${hhmm}`;
  return `${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}`;
}

// Spotify's mark, drawn as three arcs inside a circle.
const spotifyMark = (x, y, r, color) =>
  `<g transform="translate(${x} ${y})"><circle r="${r}" fill="${color}"/><path d="M${-r * 0.55} ${-r * 0.22}q${r * 0.55} ${-r * 0.22} ${r * 1.1} ${r * 0.12}M${-r * 0.45} ${r * 0.1}q${r * 0.45} ${-r * 0.17} ${r * 0.9} ${r * 0.1}M${-r * 0.36} ${r * 0.4}q${r * 0.36} ${-r * 0.12} ${r * 0.72} ${r * 0.08}" fill="none" stroke="${C.bg}" stroke-width="${r * 0.17}" stroke-linecap="round"/></g>`;

export async function renderSpotifyCard({ nowPlaying, tracks }) {
  const W = 400, H = 229;
  const head = nowPlaying ? "NOW PLAYING" : "RECENTLY PLAYED";
  const rows = tracks.map((t) => ({ ...t, artist: clip(t.artist, 34), at: when(t.playedAt) }));
  const h6 = await fontFace("Rajdhani", 600, uniq(["SPOTIFY", "NOW…", ...rows.map((r) => r.artist + r.at)]));
  const h7 = await fontFace("Rajdhani", 700, uniq([head, "NOW PLAYING", "LAST PLAYED", ...rows.map((r) => r.title)]));

  // Every timestamp sits in one right-aligned column on the title line; titles are clipped to fit
  // beside it. The top row is the featured one: NOW PLAYING (teal frame, pulsing badge, moving
  // equaliser) while something plays, otherwise a quieter LAST PLAYED badge.
  const timeW = (t) => t.length * 7.6;
  const rowEls = rows
    .map((r, i) => {
      const y = 50 + i * 56;
      const first = i === 0;
      const live = first && nowPlaying;
      const at = live ? "NOW" : r.at;
      const titleRoom = Math.floor((W - 20 - timeW(at) - 14 - 76) / 8.6);
      const title = clip(r.title, titleRoom);
      const artist = first ? clip(r.artist, 24) : r.artist;
      const cover = r.art
        ? `<image href="${r.art}" x="20" y="${y}" width="44" height="44" clip-path="url(#cov)"/>`
        : `<rect x="20" y="${y}" width="44" height="44" fill="${C.panel}"/>`;
      const badgeW = live ? 106 : 86, bx = W - 20 - badgeW, by = y + 27;
      const badge = !first ? "" : live
        ? `<path d="${cham(bx, by, badgeW, 17, 4)}" fill="${TEAL}"/><circle class="pulse" cx="${bx + 9}" cy="${by + 8.5}" r="3" fill="${C.bg}"/><text class="h7" x="${bx + 17}" y="${by + 12.5}" font-size="10.5" letter-spacing="1.5" fill="${C.bg}">NOW PLAYING</text>`
          + Array.from({ length: 4 }, (_, k) => `<rect x="${bx - 30 + k * 6}" y="${by + 1}" width="3.5" height="16" fill="${TEAL}" style="transform-origin:0 ${by + 17}px;animation:eq ${0.55 + k * 0.17}s ${k * 0.11}s ease-in-out infinite alternate"/>`).join("")
        : `<path d="${cham(bx, by, badgeW, 17, 4)}" fill="none" stroke="${C.line}" stroke-width="1.2"/><text class="h7" x="${bx + badgeW / 2}" y="${by + 12.5}" text-anchor="middle" font-size="10.5" letter-spacing="1.5" fill="${C.muted}">LAST PLAYED</text>`;
      const frame = !first ? "" : live
        ? `<path d="${cham(12, y - 6, W - 24, 56, 8)}" fill="#10284a"/><path class="glow" d="${cham(12, y - 6, W - 24, 56, 8)}" fill="none" stroke="${TEAL}" stroke-width="1.5"/><rect x="12" y="${y + 2}" width="3" height="40" fill="${TEAL}"/>`
        : `<path d="${cham(12, y - 6, W - 24, 56, 8)}" fill="${C.panel}"/><rect x="12" y="${y + 2}" width="3" height="40" fill="${C.gold}"/>`;
      return `<g class="row" style="animation-delay:${(0.15 + i * 0.12).toFixed(2)}s">
  ${frame}
  ${cover}
  <path d="${cham(20, y, 44, 44, 7)}" fill="none" stroke="${live ? TEAL : first ? C.gold : C.line}" stroke-width="${live ? 2 : 1.2}"/>
  <text class="h7" x="76" y="${y + 19}" font-size="16" fill="${C.cream}">${esc(title)}</text>
  <text class="h6" x="76" y="${y + 37}" font-size="13" fill="${live ? "#9fdcf2" : C.muted}">${esc(artist)}</text>
  <text class="h6" x="${W - 20}" y="${y + 19}" text-anchor="end" font-size="11" letter-spacing="1.5" fill="${live ? TEAL : C.muted}">${esc(at)}</text>
  ${badge}
</g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${head.toLowerCase()} on Spotify: ${rows.map((r) => `${r.title} by ${r.artist}`).join("; ")}">
<title>${head}</title>
<style>${h6}${h7}
.h6{font-family:'Rajdhani','Arial Narrow',sans-serif;font-weight:600}
.h7{font-family:'Rajdhani','Arial Narrow',sans-serif;font-weight:700}
.row{opacity:0;animation:in .5s forwards}
@keyframes in{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
@keyframes eq{from{transform:scaleY(.2)}to{transform:scaleY(1)}}
.pulse{animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{50%{opacity:.25}}
.glow{animation:glow 2.4s ease-in-out infinite}
@keyframes glow{50%{stroke-opacity:.35}}
@media (prefers-reduced-motion: reduce){*{animation:none!important}.row{opacity:1}}
</style>
<defs><clipPath id="cov" clipPathUnits="objectBoundingBox"><path d="${cham(0, 0, 1, 1, 0.16)}"/></clipPath></defs>
<path d="${cham(0.75, 0.75, W - 1.5, H - 1.5, 16)}" fill="${C.bg}" stroke="${C.line}" stroke-width="1.5"/>
<rect x="20" y="16" width="4" height="16" fill="${C.gold}"/>
<text class="h7" x="32" y="29" font-size="13" letter-spacing="3" fill="${C.cream}">${head}</text>
${spotifyMark(W - 30, 24, 8, SPOTIFY_GREEN)}
<text class="h6" x="${W - 44}" y="28" text-anchor="end" font-size="11" letter-spacing="2" fill="${C.muted}">SPOTIFY</text>
${rowEls}
</svg>`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [out] = process.argv.slice(2);
  const creds = { clientId: process.env.SPOTIFY_CLIENT_ID, clientSecret: process.env.SPOTIFY_CLIENT_SECRET, refreshToken: process.env.SPOTIFY_REFRESH_TOKEN };
  if (!creds.clientId || !creds.clientSecret || !creds.refreshToken) {
    console.log("spotify: secrets not set, skipping");
    process.exit(0);
  }
  const data = await fetchTracks(creds);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, await renderSpotifyCard(data));
  console.log(`spotify: ${data.tracks.length} tracks${data.nowPlaying ? " (now playing)" : ""}`);
}
