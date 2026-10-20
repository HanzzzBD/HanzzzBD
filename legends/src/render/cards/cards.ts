/**
 * README cards (component-catalog C-10, C-20, C-30, C-43, C-36, C-37). Each takes the
 * profile model and a theme and returns a complete SVG. Text alternatives (<desc>, alt)
 * carry every value the card draws.
 */
import { HERO_UNLOCK } from "../../engine/heroes/catalog.ts";
import { RULESET_V1 } from "../../engine/rules.ts";
import { glyph } from "../map/glyphs.ts";
import { rankText } from "../map/rank.ts";
import { formatDay, type ProfileModel } from "../readme/model.ts";
import { el, type SvgElement, text } from "../svg.ts";
import { fitLabel, formatCount, textWidth, truncate } from "../text.ts";
import { RARITY_COLOURS, type RarityId, ROLE_COLOURS, type Theme } from "../tokens.ts";
import { crest } from "./crest.ts";
import { bar, card, hexagon, line, statTile } from "./shared.ts";

const t11 = { size: 11 };
const tierName = (id: string) => RULESET_V1.tiers.find((t) => t.id === id)?.name ?? id;
const t12 = { size: 12 };
const bold = (size: number) => ({ size, bold: true });

// ------------------------------------------------------------------ C-10 player card

export function playerCardDesc(m: ProfileModel): string {
  const p = m.player;
  const exp =
    p.expForNext === null
      ? `${formatCount(p.exp)} EXP (maximum level)`
      : `${formatCount(p.expIntoLevel)} of ${formatCount(p.expForNext)} EXP to level ${p.level + 1}`;
  return [
    `${p.name}, level ${formatCount(p.level)} ${p.title}, ${exp}.`,
    `Rank ${m.rank ? rankText({ tier: m.rank.rank.tier, division: m.rank.rank.division, stars: m.rank.rank.starsInDivision }).label : "unranked"}.`,
    `${formatCount(p.bp)} Battle Points.`,
    p.streak === null ? "Streak unavailable." : `${p.streak}-day contribution streak.`,
    p.mainHero ? `Main hero ${p.mainHero.name} (${p.mainHero.technology}).` : "No main hero yet.",
    p.emblem ? `Active emblem ${p.emblem.name} level ${p.emblem.level}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function playerCard(m: ProfileModel, theme: Theme): string {
  const p = m.player;
  const rank = m.rank
    ? rankText({
        tier: m.rank.rank.tier,
        division: m.rank.rank.division,
        stars: m.rank.rank.starsInDivision,
      }).label
    : null;
  const expLabel =
    p.expForNext === null
      ? `${formatCount(p.exp)} EXP · max level`
      : `${formatCount(p.expIntoLevel)} / ${formatCount(p.expForNext)} EXP to Lv ${formatCount(p.level + 1)}`;
  const body: SvgElement[] = [
    // Avatar: initials in a gold ring (no avatar image in v1).
    el("circle", {
      cx: 60,
      cy: 84,
      r: 32,
      fill: theme.bgRaised,
      stroke: theme.gold,
      "stroke-width": 3,
    }),
    el(
      "text",
      {
        x: 60,
        y: 92,
        "text-anchor": "middle",
        "font-size": 22,
        "font-weight": 700,
        fill: theme.textPrimary,
      },
      [text(truncate(p.initials, 44, bold(22)))],
    ),
    line(108, 76, p.name, 272, bold(20), theme.textPrimary),
    line(
      108,
      97,
      `Lv ${formatCount(p.level)} · ${p.title}`,
      272,
      bold(12),
      theme.id === "light" ? theme.gold : theme.goldHi,
    ),
    bar(108, 108, 272, 8, p.levelPercent, theme),
    line(108, 134, expLabel, 272, t11, theme.textSecondary),
    statTile(20, 152, 114, "RANK", rank, theme),
    statTile(143, 152, 114, "BATTLE POINTS", formatCount(p.bp), theme),
    statTile(
      266,
      152,
      114,
      "STREAK",
      p.streak === null ? null : `${formatCount(p.streak)} days`,
      theme,
    ),
    line(
      20,
      230,
      p.mainHero
        ? `Main hero: ${p.mainHero.name} · ${p.mainHero.technology}`
        : "Main hero: none yet",
      200,
      t11,
      theme.textSecondary,
    ),
    line(
      380,
      230,
      p.emblem ? `Emblem: ${p.emblem.name} Lv ${p.emblem.level}` : "Emblem: none",
      160,
      t11,
      theme.textSecondary,
      "end",
    ),
  ];
  return card({
    id: "player-card",
    height: 250,
    overline: "PLAYER LOBBY",
    title: "Player card",
    desc: playerCardDesc(m),
    sample: m.sample,
    stale: m.stale,
    theme,
    body,
  });
}

// ------------------------------------------------------------------ C-20 season card

export function seasonCardDesc(m: ProfileModel): string {
  const r = m.rank;
  if (!r) return "No active season yet.";
  const parts = [
    `Season ${r.seasonNumber}, ${r.daysLeft} days left.`,
    `Rank ${rankText({ tier: r.rank.tier, division: r.rank.division, stars: r.rank.starsInDivision }).label}.`,
    r.rank.starsForDivision === null
      ? `${r.rank.starsInDivision} stars.`
      : `${r.rank.starsInDivision} of ${r.rank.starsForDivision} stars in this division.`,
    r.next ? `${r.next.starsNeeded} more stars to ${r.next.label}.` : "Top rank reached.",
    `${r.weekStars} of ${r.weeklyStarCap} stars this week.`,
  ];
  if (r.trial?.required) {
    const t = r.trial;
    const req = r.trial.required;
    parts.push(
      `${tierName(t.tier)} promotion trial: objectives ${Math.min(t.progress.objectives, req.objectives)} of ${req.objectives}, contested ${Math.min(t.progress.contested, req.contested)} of ${req.contested}${t.met ? ", met" : ""}.`,
    );
  }
  if (r.bankedStars > 0) parts.push(`${r.bankedStars} stars banked until the trial is complete.`);
  return parts.join(" ");
}

export function seasonCard(m: ProfileModel, theme: Theme): string {
  const r = m.rank;
  const body: SvgElement[] = [];
  let overline = "SEASON";
  if (!r) {
    body.push(line(20, 80, "No active season yet", 360, bold(18), theme.textPrimary));
    body.push(line(20, 104, "Rank progress starts with Season 1.", 360, t12, theme.textSecondary));
  } else {
    overline = `SEASON ${r.seasonNumber} · ${formatCount(r.daysLeft)} DAYS LEFT`;
    const label = rankText({
      tier: r.rank.tier,
      division: r.rank.division,
      stars: r.rank.starsInDivision,
    }).label;
    body.push(
      crest(
        r.rank.tier,
        r.rank.division,
        r.rank.division === null ? r.rank.starsInDivision : null,
        22,
        46,
        70,
        theme,
      ),
    );
    body.push(line(112, 70, label, 268, bold(20), theme.textPrimary));
    body.push(
      line(
        112,
        90,
        `Season stars ${formatCount(r.stars)}${r.bankedStars > 0 ? ` · ${r.bankedStars} banked` : ""}`,
        268,
        t12,
        theme.textSecondary,
      ),
    );
    const slots = Math.min(5, r.rank.starsForDivision ?? 0);
    for (let i = 0; i < slots; i++) {
      const filled = i < r.rank.starsInDivision;
      body.push(
        glyph("star", 122 + i * 22, 110, 18, filled ? theme.goldHi : theme.locked, {
          fill: filled ? theme.goldHi : "none",
          strokeWidth: 1.6,
        }),
      );
    }
    body.push(
      line(
        slots > 0 ? 122 + slots * 22 : 112,
        115,
        r.rank.starsForDivision === null
          ? `${formatCount(r.rank.starsInDivision)} stars`
          : `${r.rank.starsInDivision} / ${r.rank.starsForDivision}`,
        120,
        t12,
        theme.textSecondary,
      ),
    );
    body.push(
      line(
        112,
        140,
        r.next
          ? `Next: ${r.next.label} · ${formatCount(r.next.starsNeeded)} stars to go`
          : "Top rank reached",
        268,
        t12,
        theme.textPrimary,
      ),
    );
    body.push(
      line(
        112,
        158,
        `This week ${r.weekStars} / ${r.weeklyStarCap} stars`,
        268,
        t11,
        theme.textSecondary,
      ),
    );
    // Trial block (C-22) or this season's battles.
    body.push(el("rect", { x: 20, y: 172, width: 360, height: 60, rx: 8, fill: theme.bgRaised }));
    if (r.trial?.required) {
      const t = r.trial;
      const req = r.trial.required;
      const cap = (n: number, of: number) => `${Math.min(n, of)}/${of}`;
      const parts = [
        `Objectives ${cap(t.progress.objectives, req.objectives)}`,
        `Contested ${cap(t.progress.contested, req.contested)}`,
        ...(req.repos ? [`Repos ${cap(t.progress.repos, req.repos)}`] : []),
        ...(req.counterparts ? [`People ${cap(t.progress.counterparts, req.counterparts)}`] : []),
      ];
      const done =
        Math.min(t.progress.objectives, req.objectives) +
        Math.min(t.progress.contested, req.contested);
      const total = Math.max(1, req.objectives + req.contested);
      body.push(
        line(
          32,
          190,
          `PROMOTION TRIAL · ${tierName(t.tier).toUpperCase()}${t.met ? " · MET" : ""}`,
          336,
          bold(11),
          theme.gold,
        ),
      );
      body.push(bar(32, 198, 336, 6, Math.floor((done * 100) / total), theme));
      body.push(line(32, 222, parts.join(" · "), 336, t11, theme.textSecondary));
    } else {
      const s = m.season;
      body.push(line(32, 194, "THIS SEASON", 336, bold(11), theme.gold));
      body.push(
        line(
          32,
          218,
          s
            ? `${formatCount(s.battles)} battles · ${formatCount(s.victories)} victories · ${formatCount(s.mvps)} MVP`
            : "No battles yet",
          336,
          t12,
          theme.textPrimary,
        ),
      );
    }
  }
  return card({
    id: "season-card",
    height: 250,
    overline,
    title: "Season card",
    desc: seasonCardDesc(m),
    sample: m.sample,
    stale: m.stale,
    theme,
    body,
  });
}

// ------------------------------------------------------------------ C-30 hero lineup

export function heroLineupDesc(m: ProfileModel): string {
  if (m.lineup.length === 0)
    return "No hero unlocked yet. Mastery reflects verified activity volume, not assessed skill.";
  return `${m.lineup
    .map(
      (h) =>
        `${h.name} (${h.technology}, ${h.role.name})${h.isMain ? ", main hero" : ""}: ${h.mastery.tierName ?? "Novice"}, ${formatCount(h.mastery.mp)} mastery points`,
    )
    .join("; ")}. Mastery reflects verified activity volume, not assessed skill.`;
}

export function heroLineupCard(m: ProfileModel, theme: Theme): string {
  const body: SvgElement[] = [];
  for (let i = 0; i < 3; i++) {
    const x = 16 + i * 128;
    const cx = x + 56;
    const hero = m.lineup[i];
    body.push(
      el("rect", {
        x,
        y: 40,
        width: 112,
        height: 168,
        rx: 10,
        fill: theme.bgRaised,
        ...(hero?.isMain ? { stroke: theme.gold, "stroke-width": 2 } : {}),
      }),
    );
    if (!hero) {
      body.push(
        el("path", {
          d: hexagon(cx, 92, 28),
          fill: "none",
          stroke: theme.locked,
          "stroke-width": 2,
          "stroke-dasharray": "4 4",
        }),
      );
      body.push(line(cx, 150, "Open slot", 100, bold(12), theme.textSecondary, "middle"));
      body.push(
        line(
          cx,
          168,
          i === 0 ? "No hero yet" : "Unlock more heroes",
          100,
          t11,
          theme.textTertiary,
          "middle",
        ),
      );
      continue;
    }
    body.push(
      el("path", {
        d: hexagon(cx, 92, 30),
        fill: theme.bgSurface,
        stroke: hero.icon.accent,
        "stroke-width": 4,
      }),
    );
    body.push(
      el(
        "text",
        {
          x: cx,
          y: 99,
          "text-anchor": "middle",
          "font-size": 18,
          "font-weight": 700,
          fill: theme.textPrimary,
        },
        [text(truncate(hero.icon.monogram, 40, bold(18)))],
      ),
    );
    if (hero.isMain)
      body.push(
        glyph("star", x + 98, 54, 16, theme.goldHi, { fill: theme.goldHi, strokeWidth: 1 }),
      );
    const roleColour = hero.role.id
      ? (ROLE_COLOURS[hero.role.id] ?? theme.textSecondary)
      : theme.textSecondary;
    body.push(line(cx, 146, hero.name, 100, bold(13), theme.textPrimary, "middle"));
    body.push(line(cx, 163, hero.technology, 100, t11, theme.textSecondary, "middle"));
    // Role tint on a small marker only (visual-direction §3.5); the role name stays neutral text.
    body.push(
      el("circle", {
        cx: cx - 4 - textWidth(hero.role.name, t11) / 2,
        cy: 175,
        r: 3.5,
        fill: roleColour,
      }),
    );
    body.push(line(cx + 4, 179, hero.role.name, 92, t11, theme.textSecondary, "middle"));
    body.push(
      line(
        cx,
        196,
        `${hero.mastery.tierName ?? "Novice"} · ${formatCount(hero.mastery.mp)} MP`,
        100,
        t11,
        theme.textPrimary,
        "middle",
      ),
    );
    body.push(bar(x + 12, 200, 88, 4, hero.mastery.indicator.percent, theme));
  }
  const caption =
    m.lineup.length === 0
      ? `Unlock: ${HERO_UNLOCK.minWeightedUsage} MP and ${HERO_UNLOCK.minSharePercent}% share in a repo with ${HERO_UNLOCK.minRepoCommits}+ commits`
      : "Mastery = verified activity volume, not assessed skill";
  body.push(line(200, 232, caption, 360, t11, theme.textTertiary, "middle"));
  return card({
    id: "hero-lineup",
    height: 250,
    overline: "HERO LINEUP",
    aside: `${m.stats.heroesUnlocked} unlocked`,
    title: "Hero lineup",
    desc: heroLineupDesc(m),
    sample: m.sample,
    stale: m.stale,
    theme,
    body,
  });
}

// ------------------------------------------------------------------ C-43 medals strip

const tierSuffix = (tier: string) => (tier === "-" ? "" : ` ${tier}`);

export function medalsDesc(m: ProfileModel): string {
  const total = `${m.stats.medals} of ${m.stats.medalTiers} medals earned.`;
  if (m.medals.showcase.length === 0)
    return `${total} ${m.medals.next ? `Closest: ${m.medals.next.name} (${m.medals.next.progress.current} of ${m.medals.next.progress.target}).` : ""}`.trim();
  return `${total} Showing: ${m.medals.showcase.map((x) => `${x.name}${tierSuffix(x.tier)} (${x.rarity}${x.earnedOn ? `, ${x.earnedOn}` : ""})`).join("; ")}.`;
}

function medalGlyph(
  cx: number,
  cy: number,
  colour: string,
  theme: Theme,
  earned: boolean,
): SvgElement {
  return el("g", { "aria-hidden": "true" }, [
    el("polygon", {
      points: `${cx - 9},${cy - 22} ${cx - 3},${cy - 22} ${cx + 1},${cy - 10} ${cx - 5},${cy - 10}`,
      fill: earned ? theme.gold : theme.locked,
    }),
    el("polygon", {
      points: `${cx + 9},${cy - 22} ${cx + 3},${cy - 22} ${cx - 1},${cy - 10} ${cx + 5},${cy - 10}`,
      fill: earned ? theme.goldHi : theme.locked,
    }),
    el("circle", {
      cx,
      cy,
      r: 11,
      fill: earned ? colour : "none",
      stroke: colour,
      "stroke-width": 2,
    }),
    glyph("star", cx, cy, 11, earned ? theme.onGold : colour, {
      fill: earned ? theme.onGold : "none",
      strokeWidth: 1.5,
    }),
  ]);
}

export function medalsCard(m: ProfileModel, theme: Theme): string {
  const body: SvgElement[] = [];
  const colours = RARITY_COLOURS[theme.id];
  if (m.medals.showcase.length === 0) {
    body.push(
      line(200, 100, "Your first medal awaits", 360, bold(16), theme.textPrimary, "middle"),
    );
    const next = m.medals.next;
    if (next) {
      body.push(medalGlyph(200, 150, colours[next.rarity as RarityId], theme, false));
      body.push(
        line(
          200,
          186,
          `${next.name}${tierSuffix(next.tier)} · ${next.progress.current} / ${next.progress.target}`,
          340,
          t12,
          theme.textSecondary,
          "middle",
        ),
      );
    }
  }
  m.medals.showcase.forEach((medal, i) => {
    const x = 16 + (i % 3) * 126;
    const y = 40 + Math.floor(i / 3) * 92;
    const colour = colours[medal.rarity as RarityId];
    const rims =
      medal.rarity === "epic" || medal.rarity === "legendary" ? 2 : medal.rarity === "rare" ? 2 : 1;
    body.push(
      el("rect", {
        x,
        y,
        width: 116,
        height: 84,
        rx: 8,
        fill: theme.bgRaised,
        stroke: colour,
        "stroke-width": medal.rarity === "common" ? 1 : 1.5,
      }),
    );
    if (rims === 2)
      body.push(
        el("rect", {
          x: x + 3,
          y: y + 3,
          width: 110,
          height: 78,
          rx: 6,
          fill: "none",
          stroke: colour,
          "stroke-opacity": 0.5,
        }),
      );
    body.push(medalGlyph(x + 22, y + 34, colour, theme, true));
    if (medal.tier !== "-")
      body.push(line(x + 40, y + 38, medal.tier, 66, bold(12), theme.textSecondary));
    const name = fitLabel(medal.name, null, 98, [12, 11]);
    body.push(
      el(
        "text",
        {
          x: x + 10,
          y: y + 62,
          "font-size": name.size,
          "font-weight": 700,
          fill: theme.textPrimary,
        },
        [text(name.text)],
      ),
    );
    body.push(
      line(
        x + 10,
        y + 77,
        `${medal.rarity[0]?.toUpperCase()}${medal.rarity.slice(1)}`,
        96,
        t11,
        colour,
      ),
    );
    if (medal.earnedOn)
      body.push(
        line(x + 106, y + 20, formatDay(medal.earnedOn), 60, t11, theme.textTertiary, "end"),
      );
  });
  body.push(
    line(
      200,
      236,
      "Recent and rarest · game medals, not real-world awards",
      360,
      t11,
      theme.textTertiary,
      "middle",
    ),
  );
  return card({
    id: "medals-strip",
    height: 250,
    overline: "MEDALS",
    aside: `${m.stats.medals} / ${m.stats.medalTiers}`,
    title: "Medals",
    desc: medalsDesc(m),
    sample: m.sample,
    stale: m.stale,
    theme,
    body,
  });
}

// ------------------------------------------------------------------ C-36 emblems, C-37 build

export function emblemsDesc(m: ProfileModel): string {
  const active = m.emblems.active
    ? `Active emblem: ${m.emblems.active.name} level ${m.emblems.active.level}.`
    : "No active emblem.";
  return `${active} ${m.emblems.emblems.map((e) => `${e.name} level ${e.level} (${formatCount(e.ep)} EP)`).join("; ")}.`;
}

export function emblemsCard(m: ProfileModel, theme: Theme): string {
  const body: SvgElement[] = [];
  m.emblems.emblems.forEach((e, i) => {
    const col = i < 4 ? 0 : 1;
    const row = i < 4 ? i : i - 4;
    const x = 20 + col * 190;
    const y = 54 + row * 48;
    const colour = e.active
      ? theme.id === "light"
        ? theme.gold
        : theme.goldHi
      : e.ep > 0
        ? theme.textPrimary
        : theme.textSecondary;
    body.push(line(x, y, `${e.name}${e.active ? " · active" : ""}`, 120, bold(12), colour));
    body.push(
      line(x + 170, y, e.ep > 0 ? `Lv ${e.level}` : "—", 50, t12, theme.textSecondary, "end"),
    );
    body.push(
      bar(x, y + 9, 170, 5, e.indicator.percent, theme, e.active ? theme.gold : theme.teal),
    );
    body.push(
      line(
        x,
        y + 28,
        e.indicator.next === null
          ? `${formatCount(e.ep)} EP · max`
          : `${formatCount(e.ep)} / ${formatCount(e.indicator.next)} EP`,
        170,
        t11,
        theme.textTertiary,
      ),
    );
  });
  body.push(
    line(20, 246, "Emblem levels come from verified domain activity", 360, t11, theme.textTertiary),
  );
  return card({
    id: "emblems",
    height: 260,
    overline: "EMBLEMS",
    aside: m.emblems.active
      ? `${m.emblems.active.name} Lv ${m.emblems.active.level}`
      : "none active",
    title: "Emblems",
    desc: emblemsDesc(m),
    sample: m.sample,
    stale: m.stale,
    theme,
    body,
  });
}

/** Slot-category glyphs (component C-37), original 24-unit drawings. */
const SLOT_GLYPHS: Readonly<Record<string, string>> = {
  boots: "M8 3 V13 L4 17 V21 H20 V18 Q20 15 15 14 V3 Z",
  armor: "M5 4 L9 3 Q12 6 15 3 L19 4 L20 12 Q18 19 12 21 Q6 19 4 12 Z",
  forge: "M3 9 L11 3 L15 7 L7 13 Z M11 9 L20 19 L18 21 L9 11",
  relic: "M12 2 L18 9 L12 22 L6 9 Z M6 9 H18",
  tome: "M5 4 H17 Q19 4 19 6 V20 H7 Q5 20 5 18 Z M5 18 Q5 16 7 16 H19",
  charm: "M7 3 L12 10 L17 3 M12 10 A5 5 0 1 0 12.01 10",
};

function slotGlyph(slot: string, cx: number, cy: number, size: number, colour: string): SvgElement {
  const k = Math.round((size / 24) * 100) / 100;
  return el(
    "g",
    {
      transform: `translate(${cx - size / 2} ${cy - size / 2}) scale(${k})`,
      "aria-hidden": "true",
    },
    [
      el("path", {
        d: SLOT_GLYPHS[slot] ?? SLOT_GLYPHS.relic ?? "",
        fill: "none",
        stroke: colour,
        "stroke-width": 1.8,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      }),
    ],
  );
}

export function buildDesc(m: ProfileModel): string {
  const items = m.equipment.build.map((s) =>
    s.item
      ? `${s.item.name}${s.item.tier ? ` (${s.item.tier})` : ""}${s.item.tagged ? ", tagged" : ""}`
      : "empty slot",
  );
  const declared =
    m.equipment.declaredKit.length > 0
      ? ` Declared, not verified: ${m.equipment.declaredKit.map((d) => d.name).join(", ")}.`
      : "";
  return `Build: ${items.join("; ")}. ${m.equipment.inventory.length} verified or tagged tools in the inventory.${declared}`;
}

export function buildCard(m: ProfileModel, theme: Theme): string {
  const body: SvgElement[] = [];
  const colours = RARITY_COLOURS[theme.id];
  m.equipment.build.slice(0, 5).forEach((slot, i) => {
    const x = 20 + i * 74;
    const item = slot.item;
    const colour = item?.tier ? colours[item.tier as RarityId] : theme.locked;
    body.push(
      el("rect", {
        x,
        y: 42,
        width: 64,
        height: 64,
        rx: 8,
        fill: theme.bgRaised,
        stroke: colour,
        "stroke-width": item ? 1.5 : 1,
        ...(item?.tagged || !item ? { "stroke-dasharray": "4 3" } : {}),
      }),
    );
    if (item) {
      body.push(slotGlyph(item.slot, x + 32, 68, 30, item.tier ? colour : theme.textSecondary));
      body.push(
        line(
          x + 32,
          100,
          item.tagged ? "tagged" : (item.tier ?? ""),
          56,
          { size: 10 },
          colour,
          "middle",
        ),
      );
      body.push(line(x + 32, 122, item.name, 70, t11, theme.textSecondary, "middle"));
    } else body.push(line(x + 32, 80, "empty", 56, t11, theme.textTertiary, "middle"));
  });
  const declared = m.equipment.declaredKit.map((d) => d.name).join(" · ");
  body.push(
    line(
      20,
      150,
      declared
        ? `Declared (not verified): ${declared}`
        : `${m.equipment.inventory.length} tools in the inventory`,
      360,
      t11,
      theme.textTertiary,
    ),
  );
  return card({
    id: "build",
    height: 166,
    overline: "BUILD",
    aside: `${m.equipment.build.filter((s) => s.item).length} / 5 slots`,
    title: "Equipment build",
    desc: buildDesc(m),
    sample: m.sample,
    stale: m.stale,
    theme,
    body,
  });
}
