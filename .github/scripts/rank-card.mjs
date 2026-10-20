// Draws a Mobile Legends-style rank card from the contributions of the last 365 days.
// Run by the profile workflow: node .github/scripts/rank-card.mjs <user> <out.svg>
// Rank icons in ../mlbb/ranks are the official Mobile Legends: Bang Bang ones (via the Mobile Legends
// Fandom wiki); the README carries the fan-content notice.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RANKS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "mlbb", "ranks");

export const C = {
  bg: "#0a1124", panel: "#111c38", line: "#26365f", gold: "#f0b84a", red: "#ff4d5e",
  cream: "#f4ead5", muted: "#8c98b8", soft: "#bcc6dd", cyan: "#38d4ff",
};

// Contributions needed to reach each tier. Below Mythic every tier is split into divisions (V..I)
// worth STARS stars each; from Mythic up the rank is counted in stars, one per STAR_COST contributions.
const TIERS = [
  { name: "WARRIOR", min: 0, divs: 3, color: "#c9b291" },
  { name: "ELITE", min: 40, divs: 3, color: "#c9d3dc" },
  { name: "MASTER", min: 100, divs: 4, color: "#e8c46a" },
  { name: "GRANDMASTER", min: 180, divs: 5, color: "#b8a2ff" },
  { name: "EPIC", min: 300, divs: 5, color: "#4fd8a8" },
  { name: "LEGEND", min: 480, divs: 5, color: "#ffb347" },
  { name: "MYTHIC", min: 700, mythic: true, color: "#ff7a6b" },
  { name: "MYTHICAL HONOR", min: 1000, mythic: true, color: "#ff9a4d" },
  { name: "MYTHICAL GLORY", min: 1300, mythic: true, color: "#ffd75e" },
  { name: "MYTHICAL IMMORTAL", min: 1900, mythic: true, color: "#ff5ad1" },
];
export const STARS = 5;
const STAR_COST = 12;
const ROMAN = ["I", "II", "III", "IV", "V"];

export function rankFor(total) {
  let t = 0;
  while (t + 1 < TIERS.length && total >= TIERS[t + 1].min) t++;
  const tier = TIERS[t];
  const nextTier = TIERS[t + 1];
  if (tier.mythic) {
    // Mythic and up: stars only; the bar shows progress to the next tier.
    const stars = Math.floor((total - TIERS[6].min) / STAR_COST);
    const pct = nextTier ? (total - tier.min) / (nextTier.min - tier.min) : 1;
    return { tier, t, name: tier.name, stars, mythic: true, pct, next: nextTier?.name ?? null, toNext: nextTier ? nextTier.min - total : 0 };
  }
  const span = (nextTier.min - tier.min) / tier.divs;
  const step = Math.min(tier.divs - 1, Math.floor((total - tier.min) / span));
  const division = tier.divs - step; // counts down: III, II, I
  const floor = tier.min + span * step;
  const pct = (total - floor) / span;
  const stars = Math.min(STARS, Math.floor(pct * STARS));
  const next = division > 1 ? `${tier.name} ${ROMAN[division - 2]}` : nextTier.name;
  return { tier, t, name: `${tier.name} ${ROMAN[division - 1]}`, division, stars, mythic: false, pct, next, toNext: Math.ceil(floor + span - total) };
}

export async function fetchTotal(user) {
  const html = await (await fetch(`https://github.com/users/${user}/contributions`, { headers: { "User-Agent": "rank-card" } })).text();
  const m = html.match(/id="js-contribution-activity-description"[^>]*>\s*([\d,]+)\s+contributions?/);
  if (!m) throw new Error("Could not find the contribution total");
  return Number(m[1].replace(/,/g, ""));
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
export async function fontFace(family, weight, text) {
  const fam = family.replace(/ /g, "+") + (family === "Anton" ? "" : `:wght@${weight}`);
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${fam}&text=${encodeURIComponent(text)}`, { headers: { "User-Agent": UA } })).text();
  const src = css.match(/url\((https:[^)]+)\)/)?.[1];
  if (!src) return ""; // fall back to the system stack rather than failing the whole workflow
  const buf = Buffer.from(await (await fetch(src)).arrayBuffer());
  return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${buf.toString("base64")}) format('woff2')}`;
}
export const uniq = (strings) => [...new Set(strings.join("").split(""))].join("");
export const cham = (x, y, w, h, c) => `M${x + c} ${y}H${x + w}V${y + h - c}L${x + w - c} ${y + h}H${x}V${y + c}Z`;

// Shared font classes: .t is Cinzel (the gold serif of MLBB's headings), .d the condensed number face.
export const FONT_CSS = `.t{font-family:'Cinzel',Georgia,serif;font-weight:900}
.d{font-family:'Anton',Impact,'Arial Narrow',sans-serif}
.h6{font-family:'Rajdhani','Arial Narrow',sans-serif;font-weight:600}
.h7{font-family:'Rajdhani','Arial Narrow',sans-serif;font-weight:700}
.m{font-family:'JetBrains Mono',ui-monospace,Consolas,monospace;font-weight:500}`;

export async function rankIcon(t) {
  const png = await readFile(join(RANKS_DIR, `${TIERS[t].name.toLowerCase().replace(/ /g, "-")}.png`));
  return `data:image/png;base64,${png.toString("base64")}`;
}

// Five-pointed star centred on (x, y).
export const star = (x, y, r, fill, stroke = fill) => {
  const pts = Array.from({ length: 10 }, (_, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r;
    return `${(x + rr * Math.cos(a)).toFixed(1)},${(y + rr * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round"/>`;
};

export async function renderRankCard(total) {
  const W = 400, H = 229;
  const r = rankFor(total);
  const { tier } = r;
  const totalText = `${total.toLocaleString("en-US")} CONTRIBUTIONS`;
  const starText = r.mythic ? `× ${r.stars}` : `${r.stars} / ${STARS}`;
  const nextText = r.next ? `${r.toNext} TO ${r.next}` : "TOP GLOBAL ENERGY";
  const nameSize = r.name.length > 16 ? 14.5 : r.name.length > 12 ? 16 : r.name.length > 10 ? 22 : 28;

  const cinzel = await fontFace("Cinzel", 900, r.name);
  const h6 = await fontFace("Rajdhani", 600, uniq(["LAST 365 DAYS", "CURRENT RANK", nextText]));
  const h7 = await fontFace("Rajdhani", 700, uniq(["RANKED", totalText, starText]));

  const ladder = TIERS.map((t, i) => {
    const x = 34 + i * 37;
    const on = i <= r.t;
    const cur = i === r.t;
    return `<g transform="translate(${x} 203)">${cur ? `<rect x="-9" y="-9" width="18" height="18" transform="rotate(45)" fill="none" stroke="${t.color}" stroke-width="1.5"/>` : ""}<rect x="-5" y="-5" width="10" height="10" transform="rotate(45)" fill="${t.color}" fill-opacity="${on ? 1 : 0.22}"><title>${t.name}</title></rect></g>${i < TIERS.length - 1 ? `<line x1="${x + 9}" x2="${x + 28}" y1="203" y2="203" stroke="${i < r.t ? TIERS[i + 1].color : C.line}" stroke-opacity="${i < r.t ? 0.6 : 1}"/>` : ""}`;
  }).join("");

  const ex = 88, ey = 108, barX = 170, barW = 210;
  const fill = barW * Math.min(1, r.pct);
  // Divisions show their star slots; Mythic and up show a single star with the count.
  const stars = r.mythic
    ? star(barX + 7, 160, 7, tier.color)
    : Array.from({ length: STARS }, (_, i) => star(barX + 7 + i * 17, 160, 7, i < r.stars ? tier.color : "none", i < r.stars ? tier.color : C.line)).join("");
  const starLabelX = r.mythic ? barX + 20 : barX + 7 + STARS * 17;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Rank ${r.name}, ${r.mythic ? `${r.stars} stars` : `${r.stars} of ${STARS} stars`}: ${total} contributions in the last 365 days">
<title>${r.name}</title>
<style>${cinzel}${h6}${h7}
${FONT_CSS}
.glow{transform-origin:${ex}px ${ey}px;animation:glow 3s ease-in-out infinite}
@keyframes glow{50%{transform:scale(1.18);opacity:.45}}
.em{transform-origin:${ex}px ${ey}px;opacity:0;animation:em .7s .1s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes em{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
.bar{transform-origin:${barX}px 0;transform:scaleX(0);animation:bar 1.2s .5s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes bar{to{transform:scaleX(1)}}
@media (prefers-reduced-motion: reduce){*{animation:none!important}.em{opacity:1}.bar{transform:none}}
</style>
<defs>
  <radialGradient id="g"><stop offset="0" stop-color="${tier.color}" stop-opacity=".45"/><stop offset="1" stop-color="${tier.color}" stop-opacity="0"/></radialGradient>
  <linearGradient id="shine" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <clipPath id="barClip"><rect x="${barX}" y="134" width="${fill}" height="6"/></clipPath>
</defs>
<path d="${cham(0.75, 0.75, W - 1.5, H - 1.5, 16)}" fill="${C.bg}" stroke="${C.line}" stroke-width="1.5"/>
<rect x="20" y="20" width="4" height="16" fill="${C.gold}"/>
<text class="h7" x="32" y="33" font-size="13" letter-spacing="3" fill="${C.cream}">RANKED</text>
<text class="h6" x="380" y="33" text-anchor="end" font-size="11" letter-spacing="2" fill="${C.muted}">LAST 365 DAYS</text>
<circle class="glow" cx="${ex}" cy="${ey}" r="60" fill="url(#g)"/>
<g class="em"><image href="${await rankIcon(r.t)}" x="${ex - 58}" y="${ey - 58}" width="116" height="116"><title>${r.name}</title></image></g>
<text class="h6" x="${barX}" y="68" font-size="11" letter-spacing="3" fill="${C.muted}">CURRENT RANK</text>
<text class="t" x="${barX}" y="98" font-size="${nameSize}" fill="${tier.color}">${r.name}</text>
<text class="h7" x="${barX}" y="122" font-size="15" letter-spacing="1" fill="${C.cream}">${totalText}</text>
<rect x="${barX}" y="134" width="${barW}" height="6" fill="${C.line}"/>
<g class="bar"><rect x="${barX}" y="134" width="${fill}" height="6" fill="${tier.color}"/>
  <rect x="${barX - 60}" y="134" width="60" height="6" fill="url(#shine)" clip-path="url(#barClip)"><animate attributeName="x" values="${barX - 60};${barX + barW}" dur="2.6s" begin="1.8s" repeatCount="indefinite"/></rect></g>
${stars}
<text class="h7" x="${starLabelX}" y="165" font-size="13" letter-spacing="1" fill="${C.cream}">${starText}</text>
<text class="h6" x="380" y="182" text-anchor="end" font-size="11" letter-spacing="1.5" fill="${C.muted}">${nextText}</text>
${ladder}
</svg>`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [user, out] = process.argv.slice(2);
  const total = await fetchTotal(user);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, await renderRankCard(total));
  const r = rankFor(total);
  console.log(`${total} contributions -> ${r.name} (${r.stars} stars)`);
}
