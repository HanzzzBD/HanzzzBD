// "Land of Dawn": the contribution graph as a Mobile Legends lane. Every day with contributions is an
// enemy hero. Heroes pop up one at a time, the turret fires at them (energy bolt, recoil, damage numbers,
// 25-shot energy bar with recharges) and each kill leaves a mark, until the lane is cleared.
// Run: node .github/scripts/range-card.mjs <user> <out.svg>
// The Land of Dawn map, the turret and the hero icons are official Mobile Legends: Bang Bang assets (via the
// Mobile Legends Fandom wiki); the README carries the fan-content notice.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { C, cham, fontFace, FONT_CSS, uniq } from "./rank-card.mjs";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "..", "mlbb");

// Timing in seconds. The turret holds 25 shots of energy; every empty bar costs a recharge.
const PER_SHOT = 0.28, RECHARGE = 1.4, MAG = 25, LEAD = 0.6, TAIL = 2.6, HOLD = 0.1, SPAWN = 0.45;
// Turret damage by GitHub level; level 4 is a critical hit.
const DAMAGE = [0, 214, 286, 352, 918];
const PAD_TINT = [0, 0.16, 0.26, 0.38, 0.52];

export async function fetchGrid(user) {
  const html = await (await fetch(`https://github.com/users/${user}/contributions`, { headers: { "User-Agent": "range-card" } })).text();
  const cells = [...html.matchAll(/data-date="(\d{4}-\d{2}-\d{2})" id="contribution-day-component-(\d+)-(\d+)" data-level="(\d)"/g)].map((m) => ({
    date: m[1], row: +m[2], col: +m[3], level: +m[4],
  }));
  if (!cells.length) throw new Error("Could not read the contribution graph");
  const total = Number(html.match(/id="js-contribution-activity-description"[^>]*>\s*([\d,]+)/)?.[1].replace(/,/g, "") ?? 0);
  return { cells, total };
}

const f = (n) => +n.toFixed(4);

// SMIL values/keyTimes from [seconds, value] events, resting at `rest` at both ends of the loop.
function track(L, rest, events) {
  const vals = [rest], keys = [0];
  let last = 0;
  for (const [t, v] of events) {
    const k = Math.max(f(t / L), f(last + 0.0001));
    if (k >= 1) break;
    vals.push(v); keys.push(k); last = k;
  }
  vals.push(rest); keys.push(1);
  return `values="${vals.join(";")}" keyTimes="${keys.join(";")}"`;
}

// On/off windows for a calcMode="discrete" animation.
function windows(L, wins) {
  const vals = [0], keys = [0];
  for (const [a, b] of wins) { vals.push(1, 0); keys.push(f(a / L), f(b / L)); }
  return `values="${vals.join(";")}" keyTimes="${keys.join(";")}"`;
}

// Hero icons (official, 32px, in ../mlbb/heroes) defined once and reused per target.
// Order is a fixed shuffle so neighbouring targets show different heroes.
async function heroDefs() {
  const dir = join(ASSETS, "heroes");
  const files = (await readdir(dir)).filter((n) => n.endsWith(".png")).sort();
  let seed = 23;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = files.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [files[i], files[j]] = [files[j], files[i]]; }
  const defs = [];
  for (const [i, n] of files.entries()) {
    const png = (await readFile(join(dir, n))).toString("base64");
    defs.push(`<image id="hr${i}" href="data:image/png;base64,${png}" x="-8" y="-16" width="16" height="16" clip-path="url(#headclip)"/>`);
  }
  return { count: files.length, defs: defs.join("") };
}

// A hero icon filling its 16px cell, standing on (0,0). Critical days (level 4) get a gold ring.
const head = (k, level) =>
  `<circle cx="0" cy="-8" r="8" fill="${C.bg}"/><use href="#hr${k}"/>${level === 4 ? `<circle cx="0" cy="-8" r="7.4" fill="none" stroke="${C.gold}" stroke-width="1.3"/>` : ""}`;

export async function renderRangeCard({ cells, total }) {
  const W = 1200, H = 430;
  const size = 16, gap = 5, step = size + gap;
  const cols = Math.max(...cells.map((c) => c.col)) + 1;
  const x0 = Math.round((W - (cols * step - gap)) / 2), y0 = 136;
  const cx = (c) => x0 + c.col * step + size / 2;
  const cy = (c) => y0 + c.row * step + size / 2;

  // Serpentine order down one column and up the next, like pushing down a lane.
  const targets = cells
    .filter((c) => c.level > 0)
    .sort((a, b) => a.col - b.col || (a.col % 2 ? b.row - a.row : a.row - b.row));
  const N = targets.length;
  const arrive = targets.map((_, i) => LEAD + i * PER_SHOT + Math.floor(i / MAG) * RECHARGE);
  const hitAt = arrive.map((a) => a + 0.05);
  const lastEnd = N ? hitAt[N - 1] + 0.5 : LEAD;
  const L = f(lastEnd + TAIL);
  const clearAt = (c) => lastEnd + 0.4 + 1.6 * (c.col / cols);

  // Empty days are plain pads; active days are tinted by level so the pattern reads before any shot.
  const pads = cells
    .map((c) => `<rect x="${cx(c) - size / 2}" y="${cy(c) - size / 2}" width="${size}" height="${size}" rx="3" fill="${C.panel}" fill-opacity=".85"/>${c.level ? `<rect x="${cx(c) - size / 2}" y="${cy(c) - size / 2}" width="${size}" height="${size}" rx="3" fill="${C.gold}" fill-opacity="${PAD_TINT[c.level]}"/>` : ""}`)
    .join("");

  // Each target is a hero in its own cell: it rises from the bottom of the cell, gets hit,
  // tips over and drops out, leaving a kill mark on the pad.
  const heroes = await heroDefs();
  const botEls = targets
    .map((c, i) => {
      const t = hitAt[i], spawn = Math.max(0.05, t - SPAWN);
      const x = cx(c), base = cy(c) + size / 2;
      const dmg = DAMAGE[c.level], crit = c.level === 4;
      return `<g transform="translate(${x} ${base})">
  <g opacity="0"><animate attributeName="opacity" ${track(L, 0, [[spawn, 0], [spawn + 0.01, 1], [t + 0.16, 1], [t + 0.26, 0]])} dur="${L}s" repeatCount="indefinite"/>
    <g><animateTransform attributeName="transform" type="rotate" ${track(L, 0, [[t, 0], [t + 0.15, crit ? -85 : 80]])} dur="${L}s" repeatCount="indefinite"/>
      <g><animateTransform attributeName="transform" type="scale" ${track(L, "1 0", [[spawn, "1 0"], [spawn + 0.12, "1 1"]])} dur="${L}s" repeatCount="indefinite"/>${head(i % heroes.count, c.level)}</g>
    </g>
  </g>
  <path d="M-3.5 -11.5l7 7M3.5 -11.5l-7 7" stroke="${crit ? C.gold : C.cream}" stroke-width="1.8" opacity="0"><animate attributeName="opacity" ${track(L, 0, [[t + 0.14, 0], [t + 0.15, crit ? 1 : 0.75], [clearAt(c), crit ? 1 : 0.75], [clearAt(c) + 0.2, 0]])} dur="${L}s" repeatCount="indefinite"/></path>
  <text class="d" x="0" y="-19" text-anchor="middle" font-size="${crit ? 15 : 12}" fill="${crit ? C.gold : C.red}" stroke="${C.bg}" stroke-width="3" paint-order="stroke" opacity="0">${dmg}<animate attributeName="opacity" ${track(L, 0, [[t, 0], [t + 0.01, 1], [t + 0.55, 0]])} dur="${L}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" ${track(L, "0 0", [[t, "0 0"], [t + 0.6, "0 -16"]])} dur="${L}s" repeatCount="indefinite"/></text>
</g>`;
    })
    .join("\n");

  // Target lock lands on each hero, holds for the shot, moves on, and returns to the start.
  const xhEvents = [];
  targets.forEach((c, i) => { xhEvents.push([arrive[i], `${cx(c)} ${cy(c)}`], [arrive[i] + HOLD, `${cx(c)} ${cy(c)}`]); });
  const xhStart = N ? `${cx(targets[0])} ${cy(targets[0])}` : "0 0";
  const hitmark = (on) => hitAt.flatMap((t) => [[t, 0], [t + 0.01, on], [t + 0.12, 0]]);

  // Turret in the bottom right, with recoil, a muzzle glow at its crystal and an energy bolt.
  const turret = `data:image/png;base64,${(await readFile(join(ASSETS, "turret.png"))).toString("base64")}`;
  const bg = `data:image/jpeg;base64,${(await readFile(join(ASSETS, "land-of-dawn.jpg"))).toString("base64")}`;
  const gs = 96;
  const gx = W - 92 - gs, gy = H - 34 - gs;
  const muzzle = [f(gx + gs / 2), f(gy + gs * 0.3)];
  const recoil = hitAt.flatMap((t) => [[t - 0.005, "0 0"], [t, "3 2"], [t + 0.12, "0 0"]]);
  const boltX = targets.flatMap((c, i) => [[hitAt[i] - 0.005, cx(c)]]);
  const boltY = targets.flatMap((c, i) => [[hitAt[i] - 0.005, cy(c)]]);

  // Energy counter: one element per value, each shown while the turret holds that many shots.
  const segs = [];
  let now = 0, ammo = MAG;
  hitAt.forEach((t, i) => {
    segs.push([now, t, String(ammo)]);
    ammo--;
    now = t;
    if (ammo === 0 && i < N - 1) {
      segs.push([now, now + 0.25, "0"], [now + 0.25, arrive[i + 1] - 0.05, "RECHARGING"]);
      now = arrive[i + 1] - 0.05;
      ammo = MAG;
    }
  });
  segs.push([now, L, String(ammo)]);
  const byLabel = new Map();
  for (const [a, b, label] of segs) if (b > a) (byLabel.get(label) ?? byLabel.set(label, []).get(label)).push([a, b]);
  const ammoX = gx - 48, ammoY = H - 48;
  const ammoEls = [...byLabel]
    .map(([label, wins]) => {
      const reload = label === "RECHARGING";
      const text = reload
        ? `<text class="h7" x="${ammoX}" y="${ammoY - 6}" text-anchor="end" font-size="16" letter-spacing="3" fill="${C.cyan}">RECHARGING</text>`
        : `<text class="d" x="${ammoX}" y="${ammoY}" text-anchor="end" font-size="40" fill="${Number(label) <= 5 ? C.red : C.cream}">${label}</text>`;
      return `<g opacity="0"><animate attributeName="opacity" ${windows(L, wins)} dur="${L}s" repeatCount="indefinite" calcMode="discrete"/>${text}</g>`;
    })
    .join("");

  const months = [];
  let lastMonth = -1;
  for (const c of cells.filter((c) => c.row === 0).sort((a, b) => a.col - b.col)) {
    const m = Number(c.date.slice(5, 7)) - 1;
    if (m !== lastMonth && c.col < cols - 2) { months.push({ col: c.col, label: MONTHS[m] }); lastMonth = m; }
  }
  const monthEls = months
    .filter((m, i) => i === 0 || m.col - months[i - 1].col >= 3)
    .map((m) => `<text class="h6" x="${x0 + m.col * step}" y="${y0 - 10}" font-size="11" letter-spacing="2" fill="${C.muted}">${m.label}</text>`)
    .join("");

  const crits = targets.filter((c) => c.level === 4).length;
  const stats = [["CONTRIBUTIONS", total.toLocaleString("en-US")], ["KILLS", String(N)], ["CRITS", String(crits)]];
  const barY = H - 56, barW = ammoX - 120 - 140 - x0;

  const cinzel = await fontFace("Cinzel", 900, "LAND OF DAWN");
  const display = await fontFace("Anton", 400, uniq(["0123456789", ...stats.map((s) => s[1])]));
  const h6 = await fontFace("Rajdhani", 600, uniq(["CLASSIC // GOLD LANE  ·  LAST 52 WEEKS", "LANE CLEARED", "TURRET", ...MONTHS, ...stats.map((s) => s[0])]));
  const h7 = await fontFace("Rajdhani", 700, "RECHARGING/∞");

  let sx = W - x0;
  const statEls = stats
    .slice()
    .reverse()
    .map(([k, v]) => {
      const el = `<text class="d" x="${sx}" y="80" text-anchor="end" font-size="30" fill="${k === "CRITS" ? C.gold : C.cream}">${v}</text><text class="h6" x="${sx}" y="100" text-anchor="end" font-size="12" letter-spacing="3" fill="${C.muted}">${k}</text>`;
      sx -= 130;
      return el;
    })
    .join("");

  const frame = cham(0.75, 0.75, W - 1.5, H - 1.5, 28);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Land of Dawn: ${N} days with contributions in the last year appear as enemy heroes that a turret takes down one by one, with damage numbers and recharges. ${total} contributions in total.">
<title>Land of Dawn</title>
<style>${cinzel}${display}${h6}${h7}
${FONT_CSS}
@media (prefers-reduced-motion: reduce){.fx{display:none}}
</style>
<defs>
  <clipPath id="card"><path d="${frame}"/></clipPath>
  <clipPath id="headclip"><circle cx="0" cy="-8" r="8"/></clipPath>
  ${heroes.defs}
  <linearGradient id="shade" x1="0" x2="1"><stop offset="0" stop-color="${C.bg}" stop-opacity=".9"/><stop offset=".7" stop-color="${C.bg}" stop-opacity=".82"/><stop offset="1" stop-color="${C.bg}" stop-opacity=".66"/></linearGradient>
  <radialGradient id="bolt"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/></radialGradient>
</defs>
<g clip-path="url(#card)">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <image href="${bg}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" opacity=".9"/>
  <rect width="${W}" height="${H}" fill="url(#shade)"/>
</g>
<path d="${frame}" fill="none" stroke="${C.line}" stroke-width="1.5"/>
<rect x="${x0}" y="52" width="10" height="34" fill="${C.gold}"/>
<text class="t" x="${x0 + 22}" y="82" font-size="32" fill="${C.cream}">LAND OF DAWN</text>
<text class="h6" x="${x0 + 22}" y="106" font-size="14" letter-spacing="4" fill="${C.muted}">CLASSIC // GOLD LANE  ·  LAST 52 WEEKS</text>
${statEls}
${monthEls}
${pads}
<g class="fx">
${botEls}
<line x1="${muzzle[0]}" y1="${muzzle[1]}" x2="${muzzle[0]}" y2="${muzzle[1]}" stroke="${C.gold}" stroke-width="2.4" stroke-linecap="round" opacity="0">
  <animate attributeName="x2" ${track(L, muzzle[0], boltX)} dur="${L}s" repeatCount="indefinite" calcMode="discrete"/>
  <animate attributeName="y2" ${track(L, muzzle[1], boltY)} dur="${L}s" repeatCount="indefinite" calcMode="discrete"/>
  <animate attributeName="opacity" ${track(L, 0, hitAt.flatMap((t) => [[t - 0.004, 0], [t, 0.9], [t + 0.07, 0]]))} dur="${L}s" repeatCount="indefinite"/>
</line>
<g>
  <animateTransform attributeName="transform" type="translate" ${track(L, "0 0", recoil)} dur="${L}s" repeatCount="indefinite"/>
  <circle cx="${gx + gs / 2}" cy="${gy + gs / 2}" r="${gs / 2 + 4}" fill="none" stroke="${C.gold}" stroke-opacity=".6" stroke-width="2"/>
  <image href="${turret}" x="${gx}" y="${gy}" width="${gs}" height="${gs}"/>
  <circle cx="${muzzle[0]}" cy="${muzzle[1]}" r="16" fill="url(#bolt)" opacity="0"><animate attributeName="opacity" ${track(L, 0, hitAt.flatMap((t) => [[t - 0.004, 0], [t, 1], [t + 0.08, 0]]))} dur="${L}s" repeatCount="indefinite"/></circle>
</g>
<g>
  <animateTransform attributeName="transform" type="translate" ${track(L, xhStart, xhEvents)} dur="${L}s" repeatCount="indefinite"/>
  <circle r="11" fill="none" stroke="#000" stroke-opacity=".6" stroke-width="4"/>
  <circle r="11" fill="none" stroke="${C.red}" stroke-width="2" stroke-dasharray="9 8.3"/>
  <circle r="1.8" fill="${C.red}"/>
  <path d="M-9 -9l4 4M9 -9l-4 4M-9 9l4 -4M9 9l-4 -4" stroke="#fff" stroke-width="2" opacity="0"><animate attributeName="opacity" ${track(L, 0, hitmark(1))} dur="${L}s" repeatCount="indefinite"/></path>
</g>
${ammoEls}
</g>
<text class="h7" x="${ammoX + 6}" y="${ammoY}" font-size="20" fill="${C.muted}">/ ∞</text>
<text class="h6" x="${gx + gs / 2}" y="${H - 18}" text-anchor="middle" font-size="11" letter-spacing="3" fill="${C.muted}">TURRET</text>
<text class="h6" x="${x0}" y="${barY + 22}" font-size="11" letter-spacing="3" fill="${C.muted}">LANE CLEARED</text>
<rect x="${x0 + 120}" y="${barY + 15}" width="${barW}" height="4" fill="${C.line}"/>
<rect x="${x0 + 120}" y="${barY + 15}" width="0" height="4" fill="${C.gold}"><animate attributeName="width" values="0;0;${barW};${barW};0" keyTimes="0;${f(LEAD / L)};${f(lastEnd / L)};${f((lastEnd + 2) / L)};1" dur="${L}s" repeatCount="indefinite"/></rect>
</svg>`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [user, out] = process.argv.slice(2);
  const grid = await fetchGrid(user);
  await mkdir(dirname(out), { recursive: true });
  const svg = await renderRangeCard(grid);
  await writeFile(out, svg);
  console.log(`land of dawn: ${grid.cells.filter((c) => c.level > 0).length} targets, ${(svg.length / 1024).toFixed(0)} KB`);
}
