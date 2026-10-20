// Generates the static animated SVGs for the GitHub profile README (Mobile Legends theme): hero select,
// chat buttons (LinkedIn, Portfolio, Instagram), skills, item shop, battle report, achievements, divider and footer. The live cards
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
const { C: BASE, FONT_CSS, cham, star, fetchTotal, renderRankCard, screenDefs, screenBg, screenFrame, diamond, ornTitle, headBar, panel, pill } = await script("rank-card.mjs");
const { fetchStats, renderCareerCard } = await script("career-card.mjs");
const { fetchGrid, renderRangeCard } = await script("range-card.mjs");
const { fetchViews, renderViewsCard } = await script("views-card.mjs");
const { renderSpotifyCard } = await script("spotify-card.mjs");

const C = BASE;
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

// The gold gradient MLBB paints its titles and frames with.
const goldGrad = (id, vertical = true) =>
  `<linearGradient id="${id}" x1="0" x2="${vertical ? 0 : 1}" y1="0" y2="${vertical ? 1 : 0}"><stop offset="0" stop-color="#ffe7a3"/><stop offset=".5" stop-color="${C.gold}"/><stop offset="1" stop-color="#b9781c"/></linearGradient>`;

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

// Lobby backdrop + frame, and the centred "—◆ TITLE ◆—" heading shared by the 1200-wide cards.
const sectionHead = (title, sub, size = 34) =>
  `${ornTitle(600, 80, esc(title), { size, gap: title.length * size * 0.42 + 26, span: 120 })}
${sub ? `<text class="h6" x="600" y="108" text-anchor="middle" font-size="14" letter-spacing="5" fill="${C.muted}">${esc(sub)}</text>` : ""}`;
const frame = (W, H) => `<defs>${goldGrad("titleGold")}${screenDefs(W, H, 24)}</defs>${screenBg(W, H, 24)}${screenFrame(W, H, 24)}`;

// My photo (444x720, face near 222,260), zoomed onto the face, clipped round and reused with <use href="#me">.
const avatarDef = async (r) => `<clipPath id="meClip"><circle r="${r}"/></clipPath><g id="me"><image href="data:image/jpeg;base64,${(await readFile(join(ROOT, "tools", "hadrian.jpg"))).toString("base64")}" x="${-r * 2.22}" y="${-r * 2.5}" width="${r * 4.44}" height="${r * 7.2}" clip-path="url(#meClip)"/></g>`;

// Official Mobile Legends assets kept in tools/mlbb, inlined as data URIs.
const asset = async (file) => `data:image/${file.endsWith(".jpg") ? "jpeg" : "png"};base64,${(await readFile(join(ROOT, "tools", "mlbb", file))).toString("base64")}`;

// ---------- hero: the draft-pick screen ----------
async function hero() {
  const W = 1200, H = 400;
  const label = "HERO // HANZZZBD";
  const first = "HADRIAN", last = "RANGGA ARDIANTARA";
  const roles = ["BUILDS BACKEND SYSTEMS", "SHIPS WEB & MOBILE APPS", "DEPLOYS WITH DOCKER & NGINX", "EXPLORES AI / ML"];
  // The left column is the blue team's pick list: one slot per detail.
  const slots = [["ROLE", "BACKEND ENGINEER"], ["SQUAD", "SMKN 4 BANDUNG"], ["SERVER", "ID · BANDUNG"]];
  const banner = ["PICKING HERO", "00:30"];
  const btn = ["CONFIRM", "LOCKED"];
  const card = ["HADRIAN", "Backend Engineer"];
  const badge = "MYTHIC";

  const title = await fontFace(TITLE, 900, uniq([first, ...btn, badge]));
  const display = await fontFace(DISPLAY, 400, banner[1]);
  const h6 = await fontFace(HUD, 600, uniq([label, last, ...roles, "//", "ASSASSIN", banner[0], ...slots.map((s) => s[0]), card[1]]));
  const h7 = await fontFace(HUD, 700, uniq([...slots.map((s) => s[1]), card[0], "BLUE TEAM"]));

  const portrait = `data:image/jpeg;base64,${(await readFile(join(ROOT, "tools", "hadrian.jpg"))).toString("base64")}`; // my own photo
  const roleIcon = await asset("assassin.png");
  // Skin card, the portrait frame from the Collection screen.
  const pw = 250, ph = 316, px = 872, py = 58, ex = px + pw / 2;

  const slotIcons = [
    `<image href="${roleIcon}" x="-15" y="-15" width="30" height="30"/>`,
    `<path d="M0 -13L11 -8V1C11 8 6 12 0 14C-6 12 -11 8 -11 1V-8Z" fill="none" stroke="${C.cream}" stroke-width="2"/><path d="M-5 0l3.5 3.5L6 -4" fill="none" stroke="${C.gold}" stroke-width="2.2"/>`,
    `<circle r="12" fill="none" stroke="${C.cream}" stroke-width="2"/><ellipse rx="5" ry="12" fill="none" stroke="${C.cream}" stroke-width="1.6"/><path d="M-12 0H12M-10 -6H10M-10 6H10" stroke="${C.cream}" stroke-width="1.4"/>`,
  ];
  const slotEls = slots
    .map(([k, v], i) => {
      const y = 84 + i * 86;
      const on = i === 0;
      return `<g class="in" style="animation-delay:${(0.15 + i * 0.12).toFixed(2)}s">
  <rect x="0" y="${y}" width="330" height="70" fill="url(#slot${on ? "On" : ""})"/>
  <rect x="0" y="${y}" width="4" height="70" fill="${on ? C.gold : C.edge}"/>
  <circle cx="52" cy="${y + 35}" r="24" fill="${C.bg}" stroke="${on ? "url(#mbGold)" : C.edge}" stroke-width="2"/>
  <g transform="translate(52 ${y + 35})">${slotIcons[i]}</g>
  <text class="h6" x="92" y="${y + 29}" font-size="13" letter-spacing="3" fill="${on ? C.gold : C.muted}">${k}</text>
  <text class="h7" x="92" y="${y + 52}" font-size="21" letter-spacing="1" fill="${C.cream}">${esc(v)}</text>
</g>`;
    })
    .join("");
  const roleEls = roles
    .map((t, i) => `<text class="h6 role${i ? "" : " r0"}" x="600" y="262" text-anchor="middle" font-size="18" letter-spacing="2" fill="${C.soft}" style="animation-delay:${i * 3}s"><tspan fill="${C.gold}">// </tspan>${esc(t)}</text>`)
    .join("");
  // Gold button between two blue chevrons, like CLASSIC on the lobby.
  const bx = 600, by = 300, bw = 250, bh = 50;
  const chevron = (x, dir) => `<path d="M${x} 9l${16 * dir} ${bh / 2 - 9}l${-16 * dir} ${bh / 2 - 9}" fill="none" stroke="${C.cyan}" stroke-width="5" stroke-linejoin="round" opacity=".8"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Hero select screen: Hadrian Rangga Ardiantara, backend engineer, squad SMKN 4 Bandung, server Indonesia">
<title>Hadrian Rangga Ardiantara</title>
<style>${title}${display}${h6}${h7}${FONT_CSS}
.in{opacity:0;animation:in .6s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes in{from{opacity:0;transform:translateX(-28px)}to{opacity:1;transform:none}}
.pop{opacity:0;transform-origin:${ex}px 220px;animation:pop .7s .3s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes pop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}
.fade{opacity:0;animation:fade .7s .4s forwards}
@keyframes fade{to{opacity:1}}
.role{opacity:0;animation:role 12s infinite}
@keyframes role{0%{opacity:0;transform:translateY(8px)}3%,22%{opacity:1;transform:none}25%,100%{opacity:0;transform:translateY(-8px)}}
.spin{transform-origin:${ex}px 372px;transform-box:view-box;animation:spin 14s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.b1{animation:b1 6s infinite}.b2{opacity:0;animation:b2 6s infinite}
@keyframes b1{0%,70%{opacity:1}72%,100%{opacity:0}}
@keyframes b2{0%,70%{opacity:0}72%,100%{opacity:1}}
.timer{transform-origin:600px 0;animation:timer 10s linear infinite}
@keyframes timer{from{transform:scaleX(1)}to{transform:scaleX(0)}}
.tick{animation:tick 1s steps(1) infinite}
@keyframes tick{50%{fill:${C.gold}}}
.bob{animation:bob 3.2s ease-in-out infinite}
@keyframes bob{50%{transform:translateY(-5px)}}
.sweep{animation:sweep 4s 1.5s ease-in-out infinite}
@keyframes sweep{0%{transform:translateX(-${pw + 120}px)}40%,100%{transform:translateX(${pw + 120}px)}}
${reducedMotion(".in,.pop,.fade,.r0{opacity:1}")}
</style>
<defs>
  ${screenDefs(W, H, 24)}
  <linearGradient id="slot" x1="0" x2="1"><stop offset="0" stop-color="#1f4fa8" stop-opacity=".75"/><stop offset="1" stop-color="#1f4fa8" stop-opacity="0"/></linearGradient>
  <linearGradient id="slotOn" x1="0" x2="1"><stop offset="0" stop-color="#3a7bff" stop-opacity=".85"/><stop offset="1" stop-color="#3a7bff" stop-opacity="0"/></linearGradient>
  <linearGradient id="banner" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0c2a6e"/><stop offset="1" stop-color="#2a63c9"/></linearGradient>
  <linearGradient id="nameFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#b9d3ff"/></linearGradient>
  <linearGradient id="shade" x1="0" x2="0" y1="0" y2="1"><stop offset=".55" stop-color="${C.bg}" stop-opacity="0"/><stop offset="1" stop-color="${C.bg}" stop-opacity=".95"/></linearGradient>
  <linearGradient id="badge" x1="0" x2="1"><stop offset="0" stop-color="#7b3cff"/><stop offset="1" stop-color="#c04bff"/></linearGradient>
  <linearGradient id="shine" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="pad"><stop offset="0" stop-color="${C.cyan}" stop-opacity=".45"/><stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/></radialGradient>
  <clipPath id="portrait"><path d="${cham(px, py, pw, ph, 14)}"/></clipPath>
  <filter id="glow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="6" result="b"/><feFlood flood-color="#3f8cff" flood-opacity=".7"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
${screenBg(W, H, 24)}
<g clip-path="url(#mbClip)">
  <ellipse cx="${ex}" cy="372" rx="210" ry="34" fill="url(#pad)"/>
  <g class="spin"><ellipse cx="${ex}" cy="372" rx="170" ry="22" fill="none" stroke="${C.cyan}" stroke-opacity=".55" stroke-width="2" stroke-dasharray="30 14"/></g>
  <ellipse cx="${ex}" cy="372" rx="196" ry="28" fill="none" stroke="${C.edge}" stroke-opacity=".4"/>
  ${slotEls}
  <text class="h7" x="24" y="66" font-size="13" letter-spacing="4" fill="${C.cyan}">BLUE TEAM</text>
</g>

<g transform="translate(600 0)">
  <path d="M-170 0H170L146 56H-146Z" fill="url(#banner)"/>
  <path d="M-146 56H146" stroke="url(#mbGold)" stroke-width="2.5"/>
  ${diamond(0, 56, 6, "url(#mbGold)")}
  <text class="h6" x="0" y="22" text-anchor="middle" font-size="13" letter-spacing="4" fill="${C.soft}">${banner[0]}</text>
  <text class="d tick" x="0" y="48" text-anchor="middle" font-size="25" letter-spacing="2" fill="${C.cream}">${banner[1]}</text>
</g>
<rect x="430" y="64" width="340" height="3" fill="${C.line}"/>
<rect class="timer" x="430" y="64" width="340" height="3" fill="${C.cyan}"/>

<g class="fade">
  <text class="h6" x="600" y="112" text-anchor="middle" font-size="14" letter-spacing="5" fill="${C.muted}">${esc(label)}</text>
  <text class="t" x="600" y="190" text-anchor="middle" font-size="80" textLength="420" lengthAdjust="spacingAndGlyphs" fill="url(#nameFill)" filter="url(#glow)">${first}</text>
  <text class="h6" x="600" y="222" text-anchor="middle" font-size="18" letter-spacing="9" fill="${C.gold}">${last}</text>
  ${roleEls}
</g>

<g transform="translate(${bx} ${by})">
  ${chevron(-bw / 2 - 36, -1)}${chevron(bw / 2 + 36, 1)}
</g>
<g transform="translate(${bx - bw / 2} ${by})">
  <path d="M14 0H${bw - 14}L${bw} ${bh / 2}L${bw - 14} ${bh}H14L0 ${bh / 2}Z" fill="url(#mbGold)"/>
  <path d="M14 3H${bw - 14}" stroke="#fff6d6" stroke-width="1.5" opacity=".8"/>
  <path d="M14 0H${bw - 14}L${bw} ${bh / 2}L${bw - 14} ${bh}H14L0 ${bh / 2}Z" fill="none" stroke="#8a5a12" stroke-width="1.5"/>
  <text class="t b1" x="${bw / 2}" y="${bh / 2 + 8}" text-anchor="middle" font-size="22" letter-spacing="3" fill="#2b1a05">${btn[0]}</text>
  <text class="t b2" x="${bw / 2}" y="${bh / 2 + 8}" text-anchor="middle" font-size="22" letter-spacing="3" fill="#2b1a05">${btn[1]}</text>
</g>

<g class="pop">
  <path d="${cham(px - 6, py - 6, pw + 12, ph + 12, 18)}" fill="${C.bg}" stroke="${C.edge}" stroke-opacity=".6" stroke-width="1.5"/>
  <g clip-path="url(#portrait)">
    <image href="${portrait}" x="${px}" y="${py}" width="${pw}" height="${ph}" preserveAspectRatio="xMidYMid slice"/>
    <rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="url(#shade)"/>
    <rect class="sweep" x="${px}" y="${py}" width="90" height="${ph}" fill="url(#shine)" transform="skewX(-14)"/>
  </g>
  <path d="${cham(px, py, pw, ph, 14)}" fill="none" stroke="url(#mbGold)" stroke-width="2.5"/>
  <rect x="${px + 14}" y="${py + ph - 58}" width="${pw - 28}" height="1" fill="${C.edge}" opacity=".5"/>
  <text class="h7" x="${ex}" y="${py + ph - 32}" text-anchor="middle" font-size="22" letter-spacing="3" fill="${C.cream}">${card[0]}</text>
  <text class="h6" x="${ex}" y="${py + ph - 12}" text-anchor="middle" font-size="15" letter-spacing="1" fill="${C.cyan}">${card[1]}</text>
  <g transform="translate(${px + pw - 104} ${py + 14})"><path d="M10 0H96L86 26H0Z" fill="url(#badge)" stroke="#e9c9ff" stroke-opacity=".7"/><text class="t" x="48" y="19" text-anchor="middle" font-size="14" letter-spacing="2" fill="#fff">${badge}</text></g>
  <g class="bob"><g transform="translate(${px + 4} ${py + 4})"><rect x="-20" y="-20" width="40" height="40" transform="rotate(45)" fill="${C.bg}" stroke="url(#mbGold)" stroke-width="2"/><image href="${roleIcon}" x="-17" y="-17" width="34" height="34"><title>Assassin</title></image></g></g>
</g>
${screenFrame(W, H, 24)}
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
  const W = 1200, H = 480;
  const title = "SKILLS", sub = "LOADOUT // HADRIAN";
  const cinzel = await fontFace(TITLE, 900, uniq([title, ...SKILLS.map((a) => a.key + a.name)]));
  const h6 = await fontFace(HUD, 600, uniq([sub, "READY", ...SKILLS.map((a) => a.type + a.desc)]));
  const mono = await fontFace(MONO, 500, uniq(SKILLS.map((a) => a.tags)));

  const cw = 264, ch = 318, gap = 16, top = 134;
  let cards = "";
  for (let i = 0; i < SKILLS.length; i++) {
    const a = SKILLS[i];
    const x = 48 + i * (cw + gap), y = top, cx = x + cw / 2, cy = y + 66;
    const ult = a.charges === "ult";
    const desc = wrap(a.desc, 28).map((l, j) => `<text class="h6" x="${cx}" y="${y + 200 + j * 21}" text-anchor="middle" font-size="16.5" fill="${C.soft}">${esc(l)}</text>`).join("");
    const tags = wrap(a.tags, 30).map((l, j) => `<text class="m" x="${cx}" y="${y + 254 + j * 17}" text-anchor="middle" font-size="12" fill="${C.cyan}">${esc(l)}</text>`).join("");
    let charges = "";
    const py = y + ch - 22;
    if (typeof a.charges === "number") {
      const x0 = cx - (a.charges * 22 - 6) / 2;
      for (let k = 0; k < a.charges; k++) charges += `<rect x="${x0 + k * 22}" y="${py}" width="16" height="6" fill="${C.cream}"/>`;
    } else if (a.charges === "sig") {
      charges = `<rect x="${cx - 30}" y="${py}" width="60" height="6" fill="${C.line}"/><rect class="sig" x="${cx - 30}" y="${py}" width="60" height="6" fill="${C.cyan}" style="transform-origin:${cx - 30}px ${py}px"/>`;
    } else {
      for (let k = 0; k < 7; k++) {
        const px = cx - 92 + k * 20;
        charges += `<rect x="${px - 5}" y="${py - 2}" width="10" height="10" transform="rotate(45 ${px} ${py + 3})" fill="none" stroke="${C.gold}" stroke-opacity=".5"/>`;
        charges += `<rect class="pip" x="${px - 5}" y="${py - 2}" width="10" height="10" transform="rotate(45 ${px} ${py + 3})" fill="${C.gold}" style="animation-delay:${(k * 0.45).toFixed(2)}s"/>`;
      }
      charges += `<text class="h6 ready" x="${cx + 92}" y="${py + 8}" text-anchor="end" font-size="15" letter-spacing="3" fill="${C.gold}">READY</text>`;
    }
    // Round skill button with a glowing ring, the way MLBB draws skill and privilege icons.
    cards += `<g class="card" style="animation-delay:${(0.2 + i * 0.12).toFixed(2)}s">
  ${panel(x, y, cw, ch, 12, ult)}
  ${ult ? `<path d="${cham(x, y, cw, ch, 12)}" fill="url(#ultGlow)"/>` : ""}
  <circle cx="${cx}" cy="${cy}" r="46" fill="url(#skillGlow)"/>
  <circle cx="${cx}" cy="${cy}" r="38" fill="${C.bg}" stroke="${ult ? "url(#mbGold)" : C.edge}" stroke-width="3"/>
  <circle cx="${cx}" cy="${cy}" r="32" fill="none" stroke="${ult ? C.gold : C.cyan}" stroke-opacity=".35"/>
  ${ult ? `<circle class="ring" cx="${cx}" cy="${cy}" r="38" fill="none" stroke="${C.gold}" stroke-width="2"/>` : ""}
  <image href="${await icon(a.icon)}" x="${cx - 24}" y="${cy - 24}" width="48" height="48"/>
  <circle cx="${cx + 32}" cy="${cy + 28}" r="14" fill="url(#mbGold)" stroke="${C.bg}" stroke-width="2"/>
  <text class="t" x="${cx + 32}" y="${cy + 34}" text-anchor="middle" font-size="15" fill="#2b1a05">${a.key}</text>
  ${pill(cx - 52, y + 122, 104, 22)}
  <text class="h6" x="${cx}" y="${y + 138}" text-anchor="middle" font-size="12.5" letter-spacing="3" fill="${ult ? C.gold : C.muted}">${a.type}</text>
  <text class="t" x="${cx}" y="${y + 174}" text-anchor="middle" font-size="21" fill="${C.cream}">${esc(a.name)}</text>
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
@keyframes ring{from{opacity:.9;transform:scale(1)}to{opacity:0;transform:scale(1.4)}}
${reducedMotion(".card,.pip,.ready{opacity:1}.ring{display:none}")}
</style>
${frame(W, H)}
<defs>
  <radialGradient id="skillGlow"><stop offset=".6" stop-color="${C.cyan}" stop-opacity=".3"/><stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/></radialGradient>
  <linearGradient id="ultGlow" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${C.gold}" stop-opacity=".16"/><stop offset=".5" stop-color="${C.gold}" stop-opacity="0"/></linearGradient>
</defs>
${sectionHead(title, sub)}
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
  const title = "ITEM SHOP", sub = "TECH STACK // RECOMMENDED BUILD", bpText = "20,460";
  const names = SHOP.flatMap((c) => c.items.map((i) => i[1].toUpperCase()));
  const cinzel = await fontFace(TITLE, 900, uniq([title, ...SHOP.map((c) => c.cat)]));
  const display = await fontFace(DISPLAY, 400, bpText);
  const h6 = await fontFace(HUD, 600, uniq([sub, ...SHOP.map((c) => c.sub)]));
  // Official Battle Points and in-match gold icons, each defined once and reused.
  const bp = await asset("bp.png");
  const gold = await asset("gold.png");
  const h7 = await fontFace(HUD, 700, uniq(names));
  const mono = await fontFace(MONO, 500, "0123456789");

  // In-game shop: category tabs down the left, each tab's items in the row beside it.
  const tabX = 48, tabW = 236, tileW = 131, tileH = 104, gapX = 12, rowGap = 14, tilesTop = 140;
  const gridX = tabX + tabW + 20;
  const rows = SHOP.length;
  const H = tilesTop + rows * (tileH + rowGap) + 34;
  let tabs = "", tiles = "";
  const positions = [];
  let n = 0;
  for (let ci = 0; ci < SHOP.length; ci++) {
    const c = SHOP[ci];
    const y = tilesTop + ci * (tileH + rowGap);
    tabs += `<g>
  <rect x="${tabX}" y="${y}" width="${tabW}" height="${tileH}" fill="#0b2258" fill-opacity=".7"/>
  <rect x="${tabX}" y="${y + tileH - 1}" width="${tabW}" height="1" fill="${C.edge}" opacity=".25"/>
  <image href="${await asset(`items/${c.item}.png`)}" x="${tabX + 18}" y="${y + tileH / 2 - 24}" width="48" height="48"/>
  <rect x="${tabX + 18}" y="${y + tileH / 2 - 24}" width="48" height="48" rx="6" fill="none" stroke="${C.gold}" stroke-opacity=".6"/>
  <text class="t" x="${tabX + 82}" y="${y + tileH / 2 + 2}" font-size="19" fill="${C.cream}">${c.cat}</text>
  <text class="h6" x="${tabX + 82}" y="${y + tileH / 2 + 24}" font-size="12" letter-spacing="2.5" fill="${C.muted}">${esc(c.sub)}</text>
</g>`;
    for (let ri = 0; ri < c.items.length; ri++) {
      const [id, name, price] = c.items[ri];
      const x = gridX + ri * (tileW + gapX);
      positions.push([x, y]);
      tiles += `<g class="tile" style="animation-delay:${(0.15 + n * 0.035).toFixed(2)}s">
  ${panel(x, y, tileW, tileH, 8)}
  <rect x="${x + tileW / 2 - 25}" y="${y + 11}" width="50" height="50" rx="8" fill="${C.bg}" stroke="${C.edge}" stroke-opacity=".5"/>
  <image href="${await icon(id)}" x="${x + tileW / 2 - 19}" y="${y + 17}" width="38" height="38"/>
  <text class="h7" x="${x + tileW / 2}" y="${y + 80}" text-anchor="middle" font-size="15" letter-spacing=".5" fill="${C.cream}">${esc(name.toUpperCase())}</text>
  <use href="#gold" x="${x + tileW / 2 - 24}" y="${y + 86}" width="12" height="12"/><text class="m" x="${x + tileW / 2 - 8}" y="${y + 96}" font-size="11.5" fill="${C.gold}">${price}</text>
</g>`;
      n++;
    }
  }
  const step = 0.7;
  const dur = (positions.length * step).toFixed(1);
  const values = positions.map(([x, y]) => `${x} ${y}`).join(";");
  // The active tab follows the selected item's row.
  const tabValues = positions.map(([, y]) => `0 ${y}`).join(";");

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
<defs>
  <symbol id="gold" viewBox="0 0 16 16"><image href="${gold}" width="16" height="16"/></symbol>
  <linearGradient id="tabOn" x1="0" x2="1"><stop offset="0" stop-color="#3a7bff" stop-opacity=".9"/><stop offset="1" stop-color="#2d6ad6" stop-opacity=".35"/></linearGradient>
</defs>
${sectionHead(title, sub)}
${pill(1000, 58, 152, 36)}
<image href="${bp}" x="1006" y="61" width="30" height="30"/>
<text class="d" x="1140" y="86" text-anchor="end" font-size="23" letter-spacing="1" fill="${C.cream}">${bpText}</text>
<rect x="${tabX}" y="${tilesTop - 6}" width="${tabW}" height="${rows * (tileH + rowGap) - rowGap + 12}" fill="#06143a" fill-opacity=".55" stroke="${C.edge}" stroke-opacity=".3"/>
${tabs}
<g class="sel"><g>
  <animateTransform attributeName="transform" type="translate" values="${tabValues}" dur="${dur}s" begin="1.4s" repeatCount="indefinite" calcMode="discrete"/>
  <path d="M${tabX} 0H${tabX + tabW}L${tabX + tabW + 12} ${tileH / 2}L${tabX + tabW} ${tileH}H${tabX}Z" fill="url(#tabOn)" opacity=".55"/>
  <rect x="${tabX}" y="0" width="4" height="${tileH}" fill="url(#mbGold)"/>
</g></g>
${tiles}
<g class="sel"><g transform="translate(${positions[0][0]} ${positions[0][1]})">
  <animateTransform attributeName="transform" type="translate" values="${values}" dur="${dur}s" begin="1.4s" repeatCount="indefinite" calcMode="discrete"/>
  <path d="${cham(0, 0, tileW, tileH, 8)}" fill="${C.gold}" fill-opacity=".1" stroke="${C.gold}" stroke-width="2.5"/>
  <path d="M${tileW / 2 - 7} -1l7 7 7 -7" fill="${C.gold}"/>
</g></g>
</svg>`;
}

// ---------- battle report + kill feed ----------
async function killfeed() {
  const W = 1200, H = 330;
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

  const lx = 48, lw = 520, ly = 48, lh = H - 96;
  const left = report
    .map(([k, v], i) => `<g class="in" style="animation-delay:${(0.2 + i * 0.15).toFixed(2)}s">${diamond(lx + 30, 126 + i * 56, 4, C.gold)}<text class="h7" x="${lx + 44}" y="${130 + i * 56}" font-size="13" letter-spacing="3" fill="${C.gold}">${k}</text><text class="h6" x="${lx + 44}" y="${154 + i * 56}" font-size="20" fill="${C.cream}">${esc(v)}</text></g>`)
    .join("");

  // Kill banner: my avatar on a blue wing, crossed swords, the enemy on a red wing.
  const kx = 600, kw = 552, kh = 46, kgap = 16, ky = 64, mid = kx + 196;
  let feed = "";
  for (let i = 0; i < kills.length; i++) {
    const [id, enemy, call] = kills[i];
    const y = ky + i * (kh + kgap), cy = y + kh / 2;
    feed += `<g class="kill" style="animation-delay:${(0.6 + i * 0.55).toFixed(2)}s">
  <path d="M${kx} ${y}H${mid}V${y + kh}H${kx + 10}L${kx} ${y + kh - 10}Z" fill="url(#blueWing)"/>
  <path d="M${mid} ${y}H${kx + kw}V${y + kh}H${mid}Z" fill="url(#redWing)"/>
  <path d="M${kx} ${y}H${kx + kw}" stroke="#bcd6ff" stroke-opacity=".3"/>
  <circle cx="${kx + 26}" cy="${cy}" r="18" fill="${C.bg}" stroke="${C.cyan}" stroke-width="2"/>
  <use href="#me" x="${kx + 26}" y="${cy}"/>
  <text class="h7" x="${kx + 54}" y="${cy + 6}" font-size="17" letter-spacing="1" fill="${C.cream}">HADRIAN</text>
  <circle cx="${mid}" cy="${cy}" r="17" fill="${C.bg}" stroke="url(#mbGold)" stroke-width="2"/>
  ${swords(mid, cy)}
  <text class="h7" x="${kx + kw - 50}" y="${cy + 6}" text-anchor="end" font-size="16" letter-spacing=".5" fill="#ffe1e4">${esc(enemy)}</text>
  <circle cx="${kx + kw - 24}" cy="${cy}" r="18" fill="${C.redDeep}" stroke="${C.red}" stroke-width="2"/>
  <image href="${await icon(id)}" x="${kx + kw - 37}" y="${cy - 13}" width="26" height="26"/>
  <g transform="translate(${mid - 46} ${y - 11})"><path d="M8 0H92L84 14H0Z" fill="url(#mbGold)"/><text class="t" x="46" y="11" text-anchor="middle" font-size="9.5" letter-spacing="1" fill="#2b1a05">${call}</text></g>
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
<defs>
  ${await avatarDef(16)}
  <linearGradient id="blueWing" x1="0" x2="1"><stop offset="0" stop-color="#2d6ad6"/><stop offset="1" stop-color="#2d6ad6" stop-opacity=".25"/></linearGradient>
  <linearGradient id="redWing" x1="0" x2="1"><stop offset="0" stop-color="#c22b44" stop-opacity=".25"/><stop offset="1" stop-color="#c22b44"/></linearGradient>
</defs>
${panel(lx, ly, lw, lh, 12)}
${headBar(lx + 1, ly + 18, lw - 2, 40)}
<text class="t" x="${lx + 24}" y="${ly + 48}" font-size="24" fill="${C.cream}">${title}</text>
${left}
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
  <path d="${cham(12, y - 6, W - 24, 56, 8)}" fill="${first ? C.panelHi : C.panel}" fill-opacity=".85" stroke="${C.edge}" stroke-opacity=".3"/>
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
<defs>${screenDefs(W, H, 16)}</defs>
${screenBg(W, H, 16)}
${headBar(12, 12, 260, 24)}
<text class="h7" x="26" y="29" font-size="13" letter-spacing="3" fill="${C.cream}">${head}</text>
<image class="mvp" href="${mvp}" x="${W - 72}" y="2" width="52" height="47"><title>MVP</title></image>
${rows}
${screenFrame(W, H, 16)}
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
  const W = 1200, H = 320;
  const big = "VICTORY";
  const small = "THANKS FOR STOPPING BY  ·  SEE YOU IN THE LAND OF DAWN";
  const kda = ["15", "0", "7"];
  const cinzel = await fontFace(TITLE, 900, big);
  const h7 = await fontFace(HUD, 700, uniq([small, "KDA", ...kda, "/", "MVP"]));
  const cx = W / 2, ay = 84, ry = 176;
  const mvp = await asset("mvp.png"); // MVP badge
  // The Project NEXT victory screen: a blue ribbon with gold trim, the winner's portrait in a crest above.
  const ribbon = `M${cx - 330} ${ry - 42}H${cx + 330}L${cx + 360} ${ry}L${cx + 330} ${ry + 42}H${cx - 330}L${cx - 360} ${ry}Z`;
  const trim = (dy, s) => `<path d="M${cx - 380} ${ry + dy}Q${cx - 200} ${ry + dy - 10 * s} ${cx - 40} ${ry + dy}L${cx} ${ry + dy + 14 * s}L${cx + 40} ${ry + dy}Q${cx + 200} ${ry + dy - 10 * s} ${cx + 380} ${ry + dy}" fill="none" stroke="url(#mbGold)" stroke-width="3"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Victory. Thanks for stopping by, see you in the Land of Dawn.">
<title>Victory</title>
<style>${cinzel}${h7}${FONT_CSS}
.v{opacity:0;transform-origin:${cx}px ${ry}px;animation:v .8s .2s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes v{from{opacity:0;transform:scaleX(.2)}to{opacity:1;transform:none}}
.crest{opacity:0;transform-origin:${cx}px ${ay}px;animation:crest .6s .7s cubic-bezier(.3,1.5,.5,1) forwards}
@keyframes crest{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}
.fade{opacity:0;animation:fade .6s 1.1s forwards}
@keyframes fade{to{opacity:1}}
.mvp{opacity:0;transform-origin:1060px 170px;animation:mvp .35s 1.4s cubic-bezier(.3,1.6,.5,1) forwards}
@keyframes mvp{from{opacity:0;transform:scale(1.6) rotate(-14deg)}to{opacity:1;transform:rotate(-6deg)}}
.rays{transform-origin:1060px 170px;animation:rays 18s linear infinite}
@keyframes rays{to{transform:rotate(360deg)}}
.gem{animation:gem 2.4s ease-in-out infinite}
@keyframes gem{50%{opacity:.55}}
${reducedMotion(".v,.crest,.fade{opacity:1}.mvp{opacity:1;transform:rotate(-6deg)}")}
</style>
<defs>
  ${screenDefs(W, H, 24)}
  ${await avatarDef(40)}
  <linearGradient id="ribbon" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2f6fe0"/><stop offset=".5" stop-color="#1a4bb0"/><stop offset="1" stop-color="#0f2f7a"/></linearGradient>
  <linearGradient id="shine" x1="0" x2="${W}" y1="0" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#fff"/><stop offset=".46" stop-color="#fff"/><stop offset=".5" stop-color="#ffe9a8"/><stop offset=".54" stop-color="#fff"/><stop offset="1" stop-color="#fff"/>
    <animateTransform attributeName="gradientTransform" type="translate" values="-1200 0;1200 0" dur="4s" begin="1.2s" repeatCount="indefinite"/>
  </linearGradient>
  <radialGradient id="glow"><stop offset="0" stop-color="${C.gold}" stop-opacity=".35"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/></radialGradient>
  <radialGradient id="halo"><stop offset="0" stop-color="#7fb4ff" stop-opacity=".5"/><stop offset="1" stop-color="#7fb4ff" stop-opacity="0"/></radialGradient>
  <filter id="tglow" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="5" result="b"/><feFlood flood-color="#6aa8ff" flood-opacity=".8"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
${screenBg(W, H, 24)}
<g clip-path="url(#mbClip)">
  <ellipse cx="${cx}" cy="${ry}" rx="460" ry="120" fill="url(#halo)"/>
  <path d="M${cx - 300} ${ry - 40}C${cx - 300} ${ay - 30} ${cx - 120} ${ay - 60} ${cx - 50} ${ay}" fill="none" stroke="${C.edge}" stroke-opacity=".28" stroke-width="6"/>
  <path d="M${cx + 300} ${ry - 40}C${cx + 300} ${ay - 30} ${cx + 120} ${ay - 60} ${cx + 50} ${ay}" fill="none" stroke="${C.edge}" stroke-opacity=".28" stroke-width="6"/>
  <circle cx="1060" cy="170" r="100" fill="url(#glow)"/>
  <g class="rays" opacity=".25">${Array.from({ length: 12 }, (_, i) => `<path d="M1060 170L${(1060 + 96 * Math.cos((i * Math.PI) / 6 - 0.08)).toFixed(1)} ${(170 + 96 * Math.sin((i * Math.PI) / 6 - 0.08)).toFixed(1)}L${(1060 + 96 * Math.cos((i * Math.PI) / 6 + 0.08)).toFixed(1)} ${(170 + 96 * Math.sin((i * Math.PI) / 6 + 0.08)).toFixed(1)}Z" fill="${C.gold}"/>`).join("")}</g>
</g>

<g class="v">
  <path d="${ribbon}" fill="url(#ribbon)"/>
  <path d="M${cx - 330} ${ry - 38}H${cx + 330}" stroke="#a9cbff" stroke-opacity=".5"/>
  ${trim(-46, 1)}${trim(46, -1)}
  <text class="t" x="${cx}" y="${ry + 24}" text-anchor="middle" font-size="68" letter-spacing="12" fill="url(#shine)" filter="url(#tglow)">${big}</text>
  <g transform="translate(${cx} ${ry + 60})"><path d="M0 -14L14 0L0 18L-14 0Z" fill="url(#mbGold)"/><path class="gem" d="M0 -8L8 0L0 11L-8 0Z" fill="${C.cyan}"/></g>
</g>

<g class="crest">
  <path d="M${cx} ${ay - 58}L${cx + 14} ${ay - 44}H${cx - 14}Z" fill="url(#mbGold)"/>
  <path d="M${cx - 56} ${ay}L${cx - 44} ${ay - 10}V${ay + 10}Z M${cx + 56} ${ay}L${cx + 44} ${ay - 10}V${ay + 10}Z" fill="url(#mbGold)"/>
  <circle cx="${cx}" cy="${ay}" r="46" fill="${C.bg}" stroke="url(#mbGold)" stroke-width="4"/>
  <use href="#me" x="${cx}" y="${ay}"/>
  <circle cx="${cx}" cy="${ay}" r="40" fill="none" stroke="${C.edge}" stroke-width="1.5"/>
</g>

<text class="h7 fade" x="${cx}" y="268" text-anchor="middle" font-size="20" letter-spacing="4"><tspan fill="${C.muted}" font-size="14" dx="-14">KDA </tspan><tspan fill="${C.cyan}">${kda[0]}</tspan><tspan fill="${C.muted}"> / </tspan><tspan fill="${C.red}">${kda[1]}</tspan><tspan fill="${C.muted}"> / </tspan><tspan fill="${C.cream}">${kda[2]}</tspan><tspan fill="${C.gold}" font-size="14" dx="14">MVP</tspan></text>
<text class="h7 fade" x="${cx}" y="294" text-anchor="middle" font-size="15" letter-spacing="4" fill="${C.muted}">${esc(small)}</text>
<image class="mvp" href="${mvp}" x="${1060 - 85}" y="${170 - 77}" width="170" height="155"/>
${screenFrame(W, H, 24)}
</svg>`;
}

// ---------- chat buttons (LinkedIn, Portfolio, Instagram) ----------
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
  <linearGradient id="tab" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2459c0"/><stop offset="1" stop-color="#11307a"/></linearGradient>
</defs>
<g clip-path="url(#c)">
  <rect width="${W}" height="${H}" fill="url(#tab)"/>
  <rect x="60" y="1" width="${W - 60}" height="1.5" fill="#bcd6ff" opacity=".45"/>
  <rect width="60" height="${H}" fill="url(#gold)"/>
  <path d="${path}" fill="${C.bg}" transform="translate(17 17) scale(1.083)"/>
  <rect x="60" y="${H - 3}" width="${W - 60}" height="3" fill="${C.gold}" opacity=".5"/>
  <rect x="-80" y="0" width="80" height="${H}" fill="url(#s)" transform="skewX(-20)"><animate attributeName="x" values="-80;${W + 80}" dur="3.5s" repeatCount="indefinite"/></rect>
</g>
<path d="${cham(0.75, 0.75, W - 1.5, H - 1.5, 12)}" fill="none" stroke="${C.edge}" stroke-opacity=".7" stroke-width="1.5"/>
<text class="h6" x="76" y="24" font-size="11" letter-spacing="3" fill="${C.cyan}">${label}</text>
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
  instagram: await chatButton("INSTAGRAM", 3, "instagram"),
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
