// Generates the static animated SVGs for the GitHub profile README (Mobile Legends theme): hero select,
// chat buttons, skills, item shop, battle report, achievements, divider and footer. The live cards
// (Land of Dawn, match history, rank, views, Spotify) are drawn hourly by .github/scripts in the workflow.
// Official Mobile Legends: Bang Bang assets (via the Mobile Legends Fandom wiki) live in tools/mlbb and
// .github/mlbb and are used as fan content; the README carries the notice.
// Usage: node tools/build.mjs           -> writes assets/*.svg
//        node tools/build.mjs --preview -> also writes preview/index.html (every image inlined)
// Set PROFILE_USER to your GitHub username when you fork this.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Works from the profile repo itself, or from a workspace that keeps the repo in ./profile.
const PROFILE = existsSync(join(ROOT, "profile", ".github")) ? join(ROOT, "profile") : ROOT;
const OUT = join(PROFILE, "assets");
const USER = process.env.PROFILE_USER || "HanzzzBD";
const script = (name) => import(pathToFileURL(join(PROFILE, ".github", "scripts", name)).href);
const { C: BASE, FONT_CSS, star, fetchTotal, renderRankCard } = await script("rank-card.mjs");
const { fetchStats, renderCareerCard } = await script("career-card.mjs");
const { fetchGrid, renderRangeCard } = await script("range-card.mjs");
const { fetchViews, renderViewsCard } = await script("views-card.mjs");
const { renderSpotifyCard } = await script("spotify-card.mjs");

const C = { ...BASE, panel2: "#18264a" };
const TITLE = "Cinzel";
const DISPLAY = "Anton";
const HUD = "Rajdhani";
const MONO = "JetBrains Mono";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// ---------- helpers ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const uniq = (strings) => [...new Set(strings.join("").split(""))].join("");

// Google Fonts subsets a face to just the glyphs we pass in `text`, so each SVG embeds a few KB.
async function fontFace(family, weight, text) {
  const fam = family.replace(/ /g, "+") + (family === DISPLAY ? "" : `:wght@${weight}`);
  const url = `https://fonts.googleapis.com/css2?family=${fam}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url, { headers: { "User-Agent": UA } })).text();
  const src = css.match(/url\((https:[^)]+)\)/)?.[1];
  if (!src) throw new Error(`No font for ${family} ${weight}:\n${css}`);
  const buf = Buffer.from(await (await fetch(src)).arrayBuffer());
  return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${buf.toString("base64")}) format('woff2')}`;
}

const reducedMotion = (extra = "") =>
  `@media (prefers-reduced-motion: reduce){*{animation:none!important}${extra}}`;

// MLBB panels: cut top-left and bottom-right corners, like the in-game frames.
const cham = (x, y, w, h, c = 12) => `M${x + c} ${y}H${x + w}V${y + h - c}L${x + w - c} ${y + h}H${x}V${y + c}Z`;

// The gold gradient MLBB paints its titles and frames with.
const goldGrad = (id, vertical = true) =>
  `<linearGradient id="${id}" x1="0" x2="${vertical ? 0 : 1}" y1="0" y2="${vertical ? 1 : 0}"><stop offset="0" stop-color="#ffe7a3"/><stop offset=".5" stop-color="${C.gold}"/><stop offset="1" stop-color="#b9781c"/></linearGradient>`;

function brackets(x, y, w, h, len, color, sw = 2) {
  const p = [
    `M${x} ${y + len}V${y}H${x + len}`,
    `M${x + w - len} ${y}H${x + w}V${y + len}`,
    `M${x + w} ${y + h - len}V${y + h}H${x + w - len}`,
    `M${x + len} ${y + h}H${x}V${y + h - len}`,
  ];
  return `<path d="${p.join("")}" fill="none" stroke="${color}" stroke-width="${sw}" opacity=".5"/>`;
}

// Crossed swords, the kill marker in the MLBB kill feed.
const swords = (x, y) =>
  `<g transform="translate(${x} ${y})" stroke="${C.gold}" stroke-width="2" stroke-linecap="round"><path d="M-9 -9L8 8M9 -9L-8 8"/><path d="M4 9.5l5.5 -5.5M-4 9.5l-5.5 -5.5" stroke-width="2.4"/></g>`;

// skillicons.dev has no GSAP or Expo icon, so draw them in the same style from the simple-icons logos.
const FALLBACK_ICONS = { gsap: { slug: "greensock", color: "#88CE02" }, expo: { slug: "expo", color: "#ffffff" } };
const iconCache = new Map();
async function icon(id) {
  if (iconCache.has(id)) return iconCache.get(id);
  let svg;
  if (FALLBACK_ICONS[id]) {
    const { slug, color } = FALLBACK_ICONS[id];
    const logo = await (await fetch(`https://cdn.jsdelivr.net/npm/simple-icons@13.21.0/icons/${slug}.svg`)).text();
    const path = logo.match(/<path d="([^"]+)"/)[1];
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 256 256"><rect width="256" height="256" rx="60" fill="#242938"/><path d="${path}" fill="${color}" transform="translate(48 48) scale(6.667)"/></svg>`;
  } else {
    svg = await (await fetch(`https://skillicons.dev/icons?i=${id}&theme=dark`)).text();
    if (svg.includes("undefined")) throw new Error(`skillicons.dev has no icon "${id}"`);
  }
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  iconCache.set(id, uri);
  return uri;
}

function wrap(text, max) {
  const out = [];
  let cur = "";
  for (const w of text.split(" ")) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > max && cur) { out.push(cur); cur = w; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

// Panel frame + section heading shared by the content cards.
const sectionHead = (title, sub, size = 36) =>
  `<rect x="48" y="52" width="10" height="34" fill="${C.gold}"/>
<text class="t" x="70" y="84" font-size="${size}" fill="url(#titleGold)">${esc(title)}</text>
${sub ? `<text class="h6" x="70" y="110" font-size="15" letter-spacing="4" fill="${C.muted}">${esc(sub)}</text>` : ""}`;
const frame = (W, H) => `<defs>${goldGrad("titleGold")}</defs><path d="${cham(0.75, 0.75, W - 1.5, H - 1.5, 28)}" fill="${C.bg}" stroke="${C.line}" stroke-width="1.5"/>`;

// Official Mobile Legends assets kept in tools/mlbb, inlined as data URIs.
const asset = async (file) => `data:image/${file.endsWith(".jpg") ? "jpeg" : "png"};base64,${(await readFile(join(ROOT, "tools", "mlbb", file))).toString("base64")}`;

// ---------- hero: hero select ----------
async function hero() {
  const W = 1200, H = 360;
  const label = "HERO // HANZZZBD";
  const first = "HADRIAN", last = "RANGGA";
  const roles = ["BUILDS BACKEND SYSTEMS", "SHIPS WEB & MOBILE APPS", "DEPLOYS WITH DOCKER & NGINX", "EXPLORES AI / ML"];
  const info = [["ROLE", "BACKEND ENGINEER", 64], ["SQUAD", "SMKN 4 BANDUNG", 270], ["SERVER", "ID · BANDUNG", 470]];
  const marquee = "SOFTWARE DEVELOPER  ·  ";
  const btn = ["CONFIRM", "HERO LOCKED"];

  const title = await fontFace(TITLE, 900, uniq([first, last, ...btn]));
  const display = await fontFace(DISPLAY, 400, marquee);
  const h6 = await fontFace(HUD, 600, uniq([label, ...roles, "//", "ASSASSIN", ...info.map((i) => i[0])]));
  const h7 = await fontFace(HUD, 700, uniq(info.map((i) => i[1])));

  const ex = 960, ey = 160;
  const portrait = `data:image/jpeg;base64,${(await readFile(join(ROOT, "tools", "hadrian.jpg"))).toString("base64")}`; // my own photo
  const roleIcon = await asset("assassin.png");
  const pw = 222, ph = 360, px = ex - pw / 2;
  const roleEls = roles
    .map((t, i) => `<text class="h6 role" x="64" y="282" font-size="18" letter-spacing="2" fill="${C.cream}" style="animation-delay:${i * 3}s"><tspan fill="${C.gold}">// </tspan>${esc(t)}</text>`)
    .join("");
  const infoEls = info
    .map(([k, v, x], i) => `${i ? `<line x1="${x - 16}" x2="${x - 16}" y1="300" y2="340" stroke="${C.line}"/>` : ""}<text class="h6" x="${x}" y="313" font-size="13" letter-spacing="3" fill="${C.muted}">${k}</text><text class="h7" x="${x}" y="337" font-size="21" letter-spacing="1" fill="${C.cream}">${esc(v)}</text>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Hero select screen: Hadrian Rangga Ardiantara, backend engineer, squad SMKN 4 Bandung, server Indonesia">
<title>Hadrian Rangga Ardiantara</title>
<style>${title}${display}${h6}${h7}${FONT_CSS}
.in{opacity:0;animation:in .6s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes in{from{opacity:0;transform:translateX(-28px)}to{opacity:1;transform:none}}
.pop{opacity:0;transform-origin:${ex}px ${ey}px;animation:pop .7s .3s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes pop{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:none}}
.g1,.g2{opacity:0;animation:glitch 5s 2s infinite steps(1)}
.g2{animation-delay:2.07s}
@keyframes glitch{0%{opacity:0}92%{opacity:1;transform:translate(-6px,0)}94%{opacity:1;transform:translate(5px,0)}96%{opacity:1;transform:translate(-2px,0)}98%,100%{opacity:0}}
.role{opacity:0;animation:role 12s infinite}
@keyframes role{0%{opacity:0;transform:translateY(8px)}3%,22%{opacity:1;transform:none}25%,100%{opacity:0;transform:translateY(-8px)}}
.spin{transform-origin:${ex}px ${ey}px;animation:spin 30s linear infinite}
.spin.r{animation-duration:16s;animation-direction:reverse}
@keyframes spin{to{transform:rotate(360deg)}}
.marq{animation:marq 40s linear infinite}
@keyframes marq{to{transform:translateX(-1600px)}}
.b1{animation:b1 6s infinite}.b2{opacity:0;animation:b2 6s infinite}
@keyframes b1{0%,70%{opacity:1}72%,100%{opacity:0}}
@keyframes b2{0%,70%{opacity:0}72%,100%{opacity:1}}
.bbg{animation:bbg 6s infinite}
@keyframes bbg{0%,70%{fill:${C.gold}}72%,100%{fill:${C.cream}}}
.timer{transform-origin:0 0;animation:timer 10s linear infinite}
@keyframes timer{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.bob{animation:bob 3.2s ease-in-out infinite}
@keyframes bob{50%{transform:translateY(-5px)}}
${reducedMotion(".in,.pop{opacity:1}.role:first-of-type{opacity:1}")}
</style>
<defs>
  <clipPath id="card"><path d="${cham(0, 0, W, H, 32)}"/></clipPath>
  <pattern id="diag" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="14" stroke="${C.line}" stroke-width="1"/></pattern>
  <pattern id="hazard" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
    <rect width="8" height="16" fill="${C.gold}"/>
  </pattern>
  <clipPath id="panel"><polygon points="800,0 ${W},0 ${W},${H} 700,${H}"/></clipPath>
  <clipPath id="portrait"><path d="${cham(px, 18, pw, ph - 36, 18)}"/></clipPath>
  <linearGradient id="portraitShade" x1="0" x2="0" y1="0" y2="1"><stop offset=".55" stop-color="${C.bg}" stop-opacity="0"/><stop offset="1" stop-color="${C.bg}" stop-opacity=".95"/></linearGradient>
  ${goldGrad("gold")}
  <radialGradient id="aura"><stop offset="0" stop-color="#7d5cff" stop-opacity=".5"/><stop offset="1" stop-color="#7d5cff" stop-opacity="0"/></radialGradient>
  <clipPath id="top"><rect x="0" y="0" width="${W}" height="180"/></clipPath>
  <clipPath id="bot"><rect x="0" y="180" width="${W}" height="${H}"/></clipPath>
</defs>
<g clip-path="url(#card)">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <g opacity=".18"><g class="marq">
    <text class="d" x="0" y="340" font-size="190" fill="none" stroke="${C.line}" stroke-width="1.5" textLength="1600" lengthAdjust="spacingAndGlyphs">${esc(marquee.repeat(2))}</text>
    <text class="d" x="1600" y="340" font-size="190" fill="none" stroke="${C.line}" stroke-width="1.5" textLength="1600" lengthAdjust="spacingAndGlyphs">${esc(marquee.repeat(2))}</text>
  </g></g>
  <polygon points="800,0 ${W},0 ${W},${H} 700,${H}" fill="${C.panel}"/>
  <polygon points="800,0 ${W},0 ${W},${H} 700,${H}" fill="url(#diag)" opacity=".35"/>
  <g clip-path="url(#panel)"><circle cx="${ex}" cy="${ey}" r="200" fill="url(#aura)"/></g>
  <polygon points="782,0 800,0 700,${H} 682,${H}" fill="url(#gold)"/>
  <rect x="1080" y="0" width="${W - 1080}" height="14" fill="url(#hazard)"/>

  <g class="pop">
    <circle cx="${ex}" cy="${ey}" r="150" fill="none" stroke="${C.cream}" stroke-opacity=".25" stroke-dasharray="2 10" class="spin"/>
    <circle cx="${ex}" cy="${ey}" r="132" fill="none" stroke="${C.gold}" stroke-width="3" stroke-dasharray="110 97.4" class="spin r"/>
    <g clip-path="url(#portrait)"><image href="${portrait}" x="${px}" y="0" width="${pw}" height="${ph}" preserveAspectRatio="xMidYMid slice"/><rect x="${px}" y="0" width="${pw}" height="${ph}" fill="url(#portraitShade)"/></g>
    <path d="${cham(px, 18, pw, ph - 36, 18)}" fill="none" stroke="url(#gold)" stroke-width="2.5"/>
    <g class="bob"><g transform="translate(${px + pw - 8} 34)"><rect x="-20" y="-20" width="40" height="40" transform="rotate(45)" fill="${C.bg}" stroke="url(#gold)" stroke-width="2"/><image href="${roleIcon}" x="-17" y="-17" width="34" height="34"><title>Assassin</title></image></g></g>
    <text class="h6" x="${px + 16}" y="${ph - 76}" font-size="12" letter-spacing="4" fill="${C.gold}">ASSASSIN</text>
  </g>
  ${brackets(812, 10, 296, 300, 18, C.gold, 1.5)}

  <g transform="translate(${ex - 100} 296)">
    <path class="bbg" d="${cham(0, 0, 200, 44, 10)}" fill="${C.gold}"/>
    <text class="t b1" x="100" y="30" text-anchor="middle" font-size="19" letter-spacing="3" fill="${C.bg}">${btn[0]}</text>
    <text class="t b2" x="100" y="30" text-anchor="middle" font-size="16" letter-spacing="1" fill="${C.bg}">${btn[1]}</text>
  </g>

  <g class="in" style="animation-delay:.1s"><rect x="64" y="58" width="10" height="10" fill="${C.gold}" transform="rotate(45 69 63)"/><text class="h6" x="84" y="68" font-size="16" letter-spacing="4" fill="${C.muted}">${esc(label)}</text></g>
  <g class="in" style="animation-delay:.2s">
    <text class="t" x="64" y="178" font-size="92" textLength="560" lengthAdjust="spacingAndGlyphs" fill="url(#gold)">${first}</text>
    <text class="t g1" x="64" y="178" font-size="92" textLength="560" lengthAdjust="spacingAndGlyphs" fill="${C.red}" clip-path="url(#top)">${first}</text>
    <text class="t g2" x="64" y="178" font-size="92" textLength="560" lengthAdjust="spacingAndGlyphs" fill="${C.cyan}" clip-path="url(#bot)">${first}</text>
  </g>
  <g class="in" style="animation-delay:.4s"><text class="t" x="64" y="240" font-size="48" textLength="330" lengthAdjust="spacingAndGlyphs" fill="${C.gold}" fill-opacity=".12" stroke="${C.gold}" stroke-width="1.5">${last}</text></g>
  ${roleEls}
  <g class="in" style="animation-delay:.7s">${infoEls}</g>

  <rect x="0" y="${H - 5}" width="${W}" height="5" fill="${C.line}"/>
  <rect class="timer" x="0" y="${H - 5}" width="${W}" height="5" fill="${C.gold}"/>
</g>
<path d="${cham(0.75, 0.75, W - 1.5, H - 1.5, 32)}" fill="none" stroke="${C.line}" stroke-width="1.5"/>
</svg>`;
}

// ---------- skills: passive / skill 1 / skill 2 / ultimate ----------
const SKILLS = [
  { key: "P", type: "PASSIVE", name: "CLEAN TYPES", icon: "ts", desc: "Types every line so bugs fall before the fight.", tags: "TypeScript · JavaScript · Python", charges: 1 },
  { key: "1", type: "SKILL 1", name: "FRONTLINE UI", icon: "react", desc: "Dashes in with fast, responsive and animated UI.", tags: "React · Vite · Tailwind CSS · GSAP", charges: 2 },
  { key: "2", type: "SKILL 2", name: "BACKEND CORE", icon: "nodejs", desc: "REST APIs, auth, RBAC, queues and workers on call.", tags: "Node.js · Express · Laravel · BullMQ", charges: "sig" },
  { key: "U", type: "ULTIMATE", name: "DEPLOY STRIKE", icon: "docker", desc: "Ships the whole stack to a VPS in one push.", tags: "Docker · Nginx · Linux · GitHub Actions", charges: "ult" },
];

async function skills() {
  const W = 1200, H = 470;
  const title = "SKILLS", sub = "LOADOUT // HADRIAN", right = "ASSASSIN · BACKEND";
  const cinzel = await fontFace(TITLE, 900, uniq([title, ...SKILLS.map((a) => a.key + a.name)]));
  const h6 = await fontFace(HUD, 600, uniq([sub, right, "READY", ...SKILLS.map((a) => a.type + a.desc)]));
  const mono = await fontFace(MONO, 500, uniq(SKILLS.map((a) => a.tags)));

  const cw = 264, ch = 304, gap = 16, top = 134;
  let cards = "";
  for (let i = 0; i < SKILLS.length; i++) {
    const a = SKILLS[i];
    const x = 48 + i * (cw + gap), y = top;
    const ult = a.charges === "ult";
    const desc = wrap(a.desc, 27).map((l, j) => `<text class="h6" x="${x + 20}" y="${y + 170 + j * 22}" font-size="17" fill="${C.soft}">${esc(l)}</text>`).join("");
    const tags = wrap(a.tags, 27).map((l, j) => `<text class="m" x="${x + 20}" y="${y + 240 + j * 18}" font-size="12.5" fill="${C.cyan}">${esc(l)}</text>`).join("");
    let charges = "";
    const py = y + ch - 30;
    if (typeof a.charges === "number") {
      for (let k = 0; k < a.charges; k++) charges += `<rect x="${x + 20 + k * 22}" y="${py}" width="16" height="6" fill="${C.cream}"/>`;
    } else if (a.charges === "sig") {
      charges = `<rect x="${x + 20}" y="${py}" width="60" height="6" fill="${C.line}"/><rect class="sig" x="${x + 20}" y="${py}" width="60" height="6" fill="${C.cream}" style="transform-origin:${x + 20}px ${py}px"/>`;
    } else {
      for (let k = 0; k < 7; k++) {
        const px = x + 26 + k * 20;
        charges += `<rect x="${px - 5}" y="${py - 2}" width="10" height="10" transform="rotate(45 ${px} ${py + 3})" fill="none" stroke="${C.gold}" stroke-opacity=".5"/>`;
        charges += `<rect class="pip" x="${px - 5}" y="${py - 2}" width="10" height="10" transform="rotate(45 ${px} ${py + 3})" fill="${C.gold}" style="animation-delay:${(k * 0.45).toFixed(2)}s"/>`;
      }
      charges += `<text class="h6 ready" x="${x + cw - 20}" y="${py + 8}" text-anchor="end" font-size="15" letter-spacing="3" fill="${C.gold}">READY</text>`;
    }
    // Skill key in a round MLBB-style skill button.
    cards += `<g class="card" style="animation-delay:${(0.2 + i * 0.12).toFixed(2)}s">
  <path d="${cham(x, y, cw, ch, 16)}" fill="${ult ? C.panel2 : C.panel}" stroke="${ult ? C.gold : C.line}" stroke-opacity="${ult ? 0.8 : 1}"/>
  <rect x="${x + 16}" y="${y}" width="56" height="3" fill="${C.gold}"/>
  <circle cx="${x + 42}" cy="${y + 44}" r="23" fill="${ult ? "url(#titleGold)" : C.bg}" stroke="${C.gold}" stroke-width="2"/>
  ${ult ? `<circle class="ring" cx="${x + 42}" cy="${y + 44}" r="23" fill="none" stroke="${C.gold}" stroke-width="2"/>` : ""}
  <text class="t" x="${x + 42}" y="${y + 54}" text-anchor="middle" font-size="26" fill="${ult ? C.bg : C.cream}">${a.key}</text>
  <image href="${await icon(a.icon)}" x="${x + cw - 68}" y="${y + 20}" width="48" height="48"/>
  <text class="h6" x="${x + 20}" y="${y + 98}" font-size="13" letter-spacing="3" fill="${ult ? C.gold : C.muted}">${a.type}</text>
  <text class="t" x="${x + 20}" y="${y + 132}" font-size="22" fill="${C.cream}">${esc(a.name)}</text>
  ${desc}${tags}${charges}
</g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Skills. Passive, Clean Types: TypeScript, JavaScript, Python. Skill 1, Frontline UI: React, Vite, Tailwind CSS, GSAP. Skill 2, Backend Core: Node.js, Express, Laravel, BullMQ. Ultimate, Deploy Strike: Docker, Nginx, Linux, GitHub Actions.">
<title>Skills</title>
<style>${cinzel}${h6}${mono}${FONT_CSS}
.card{opacity:0;animation:rise .6s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
.sig{animation:sig 4s ease-in-out infinite}
@keyframes sig{0%{transform:scaleX(0)}70%,100%{transform:scaleX(1)}}
.pip{opacity:0;animation:pip 6s infinite}
@keyframes pip{0%{opacity:0}6%,85%{opacity:1}100%{opacity:0}}
.ready{opacity:0;animation:ready 6s infinite}
@keyframes ready{0%,52%{opacity:0}55%,62%,70%,85%{opacity:1}58%,66%{opacity:.3}100%{opacity:0}}
.ring{animation:ring 2s ease-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes ring{from{opacity:.9;transform:scale(1)}to{opacity:0;transform:scale(1.5)}}
${reducedMotion(".card,.pip,.ready{opacity:1}.ring{display:none}")}
</style>
${frame(W, H)}
${sectionHead(title, sub)}
<text class="h6" x="1152" y="86" text-anchor="end" font-size="16" letter-spacing="5" fill="${C.gold}">${right}</text>
<line x1="${1152 - 190}" x2="1152" y1="98" y2="98" stroke="${C.line}"/>
${cards}
</svg>`;
}

// ---------- item shop: the tech stack as an MLBB build ----------
const SHOP = [
  { cat: "ATTACK", item: "attack", sub: "LANGUAGES", items: [["ts", "TypeScript", 3010], ["js", "JavaScript", 2400], ["python", "Python", 2250], ["php", "PHP", 1980], ["cs", "C#", 1800]] },
  { cat: "MAGIC", item: "magic", sub: "FRONTEND", items: [["react", "React", 2850], ["tailwind", "Tailwind", 2140], ["vite", "Vite", 1950], ["gsap", "GSAP", 1880], ["html", "HTML", 900], ["css", "CSS", 900]] },
  { cat: "DEFENSE", item: "defense", sub: "BACKEND & DATA", items: [["nodejs", "Node.js", 2470], ["express", "Express", 2010], ["laravel", "Laravel", 2200], ["postgres", "PostgreSQL", 2460], ["mysql", "MySQL", 1950], ["redis", "Redis", 1800]] },
  { cat: "MOVEMENT", item: "movement", sub: "MOBILE & GAME", items: [["expo", "Expo", 1700], ["androidstudio", "Android", 1500], ["unity", "Unity", 1650], ["blender", "Blender", 1400]] },
  { cat: "JUNGLE", item: "jungle", sub: "DEVOPS & TOOLS", items: [["docker", "Docker", 2300], ["nginx", "Nginx", 1820], ["linux", "Linux", 1700], ["githubactions", "Actions", 1520], ["git", "Git", 900], ["vscode", "VS Code", 300]] },
];

async function shop() {
  const W = 1200;
  const title = "ITEM SHOP", sub = "TECH STACK // RECOMMENDED BUILD";
  const names = SHOP.flatMap((c) => c.items.map((i) => i[1].toUpperCase()));
  const cinzel = await fontFace(TITLE, 900, uniq([title, ...SHOP.map((c) => c.cat)]));
  const display = await fontFace(DISPLAY, 400, "20,460");
  const h6 = await fontFace(HUD, 600, uniq([sub, "BATTLE POINTS", ...SHOP.map((c) => c.sub)]));
  // Official Battle Points and in-match gold icons, each defined once and reused.
  const bp = await asset("bp.png");
  const gold = await asset("gold.png");
  const h7 = await fontFace(HUD, 700, uniq(names));
  const mono = await fontFace(MONO, 500, "0123456789");

  const colW = 208, gap = 16, tileH = 54, rowGap = 10, tilesTop = 200;
  const rows = Math.max(...SHOP.map((c) => c.items.length));
  const H = tilesTop + rows * (tileH + rowGap) + 30;
  let cols = "";
  const positions = [];
  let n = 0;
  for (let ci = 0; ci < SHOP.length; ci++) {
    const c = SHOP[ci];
    const x = 48 + ci * (colW + gap);
    cols += `<text class="t" x="${x}" y="156" font-size="20" fill="${C.cream}">${c.cat}</text>`;
    cols += `<text class="h6" x="${x}" y="180" font-size="13" letter-spacing="3" fill="${C.muted}">${esc(c.sub)}</text>`;
    cols += `<rect x="${x}" y="188" width="36" height="2" fill="${C.gold}"/>`;
    // Official item icon for the shop category, right-aligned in the column header.
    cols += `<image href="${await asset(`items/${c.item}.png`)}" x="${x + colW - 44}" y="136" width="44" height="44"/><rect x="${x + colW - 44}" y="136" width="44" height="44" rx="6" fill="none" stroke="${C.gold}" stroke-opacity=".6"/>`;
    for (let ri = 0; ri < c.items.length; ri++) {
      const [id, name, price] = c.items[ri];
      const y = tilesTop + ri * (tileH + rowGap);
      positions.push([x, y]);
      cols += `<g class="tile" style="animation-delay:${(0.15 + n * 0.035).toFixed(2)}s">
  <path d="${cham(x, y, colW, tileH, 10)}" fill="${C.panel}" stroke="${C.line}"/>
  <image href="${await icon(id)}" x="${x + 12}" y="${y + 11}" width="32" height="32"/>
  <text class="h7" x="${x + 56}" y="${y + 25}" font-size="17" letter-spacing=".5" fill="${C.cream}">${esc(name.toUpperCase())}</text>
  <use href="#gold" x="${x + 56}" y="${y + 33}" width="12" height="12"/><text class="m" x="${x + 73}" y="${y + 43}" font-size="12" fill="${C.gold}">${price}</text>
</g>`;
      n++;
    }
  }
  const step = 0.7;
  const values = positions.map(([x, y]) => `${x} ${y}`).join(";");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Item shop, the tech stack as a Mobile Legends build. Languages: TypeScript, JavaScript, Python, PHP, C#. Frontend: React, Tailwind, Vite, GSAP, HTML, CSS. Backend and data: Node.js, Express, Laravel, PostgreSQL, MySQL, Redis. Mobile and game: Expo, Android, Unity, Blender. DevOps and tools: Docker, Nginx, Linux, GitHub Actions, Git, VS Code.">
<title>Item shop</title>
<style>${cinzel}${display}${h6}${h7}${mono}${FONT_CSS}
.tile{opacity:0;animation:tile .45s ease-out forwards}
@keyframes tile{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.sel{opacity:0;animation:selIn .3s 1.4s forwards}
@keyframes selIn{to{opacity:1}}
${reducedMotion(".tile{opacity:1}.sel{display:none}")}
</style>
${frame(W, H)}
${sectionHead(title, sub)}
<defs><symbol id="gold" viewBox="0 0 16 16"><image href="${gold}" width="16" height="16"/></symbol></defs>
<image href="${bp}" x="1010" y="58" width="30" height="30"/>
<text class="d" x="1152" y="86" text-anchor="end" font-size="36" fill="${C.cream}">20,460</text>
<text class="h6" x="1152" y="110" text-anchor="end" font-size="13" letter-spacing="4" fill="${C.muted}">BATTLE POINTS</text>
${cols}
<g class="sel"><g transform="translate(${positions[0][0]} ${positions[0][1]})">
  <animateTransform attributeName="transform" type="translate" values="${values}" dur="${(positions.length * step).toFixed(1)}s" begin="1.4s" repeatCount="indefinite" calcMode="discrete"/>
  <path d="${cham(0, 0, colW, tileH, 10)}" fill="${C.gold}" fill-opacity=".1" stroke="${C.gold}" stroke-width="2"/>
  <rect x="${colW - 8}" y="${tileH / 2 - 8}" width="3" height="16" fill="${C.gold}"/>
</g></g>
</svg>`;
}

// ---------- battle report + kill feed ----------
async function killfeed() {
  const W = 1200, H = 290;
  const title = "BATTLE REPORT";
  const report = [
    ["CURRENT MISSION", "Building web, backend and mobile apps"],
    ["TRAINING", "AI / ML · DevOps · system architecture"],
    ["MOTTO", "Learn hard now, relax later."],
  ];
  // The MLBB announcer calls each kill in a row.
  const kills = [["nodejs", "N+1 QUERIES", "FIRST BLOOD"], ["laravel", "SPAGHETTI CONTROLLERS", "DOUBLE KILL"], ["docker", "WORKS ON MY MACHINE", "TRIPLE KILL"], ["ts", "UNDEFINED IS NOT A FUNCTION", "MANIAC"]];
  const cinzel = await fontFace(TITLE, 900, uniq([title, ...kills.map((k) => k[2])]));
  const h6 = await fontFace(HUD, 600, uniq(report.map((r) => r[1])));
  const h7 = await fontFace(HUD, 700, uniq([...report.map((r) => r[0]), "HADRIAN", ...kills.map((k) => k[1])]));

  const left = report
    .map(([k, v], i) => `<g class="in" style="animation-delay:${(0.2 + i * 0.15).toFixed(2)}s"><text class="h7" x="48" y="${132 + i * 56}" font-size="13" letter-spacing="3" fill="${C.gold}">${k}</text><text class="h6" x="48" y="${156 + i * 56}" font-size="20" fill="${C.cream}">${esc(v)}</text></g>`)
    .join("");

  const kx = 624, kw = 528, kh = 44, kgap = 14, ky = 48;
  let feed = "";
  for (let i = 0; i < kills.length; i++) {
    const [id, enemy, call] = kills[i];
    const y = ky + i * (kh + kgap);
    feed += `<g class="kill" style="animation-delay:${(0.6 + i * 0.55).toFixed(2)}s">
  <path d="${cham(kx, y, kw, kh, 10)}" fill="${C.panel}" stroke="${C.line}"/>
  <rect x="${kx}" y="${y + 10}" width="4" height="${kh - 10}" fill="${C.cyan}"/>
  <text class="h7" x="${kx + 20}" y="${y + 29}" font-size="18" letter-spacing="1" fill="${C.cyan}">HADRIAN</text>
  <image href="${await icon(id)}" x="${kx + 108}" y="${y + 9}" width="26" height="26"/>
  ${swords(kx + 158, y + 22)}
  <text class="h7" x="${kx + 180}" y="${y + 29}" font-size="18" letter-spacing="1" fill="${C.red}">${esc(enemy)}</text>
  <text class="t" x="${kx + kw - 16}" y="${y + 28}" text-anchor="end" font-size="12" fill="${C.gold}">${call}</text>
</g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Battle report. Current mission: building web, backend and mobile apps. Training: AI and ML, DevOps, system architecture. Motto: learn hard now, relax later. Kill feed: Hadrian took down N+1 queries, spaghetti controllers, works on my machine, and undefined is not a function.">
<title>Battle report</title>
<style>${cinzel}${h6}${h7}${FONT_CSS}
.in{opacity:0;animation:in .6s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes in{from{opacity:0;transform:translateX(-20px)}to{opacity:1;transform:none}}
.kill{opacity:0;animation:kill 10s infinite}
@keyframes kill{0%{opacity:0;transform:translateX(40px)}4%{opacity:1;transform:none}78%{opacity:1;transform:none}86%,100%{opacity:0;transform:none}}
${reducedMotion(".in,.kill{opacity:1}")}
</style>
${frame(W, H)}
${sectionHead(title, "", 32)}
${left}
<line x1="592" x2="592" y1="48" y2="${H - 48}" stroke="${C.line}"/>
${feed}
</svg>`;
}

// ---------- achievements: MVP medals, the same size as the rank card ----------
const ACHIEVEMENTS = [
  { place: 2, event: "SATUCREANOVA 2026", detail: "WEB DEVELOPMENT · NAWASENA" },
  { place: 3, event: "TECHNOVA 2026", detail: "WEB DEVELOPMENT · WEB TRANSPARANSI MBG" },
  { place: 3, event: "INOVENTURE 2025", detail: "WEB DEVELOPMENT · SCHOOL WEBSITE" },
];
const MEDAL = { 1: ["#ffd75e", "#b9861c"], 2: ["#e6edf5", "#8c9bb0"], 3: ["#f0a46b", "#9a5a2c"] };

async function achievements() {
  const W = 400, H = 229;
  const head = "ACHIEVEMENTS";
  const ord = (n) => `${n}${n === 1 ? "ST" : n === 2 ? "ND" : n === 3 ? "RD" : "TH"}`;
  const cinzel = await fontFace(TITLE, 900, uniq(ACHIEVEMENTS.map((a) => ord(a.place))));
  const h6 = await fontFace(HUD, 600, uniq([...ACHIEVEMENTS.map((a) => a.detail)]));
  const h7 = await fontFace(HUD, 700, uniq([head, ...ACHIEVEMENTS.map((a) => a.event)]));
  const mvp = await asset("mvp.png");

  const rows = ACHIEVEMENTS.map((a, i) => {
    const y = 50 + i * 56;
    const [hi, lo] = MEDAL[a.place];
    const first = i === 0;
    return `<g class="row" style="animation-delay:${(0.15 + i * 0.12).toFixed(2)}s">
  <path d="${cham(12, y - 6, W - 24, 56, 8)}" fill="${first ? "#1b2140" : C.panel}"/>
  <rect x="12" y="${y + 2}" width="3" height="40" fill="${hi}"/>
  <defs><linearGradient id="m${i}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset="1" stop-color="${lo}"/></linearGradient></defs>
  <circle cx="42" cy="${y + 22}" r="19" fill="url(#m${i})"/>
  <circle cx="42" cy="${y + 22}" r="14.5" fill="none" stroke="${C.bg}" stroke-opacity=".35" stroke-width="1.5"/>
  <text class="t" x="42" y="${y + 27}" text-anchor="middle" font-size="12" fill="${C.bg}">${ord(a.place)}</text>
  <text class="h7" x="76" y="${y + 19}" font-size="16" fill="${C.cream}">${esc(a.event)}</text>
  <text class="h6" x="76" y="${y + 37}" font-size="12" letter-spacing=".5" fill="${C.muted}">${esc(a.detail)}</text>
  ${star(W - 34, y + 15, 6, hi)}
</g>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Achievements: ${ACHIEVEMENTS.map((a) => `${ord(a.place).toLowerCase()} place at ${a.event}, ${a.detail.toLowerCase()}`).join("; ")}">
<title>Achievements</title>
<style>${cinzel}${h6}${h7}${FONT_CSS}
.row{opacity:0;animation:in .5s forwards}
@keyframes in{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
.mvp{transform-origin:${W - 46}px 24px;animation:mvp 3s ease-in-out infinite}
@keyframes mvp{50%{transform:scale(1.08)}}
${reducedMotion(".row{opacity:1}")}
</style>
<path d="${cham(0.75, 0.75, W - 1.5, H - 1.5, 16)}" fill="${C.bg}" stroke="${C.line}" stroke-width="1.5"/>
<rect x="20" y="16" width="4" height="16" fill="${C.gold}"/>
<text class="h7" x="32" y="29" font-size="13" letter-spacing="3" fill="${C.cream}">${head}</text>
<image class="mvp" href="${mvp}" x="${W - 72}" y="2" width="52" height="47"><title>MVP</title></image>
${rows}
</svg>`;
}

// ---------- divider ----------
async function divider() {
  const W = 1200, H = 28, cx = W / 2, cy = H / 2;
  // The Land of Dawn, read like a lane ticker.
  const spots = ["LAND OF DAWN", "GOLD LANE", "MID LANE", "EXP LANE", "JUNGLE", "ROAM", "LORD", "TURTLE", "BASE"];
  const strip = spots.join("  ·  ") + "  ·  ";
  const h6 = await fontFace(HUD, 600, uniq([strip]));
  const SPAN = 1400;
  const text = (x) => `<text class="h6" x="${x}" y="${cy + 4}" font-size="11" letter-spacing="4" textLength="${SPAN}" lengthAdjust="spacing" fill="${C.muted}">${esc(strip)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Land of Dawn: ${spots.slice(1).join(", ").toLowerCase()}">
<style>${h6}${FONT_CSS}
.dm{transform-origin:${cx}px ${cy}px;animation:dm 2.4s ease-in-out infinite}@keyframes dm{50%{transform:scale(.6)}}
.ticker{animation:ticker 60s linear infinite}@keyframes ticker{to{transform:translateX(-${SPAN}px)}}
${reducedMotion()}</style>
<defs>
  <linearGradient id="fadeL" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".12" stop-color="#fff"/><stop offset=".88" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <mask id="m"><rect x="20" y="0" width="${cx - 90}" height="${H}" fill="url(#fadeL)"/><rect x="${cx + 70}" y="0" width="${cx - 90}" height="${H}" fill="url(#fadeL)"/></mask>
</defs>
<g mask="url(#m)"><g class="ticker">${text(0)}${text(SPAN)}</g></g>
<path d="M${cx - 60} ${cy}H${cx - 26}M${cx + 26} ${cy}H${cx + 60}" stroke="${C.gold}" stroke-width="2"/>
<g transform="rotate(45 ${cx} ${cy})"><rect class="dm" x="${cx - 7}" y="${cy - 7}" width="14" height="14" fill="${C.gold}"/></g>
</svg>`;
}

// ---------- footer: victory screen ----------
async function footer() {
  const W = 1200, H = 250;
  const big = "VICTORY", gg = "GG";
  const small = "THANKS FOR STOPPING BY  ·  SEE YOU IN THE LAND OF DAWN";
  const kda = ["15", "0", "7"];
  const cinzel = await fontFace(TITLE, 900, big + gg);
  const h7 = await fontFace(HUD, 700, uniq([small, "KDA", ...kda, "/", "MVP"]));
  const cx = W / 2;
  const mvp = await asset("mvp.png"); // MVP badge
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Victory. Thanks for stopping by, see you in the Land of Dawn.">
<title>Victory</title>
<style>${cinzel}${h7}${FONT_CSS}
.v{opacity:0;transform-origin:${cx}px 120px;animation:v .8s .2s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes v{from{opacity:0;transform:scale(1.35)}to{opacity:1;transform:none}}
.ln{transform-origin:${cx}px 0;transform:scaleX(0);animation:ln .9s .5s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes ln{to{transform:scaleX(1)}}
.fade{opacity:0;animation:fade .6s 1s forwards}
@keyframes fade{to{opacity:1}}
.mvp{opacity:0;transform-origin:1080px 125px;animation:mvp .35s 1.4s cubic-bezier(.3,1.6,.5,1) forwards}
@keyframes mvp{from{opacity:0;transform:scale(1.6) rotate(-14deg)}to{opacity:1;transform:rotate(-6deg)}}
.rays{transform-origin:1080px 125px;animation:rays 18s linear infinite}
@keyframes rays{to{transform:rotate(360deg)}}
${reducedMotion(".v,.fade{opacity:1}.ln{transform:none}.mvp{opacity:1;transform:rotate(-6deg)}")}
</style>
<defs>
  <clipPath id="card"><path d="${cham(0, 0, W, H, 28)}"/></clipPath>
  <linearGradient id="shine" x1="0" x2="${W}" y1="0" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${C.gold}"/><stop offset=".46" stop-color="${C.gold}"/><stop offset=".5" stop-color="#fff6d6"/><stop offset=".54" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.gold}"/>
    <animateTransform attributeName="gradientTransform" type="translate" values="-1200 0;1200 0" dur="4s" begin="1.2s" repeatCount="indefinite"/>
  </linearGradient>
  <radialGradient id="glow"><stop offset="0" stop-color="${C.gold}" stop-opacity=".35"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/></radialGradient>
</defs>
<g clip-path="url(#card)">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <text class="t" x="${cx}" y="300" text-anchor="middle" font-size="340" fill="none" stroke="${C.line}" stroke-width="2" opacity=".55">${gg}</text>
  <polygon points="${cx - 330},64 ${cx + 360},64 ${cx + 330},164 ${cx - 360},164" fill="${C.gold}" opacity=".08"/>
  <text class="h7 fade" x="${cx}" y="48" text-anchor="middle" font-size="20" letter-spacing="4"><tspan fill="${C.muted}" font-size="14" dx="-14">KDA </tspan><tspan fill="${C.cyan}">${kda[0]}</tspan><tspan fill="${C.muted}"> / </tspan><tspan fill="${C.red}">${kda[1]}</tspan><tspan fill="${C.muted}"> / </tspan><tspan fill="${C.cream}">${kda[2]}</tspan><tspan fill="${C.gold}" font-size="14" dx="14">MVP</tspan></text>
  <g class="ln"><rect x="${cx - 370}" y="112" width="100" height="3" fill="${C.gold}"/><rect x="${cx + 270}" y="112" width="100" height="3" fill="${C.gold}"/></g>
  <text class="t v" x="${cx}" y="146" text-anchor="middle" font-size="88" letter-spacing="4" fill="url(#shine)">${big}</text>
  <text class="h7 fade" x="${cx}" y="200" text-anchor="middle" font-size="18" letter-spacing="4" fill="${C.muted}">${esc(small)}</text>
  <circle cx="1080" cy="125" r="100" fill="url(#glow)"/>
  <g class="rays" opacity=".25">${Array.from({ length: 12 }, (_, i) => `<path d="M1080 125L${(1080 + 96 * Math.cos((i * Math.PI) / 6 - 0.08)).toFixed(1)} ${(125 + 96 * Math.sin((i * Math.PI) / 6 - 0.08)).toFixed(1)}L${(1080 + 96 * Math.cos((i * Math.PI) / 6 + 0.08)).toFixed(1)} ${(125 + 96 * Math.sin((i * Math.PI) / 6 + 0.08)).toFixed(1)}Z" fill="${C.gold}"/>`).join("")}</g>
  <image class="mvp" href="${mvp}" x="${1080 - 85}" y="${125 - 77}" width="170" height="155"/>
</g>
<path d="${cham(0.75, 0.75, W - 1.5, H - 1.5, 28)}" fill="none" stroke="${C.line}" stroke-width="1.5"/>
</svg>`;
}

// ---------- chat buttons (LinkedIn, Portfolio) ----------
async function chatButton(name, n, slug) {
  const W = 240, H = 60;
  const label = `CHAT // 0${n}`;
  const logo = await (await fetch(`https://cdn.jsdelivr.net/npm/simple-icons@13.21.0/icons/${slug}.svg`)).text();
  const path = logo.match(/<path d="([^"]+)"/)[1];
  const display = await fontFace(DISPLAY, 400, name);
  const h6 = await fontFace(HUD, 600, label);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${name}">
<title>${name}</title>
<style>${display}${h6}${FONT_CSS}
.go{animation:go 1.6s ease-in-out infinite}
@keyframes go{50%{transform:translateX(4px)}}
${reducedMotion()}
</style>
<defs>
  <clipPath id="c"><path d="${cham(0, 0, W, H, 12)}"/></clipPath>
  <linearGradient id="s" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  ${goldGrad("gold")}
</defs>
<g clip-path="url(#c)">
  <rect width="${W}" height="${H}" fill="${C.panel}"/>
  <rect width="60" height="${H}" fill="url(#gold)"/>
  <path d="${path}" fill="${C.bg}" transform="translate(17 17) scale(1.083)"/>
  <rect x="60" y="${H - 3}" width="${W - 60}" height="3" fill="${C.gold}" opacity=".5"/>
  <rect x="-80" y="0" width="80" height="${H}" fill="url(#s)" transform="skewX(-20)"><animate attributeName="x" values="-80;${W + 80}" dur="3.5s" repeatCount="indefinite"/></rect>
</g>
<path d="${cham(0.75, 0.75, W - 1.5, H - 1.5, 12)}" fill="none" stroke="${C.line}" stroke-width="1.5"/>
<text class="h6" x="76" y="24" font-size="11" letter-spacing="3" fill="${C.muted}">${label}</text>
<text class="d" x="76" y="47" font-size="23" letter-spacing="2" fill="${C.cream}">${name}</text>
<g class="go"><path d="M${W - 34} 22l8 8-8 8M${W - 26} 22l8 8-8 8" fill="none" stroke="${C.gold}" stroke-width="2.5"/></g>
</svg>`;
}

const dataUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

// ---------- main ----------
await mkdir(OUT, { recursive: true });
const built = {
  hero: await hero(),
  skills: await skills(),
  shop: await shop(),
  killfeed: await killfeed(),
  achievements: await achievements(),
  divider: await divider(),
  footer: await footer(),
  linkedin: await chatButton("LINKEDIN", 1, "linkedin"),
  portfolio: await chatButton("PORTFOLIO", 2, "vercel"),
};
for (const [name, svg] of Object.entries(built)) {
  await writeFile(join(OUT, `${name}.svg`), svg);
  console.log(`${name}.svg  ${(svg.length / 1024).toFixed(1)} KB`);
}

if (process.argv.includes("--preview")) {
  const tpl = await readFile(join(ROOT, "tools", "preview.template.html"), "utf8");
  const map = Object.fromEntries(Object.entries(built).map(([k, v]) => [k, dataUri(v)]));
  const last365 = await fetchTotal(USER);
  map.rank = dataUri(await renderRankCard(last365));
  // The workflow uses its GITHUB_TOKEN; locally the preview borrows the gh CLI login.
  const token = process.env.GITHUB_TOKEN || execSync("gh auth token").toString().trim();
  map.career = dataUri(await renderCareerCard(await fetchStats(USER, token), last365));
  map.range = dataUri(await renderRangeCard(await fetchGrid(USER)));
  // query_only read, so building the preview does not add a profile view.
  map.views = dataUri(await renderViewsCard(await fetchViews(`${USER}.${USER.toLowerCase()}`)));
  // Sample tracks, so the optional Spotify card can be checked before its secrets exist.
  map.spotify = dataUri(await renderSpotifyCard({ nowPlaying: true, tracks: [
    { title: "Rise", artist: "League of Legends, The Glitch Mob, Mako", art: null, playedAt: null },
    { title: "Legends Never Die", artist: "Against The Current", art: null, playedAt: new Date(Date.now() - 3600e3).toISOString() },
    { title: "Warriors", artist: "Imagine Dragons", art: null, playedAt: new Date(Date.now() - 86400e3).toISOString() },
  ] }));
  const avatar = Buffer.from(await (await fetch(`https://github.com/${USER}.png?size=200`)).arrayBuffer());
  const avatarType = avatar[0] === 0xff ? "image/jpeg" : "image/png";
  map.avatar = `data:${avatarType};base64,${avatar.toString("base64")}`;
  map.readme = (await readFile(join(PROFILE, "README.md"), "utf8"))
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in map)) throw new Error(`missing {{${k}}}`);
    return map[k];
  });
  await mkdir(join(ROOT, "preview"), { recursive: true });
  await writeFile(join(ROOT, "preview", "index.html"), html);
  console.log(`preview/index.html  ${(html.length / 1024).toFixed(1)} KB`);
}
