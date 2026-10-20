// Draws the Mobile Legends-style "match history" card: contributions, streaks, battle stats and languages.
// Replaces the github-readme-stats and streak-stats cards. Public repositories only.
// Run by the profile workflow: GITHUB_TOKEN=... node .github/scripts/career-card.mjs <user> <out.svg>
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { C, cham, fetchTotal, fontFace, FONT_CSS, headBar, rankFor, rankIcon, screenBg, screenDefs, screenFrame, uniq } from "./rank-card.mjs";

const ROW = "#15224a";
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function gql(token, query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "career-card" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

export async function fetchStats(user, token) {
  const base = await gql(token, `query($login:String!, $prs:String!, $issues:String!) {
    user(login:$login) {
      createdAt
      repositories(ownerAffiliations:OWNER, isFork:false, privacy:PUBLIC, first:100) {
        nodes { stargazerCount languages(first:10, orderBy:{field:SIZE, direction:DESC}) { edges { size node { name color } } } }
      }
      repositoriesContributedTo(first:1, privacy:PUBLIC, contributionTypes:[COMMIT, PULL_REQUEST, ISSUE, REPOSITORY]) { totalCount }
      contributionsCollection { totalCommitContributions }
    }
    prs: search(query:$prs, type:ISSUE, first:0) { issueCount }
    issues: search(query:$issues, type:ISSUE, first:0) { issueCount }
  }`, { login: user, prs: `author:${user} type:pr is:public`, issues: `author:${user} type:issue is:public` });
  const u = base.user;

  // The calendar API returns at most a year per call, so ask for every year since the account was made.
  const firstYear = new Date(u.createdAt).getUTCFullYear();
  const thisYear = new Date().getUTCFullYear();
  const parts = [];
  for (let y = firstYear; y <= thisYear; y++)
    parts.push(`y${y}: contributionsCollection(from:"${y}-01-01T00:00:00Z", to:"${y}-12-31T23:59:59Z") { contributionCalendar { weeks { contributionDays { date contributionCount } } } }`);
  const cal = await gql(token, `query($login:String!) { user(login:$login) { ${parts.join("\n")} } }`, { login: user });
  const today = new Date().toISOString().slice(0, 10);
  const days = Object.values(cal.user)
    .flatMap((c) => c.contributionCalendar.weeks.flatMap((w) => w.contributionDays))
    .filter((d) => d.date >= u.createdAt.slice(0, 10) && d.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const langs = {};
  let stars = 0;
  for (const r of u.repositories.nodes) {
    stars += r.stargazerCount;
    for (const e of r.languages.edges) {
      langs[e.node.name] ??= { size: 0, color: e.node.color || C.muted };
      langs[e.node.name].size += e.size;
    }
  }
  const langTotal = Object.values(langs).reduce((a, l) => a + l.size, 0) || 1;
  const languages = Object.entries(langs)
    .map(([name, l]) => ({ name, color: l.color, pct: (l.size / langTotal) * 100 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 8);

  return {
    createdAt: u.createdAt,
    days,
    stars,
    languages,
    commits: u.contributionsCollection.totalCommitContributions,
    prs: base.prs.issueCount,
    issues: base.issues.issueCount,
    contributedTo: u.repositoriesContributedTo.totalCount,
  };
}

// MLBB kill-streak medals, earned from the last 365 days of contributions.
export function ceremonies(days) {
  const year = days.slice(-365);
  let run = 0, best = 0, gap = 0, comeback = false;
  for (const d of year) {
    if (d.contributionCount > 0) {
      run++; best = Math.max(best, run);
      if (gap >= 30) comeback = true;
      gap = 0;
    } else { run = 0; gap++; }
  }
  const weekend = (d) => [0, 6].includes(new Date(`${d.date}T00:00:00Z`).getUTCDay());
  return [
    { name: "LEGENDARY", rule: "7-DAY STREAK", earned: best >= 7 },
    { name: "SAVAGE", rule: "5+ IN ONE DAY", earned: year.some((d) => d.contributionCount >= 5) },
    { name: "COMEBACK", rule: "BACK AFTER 30+ DAYS", earned: comeback },
    { name: "MANIAC", rule: "10+ ON A WEEKEND", earned: year.some((d) => weekend(d) && d.contributionCount >= 10) },
  ];
}

export function streaks(days) {
  let longest = { len: 0, start: null, end: null };
  let run = { len: 0, start: null };
  for (const d of days) {
    if (d.contributionCount > 0) {
      run = run.len ? { len: run.len + 1, start: run.start } : { len: 1, start: d.date };
      if (run.len > longest.len) longest = { len: run.len, start: run.start, end: d.date };
    } else run = { len: 0, start: null };
  }
  // Today not having a contribution yet doesn't break the streak.
  let i = days.length - 1;
  if (i >= 0 && days[i].contributionCount === 0) i--;
  let cur = { len: 0, start: null, end: i >= 0 ? days[i].date : null };
  while (i >= 0 && days[i].contributionCount > 0) { cur.len++; cur.start = days[i].date; i--; }
  return { current: cur, longest };
}

const fmt = (iso, year = false) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}${year ? `, ${y}` : ""}`;
};
const range = (s, e, year) => (!s ? "NO ACTIVE STREAK" : s === e ? fmt(s, year) : `${fmt(s)} – ${fmt(e, year)}`);
// The MLBB announcer, one call per streak length.
const badgeFor = (n) => ["NO STREAK", "FIRST BLOOD", "DOUBLE KILL", "TRIPLE KILL", "MANIAC"][n] ?? "SAVAGE";

function medal(c, x, y) {
  const w = 120, h = 50, on = c.earned;
  return `<g opacity="${on ? 1 : 0.55}"><title>${c.name}: ${c.rule.toLowerCase()}${on ? "" : " (locked)"}</title>
  <path d="${cham(x, y, w, h, 10)}" fill="${on ? "#2a2110" : C.panel}" stroke="${on ? C.gold : C.line}"/>
  ${on ? `<path d="${cham(x, y, w, h, 10)}" fill="none" stroke="${C.gold}" stroke-width="2" opacity="0"><animate attributeName="opacity" values="0;.9;0" dur="2.6s" repeatCount="indefinite"/></path>` : ""}
  <text class="t" x="${x + w / 2}" y="${y + 25}" text-anchor="middle" font-size="13" fill="${on ? C.gold : C.muted}">${c.name}</text>
  <text class="h6" x="${x + w / 2}" y="${y + 41}" text-anchor="middle" font-size="9.5" letter-spacing=".8" fill="${on ? C.cream : C.muted}">${on ? c.rule : "LOCKED"}</text>
</g>`;
}

export async function renderCareerCard(stats, last365) {
  const W = 1200, H = 552;
  const total = stats.days.reduce((a, d) => a + d.contributionCount, 0);
  const { current, longest } = streaks(stats.days);
  const r = rankFor(last365);
  const rankSub = `${r.stars} ${r.stars === 1 ? "STAR" : "STARS"}  ·  LAST 365 DAYS`;
  const since = `${fmt(stats.createdAt.slice(0, 10), true)} – PRESENT`;
  const badge = badgeFor(current.len);
  const cer = ceremonies(stats.days);

  const kpis = [
    { label: "TOTAL CONTRIBUTIONS", value: total.toLocaleString("en-US"), unit: "", sub: since },
    { label: "CURRENT STREAK", value: String(current.len), unit: current.len === 1 ? "DAY" : "DAYS", sub: range(current.start, current.end, false), hot: true },
    { label: "LONGEST STREAK", value: String(longest.len), unit: longest.len === 1 ? "DAY" : "DAYS", sub: range(longest.start, longest.end, true) },
  ];
  const rows = [
    ["COMMITS", "LAST YEAR", stats.commits],
    ["PULL REQUESTS", "", stats.prs],
    ["ISSUES", "", stats.issues],
    ["STARS EARNED", "", stats.stars],
    ["CONTRIBUTED TO", "LAST YEAR", stats.contributedTo],
  ];
  const langs = stats.languages;
  const rankSize = r.name.length > 14 ? 16 : 22;

  const cinzel = await fontFace("Cinzel", 900, uniq(["MATCH HISTORY", r.name, ...cer.map((c) => c.name)]));
  const display = await fontFace("Anton", 400, uniq([...kpis.map((k) => k.value), ...rows.map((r) => String(r[2]))]));
  const h6 = await fontFace("Rajdhani", 600, uniq(["CLASSIC & RANKED // PUBLIC REPOS", "LOCKED", rankSub, ...cer.map((c) => c.rule), ...kpis.map((k) => k.label + k.sub), ...rows.map((r) => r[0] + r[1])]));
  const h7 = await fontFace("Rajdhani", 700, uniq(["BATTLE STATS", "EMBLEM // LANGUAGES", badge, "DAYS", ...langs.map((l) => l.name.toUpperCase())]));
  const mono = await fontFace("JetBrains Mono", 500, "0123456789.%");

  // KPI row
  const kw = 357, kh = 150, ky = 136;
  let kpiEls = "";
  kpis.forEach((k, i) => {
    const x = 48 + i * (kw + 16);
    kpiEls += `<g class="rise" style="animation-delay:${(0.15 + i * 0.1).toFixed(2)}s">
  <path d="${cham(x, ky, kw, kh, 14)}" fill="url(#mbPanel)" stroke="${k.hot ? C.gold : C.edge}" stroke-opacity="${k.hot ? 0.8 : 0.45}"/>
  <rect x="${x + 14}" y="${ky}" width="48" height="3" fill="${C.gold}"/>
  <text class="h6" x="${x + 24}" y="${ky + 36}" font-size="13" letter-spacing="3" fill="${C.muted}">${k.label}</text>
  <text class="d" x="${x + 24}" y="${ky + 104}" font-size="60" fill="${k.hot ? C.gold : C.cream}">${esc(k.value)}${k.unit ? `<tspan class="h7" font-size="18" dx="8" letter-spacing="2" fill="${C.muted}">${k.unit}</tspan>` : ""}</text>
  <text class="h6" x="${x + 24}" y="${ky + 132}" font-size="14" letter-spacing="1.5" fill="${C.soft}">${esc(k.sub)}</text>
</g>`;
  });
  // Announcer badge on the current streak panel, sparkline of the last 20 weeks on the total panel.
  const bx = 48 + kw + 16, bw = badge.length * 9 + 28;
  kpiEls += `<g class="badge"><path d="${cham(bx + kw - 24 - bw, ky + 20, bw, 26, 7)}" fill="${current.len ? C.red : C.line}"/><text class="h7" x="${bx + kw - 24 - bw / 2}" y="${ky + 38}" text-anchor="middle" font-size="14" letter-spacing="2" fill="${C.cream}">${badge}</text></g>`;
  const weeks = [];
  for (let i = stats.days.length - 1; i >= 0 && weeks.length < 140; i--) weeks.push(stats.days[i].contributionCount);
  const weekly = [];
  for (let i = 0; i < 20; i++) weekly.unshift(weeks.slice(i * 7, i * 7 + 7).reduce((a, b) => a + b, 0));
  const maxW = Math.max(1, ...weekly);
  const sx = 48 + 210, sy = ky + 112;
  const spark = weekly
    .map((v, i) => {
      const h = Math.max(2, (v / maxW) * 56);
      return `<rect class="bar" x="${sx + i * 6.5}" y="${(sy - h).toFixed(1)}" width="4" height="${h.toFixed(1)}" fill="${i === weekly.length - 1 ? C.gold : C.cyan}" fill-opacity="${i === weekly.length - 1 ? 1 : 0.55}" style="animation-delay:${(0.5 + i * 0.03).toFixed(2)}s;transform-origin:0 ${sy}px"/>`;
    })
    .join("");

  // Battle stats
  const py = 302, ph = 226;
  const lw = 540;
  let rowEls = "";
  rows.forEach(([label, note, value], i) => {
    const y = py + 52 + i * 32;
    rowEls += `<g class="fade" style="animation-delay:${(0.5 + i * 0.08).toFixed(2)}s">
  ${i % 2 === 0 ? `<path d="${cham(72, y, lw - 48, 28, 6)}" fill="${ROW}"/>` : ""}
  <text class="h6" x="86" y="${y + 19}" font-size="16" letter-spacing="1" fill="${C.soft}">${label}${note ? `<tspan font-size="12" dx="8" letter-spacing="2" fill="${C.muted}">${note}</tspan>` : ""}</text>
  <text class="d" x="${48 + lw - 38}" y="${y + 22}" text-anchor="end" font-size="22" fill="${C.cream}">${value}</text>
</g>`;
  });

  // Languages
  const lx = 604, lwR = 548, barX = lx + 24, barW = lwR - 48;
  let acc = 0;
  const segs = langs
    .map((l) => {
      const w = (l.pct / 100) * barW;
      const el = `<rect x="${(barX + acc).toFixed(1)}" y="${py + 54}" width="${Math.max(0, w - 2).toFixed(1)}" height="10" fill="${l.color}"/>`;
      acc += w;
      return el;
    })
    .join("");
  const colW = (barW - 24) / 2;
  const langEls = langs
    .map((l, i) => {
      const x = barX + (i % 2) * (colW + 24);
      const y = py + 100 + Math.floor(i / 2) * 30;
      return `<g class="fade" style="animation-delay:${(0.7 + i * 0.06).toFixed(2)}s"><rect x="${x}" y="${y - 10}" width="9" height="9" transform="rotate(45 ${x + 4.5} ${y - 5.5})" fill="${l.color}"/><text class="h7" x="${x + 20}" y="${y}" font-size="16" letter-spacing=".5" fill="${C.cream}">${esc(l.name.toUpperCase())}</text><text class="m" x="${x + colW}" y="${y}" text-anchor="end" font-size="13" fill="${C.muted}">${l.pct.toFixed(1)}%</text></g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Match history: ${total} total contributions since ${fmt(stats.createdAt.slice(0, 10), true)}, current streak ${current.len} days, longest streak ${longest.len} days. ${stats.commits} commits last year, ${stats.prs} pull requests, ${stats.issues} issues, ${stats.stars} stars. Top languages: ${langs.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(", ")}.">
<title>Match history</title>
<style>${cinzel}${display}${h6}${h7}${mono}
${FONT_CSS}
.rise{opacity:0;animation:rise .6s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.fade{opacity:0;animation:fade .5s forwards}
@keyframes fade{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
.bar{transform:scaleY(0);animation:bar .5s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes bar{to{transform:scaleY(1)}}
.badge{opacity:0;animation:fade .3s .6s forwards,pulse 2.4s 1s ease-in-out infinite}
@keyframes pulse{50%{opacity:.55}}
@media (prefers-reduced-motion: reduce){*{animation:none!important}.rise,.fade,.badge{opacity:1}.bar{transform:none}}
</style>
<defs>
  ${screenDefs(W, H, 24)}
  <clipPath id="langBar"><rect x="${barX}" y="${py + 50}" width="0" height="18"><animate attributeName="width" from="0" to="${barW}" dur="1.1s" begin=".6s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1" keyTimes="0;1"/></rect></clipPath>
</defs>
${screenBg(W, H, 24)}
${headBar(48, 54, 280, 42)}
<text class="t" x="70" y="84" font-size="26" fill="${C.cream}">MATCH HISTORY</text>
<text class="h6" x="70" y="110" font-size="15" letter-spacing="4" fill="${C.muted}">CLASSIC &amp; RANKED // PUBLIC REPOS</text>
${cer.map((c, i) => medal(c, 352 + i * 126, 38)).join("")}
<image href="${await rankIcon(r.t)}" x="${W - 48 - 72}" y="34" width="72" height="72"><title>${r.name}</title></image>
<text class="t" x="${W - 48 - 80}" y="76" text-anchor="end" font-size="${rankSize}" fill="${r.tier.color}">${r.name}</text>
<text class="h6" x="${W - 48 - 80}" y="98" text-anchor="end" font-size="13" letter-spacing="2" fill="${C.muted}">${rankSub}</text>
${kpiEls}
<g class="rise" style="animation-delay:.2s">${spark}</g>
<g class="rise" style="animation-delay:.4s">
  <path d="${cham(48, py, lw, ph, 14)}" fill="url(#mbPanel)" stroke="${C.edge}" stroke-opacity=".45"/>
  <text class="h7" x="72" y="${py + 34}" font-size="13" letter-spacing="3" fill="${C.gold}">BATTLE STATS</text>
</g>
${rowEls}
<g class="rise" style="animation-delay:.5s">
  <path d="${cham(lx, py, lwR, ph, 14)}" fill="url(#mbPanel)" stroke="${C.edge}" stroke-opacity=".45"/>
  <text class="h7" x="${barX}" y="${py + 34}" font-size="13" letter-spacing="3" fill="${C.gold}">EMBLEM // LANGUAGES</text>
  <rect x="${barX}" y="${py + 54}" width="${barW}" height="10" fill="${C.line}"/>
  <g clip-path="url(#langBar)">${segs}</g>
</g>
${langEls}
${screenFrame(W, H, 24)}
</svg>`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [user, out] = process.argv.slice(2);
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required");
  const [stats, last365] = await Promise.all([fetchStats(user, token), fetchTotal(user)]);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, await renderCareerCard(stats, last365));
  const s = streaks(stats.days);
  console.log(`career: ${stats.days.length} days, streak ${s.current.len} (longest ${s.longest.len}), ${stats.languages.length} languages`);
}
