// Profile views as a Mobile Legends-style button, matching the LinkedIn/Portfolio/Instagram buttons.
// visitor-badge.laobi.icu still does the counting: the README keeps its badge as a 1px image, and
// this script reads the total with query_only=true, which does not add a view.
// Run hourly by the profile workflow: node .github/scripts/views-card.mjs <page_id> <out.svg>
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { C, cham, fontFace, FONT_CSS, uniq } from "./rank-card.mjs";

export async function fetchViews(pageId) {
  const svg = await (await fetch(`https://visitor-badge.laobi.icu/badge?page_id=${encodeURIComponent(pageId)}&query_only=true`)).text();
  const counts = [...svg.matchAll(/>(\d+)<\/text>/g)].map((m) => Number(m[1]));
  // A page id nobody has viewed yet has no counter ("Count API Failed"); show 0 until the first visit.
  if (!counts.length) {
    if (svg.includes("Count API Failed")) return 0;
    throw new Error("Could not read the view count");
  }
  return counts[counts.length - 1];
}

export async function renderViewsCard(views) {
  const W = 240, H = 60;
  const label = "SPECTATORS // 04";
  const value = views.toLocaleString("en-US");
  const display = await fontFace("Anton", 400, uniq([value, "VIEWS"]));
  const h6 = await fontFace("Rajdhani", 600, uniq([label, "LIVE"]));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${value} profile views">
<title>${value} profile views</title>
<style>${display}${h6}
${FONT_CSS}
.blink{animation:blink 1.6s ease-in-out infinite}
@keyframes blink{50%{opacity:.25}}
.look{transform-origin:30px 30px;animation:look 4s ease-in-out infinite}
@keyframes look{0%,40%,100%{transform:translateX(0)}50%,60%{transform:translateX(-3px)}70%,80%{transform:translateX(3px)}}
@media (prefers-reduced-motion: reduce){*{animation:none!important}}
</style>
<defs>
  <clipPath id="c"><path d="${cham(0, 0, W, H, 12)}"/></clipPath>
  <clipPath id="eye"><path d="M15 30Q30 15 45 30Q30 45 15 30Z"/></clipPath>
  <linearGradient id="s" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="gold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffd77a"/><stop offset="1" stop-color="#c98a22"/></linearGradient>
</defs>
<g clip-path="url(#c)">
  <rect width="${W}" height="${H}" fill="${C.panel}"/>
  <rect width="60" height="${H}" fill="url(#gold)"/>
  <path d="M15 30Q30 15 45 30Q30 45 15 30Z" fill="${C.bg}"/>
  <g clip-path="url(#eye)"><g class="look"><circle cx="30" cy="30" r="6.5" fill="${C.gold}"/><circle cx="30" cy="30" r="2.6" fill="${C.bg}"/></g></g>
  <rect x="60" y="${H - 3}" width="${W - 60}" height="3" fill="${C.gold}" opacity=".5"/>
  <rect x="-80" y="0" width="80" height="${H}" fill="url(#s)" transform="skewX(-20)"><animate attributeName="x" values="-80;${W + 80}" dur="3.5s" begin="1.2s" repeatCount="indefinite"/></rect>
</g>
<path d="${cham(0.75, 0.75, W - 1.5, H - 1.5, 12)}" fill="none" stroke="${C.line}" stroke-width="1.5"/>
<text class="h6" x="76" y="24" font-size="11" letter-spacing="3" fill="${C.muted}">${label}</text>
<text class="d" x="76" y="47" font-size="23" letter-spacing="1.5" fill="${C.cream}">${value}<tspan font-size="14" dx="6" letter-spacing="2" fill="${C.muted}">VIEWS</tspan></text>
<g class="blink"><circle cx="${W - 44}" cy="30" r="3.5" fill="${C.cyan}"/><text class="h6" x="${W - 36}" y="34" font-size="11" letter-spacing="2" fill="${C.cyan}">LIVE</text></g>
</svg>`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [pageId, out] = process.argv.slice(2);
  const views = await fetchViews(pageId);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, await renderViewsCard(views));
  console.log(`views: ${views}`);
}
