/**
 * README sections (readme-layout §3, information-architecture §4). Each section returns
 * its card pictures (shown in rows by the template) and its text: summary lines, task
 * lists, tables and collapsed <details>. Every value drawn on a card also appears in text.
 */

import { RULESET_V1 } from "../../engine/rules.ts";
import {
  buildDesc,
  emblemsDesc,
  heroLineupDesc,
  medalsDesc,
  playerCardDesc,
  seasonCardDesc,
} from "../cards/cards.ts";
import { regionDef } from "../map/catalog.ts";
import { rankText } from "../map/rank.ts";
import { mapAltText, regionList } from "../map/text.ts";
import { formatCount } from "../text.ts";
import {
  centered,
  details,
  githubProfileUrl,
  githubRepoUrl,
  join,
  link,
  md,
  picture,
  repoPath,
  type SafeMd,
  sectionMarker,
  table,
  textBar,
  trusted,
} from "./markdown.ts";
import { formatDay, type ProfileModel, type SectionId } from "./model.ts";

export const CARD_FILES = {
  player: "player-card.svg",
  season: "season-card.svg",
  heroes: "hero-lineup.svg",
  medals: "medals-strip.svg",
  emblems: "emblems.svg",
  build: "build.svg",
  map: "world-map.svg",
} as const;
export type CardFile = keyof typeof CARD_FILES;

export interface SectionOutput {
  cards: SafeMd[];
  text: SafeMd;
}

export interface SectionContext {
  model: ProfileModel;
  /** Asset base path, e.g. "assets/legends" (dark/ and light/ below it). */
  assetBase: string;
  /** Alt texts by card (the cards' <desc>). */
  alt: Readonly<Record<CardFile, string>>;
}

const HOW_IT_WORKS = "docs/legends/how-it-works.md";

function cardPicture(ctx: SectionContext, file: CardFile, width = 400): SafeMd {
  return picture({
    dark: repoPath(`${ctx.assetBase}/dark/${CARD_FILES[file]}`),
    light: repoPath(`${ctx.assetBase}/light/${CARD_FILES[file]}`),
    alt: trimAlt(ctx.alt[file]),
    width,
  });
}

/** Alt text ≤ 600 characters, cut at a word boundary (readme-layout §7). */
export function trimAlt(value: string): string {
  if (value.length <= 600) return value;
  const cut = value.slice(0, 599);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

const plural = (n: number, word: string) => `${formatCount(n)} ${word}${n === 1 ? "" : "s"}`;
export const tierName = (id: string) => RULESET_V1.tiers.find((t) => t.id === id)?.name ?? id;

const rankLabel = (m: ProfileModel) =>
  m.rank
    ? rankText({
        tier: m.rank.rank.tier,
        division: m.rank.rank.division,
        stars: m.rank.rank.starsInDivision,
      }).label
    : "Unranked";

const status = (s: "active" | "completed" | "expired") => (s === "completed" ? "[x]" : "[ ]");

function questLine(
  q: ProfileModel["quests"]["today"] extends infer B
    ? B extends { quests: Array<infer Q> }
      ? Q
      : never
    : never,
): SafeMd {
  const progress = `${formatCount(q.progress.current)}/${formatCount(q.progress.target)}`;
  const body = md`**${q.name}**: ${q.description} · ${progress} · +${q.reward.bp} BP`;
  return q.status === "expired"
    ? md`- [ ] ~~${body}~~ (expired)`
    : md`- ${trusted(status(q.status))} ${body}`;
}

const SECTIONS: Readonly<Record<SectionId, (ctx: SectionContext) => SectionOutput>> = {
  lobby: (ctx) => ({
    cards: [cardPicture(ctx, "player"), cardPicture(ctx, "season")],
    text: trusted(""),
  }),

  statistics: ({ model: m }) => {
    const s = m.stats;
    const season = m.season
      ? md` · Season ${m.season.id.slice(1)} (${m.season.daysLeft} days left)`
      : trusted("");
    const rows: Array<[string, number | string, string]> = [
      ["Qualifying commits", s.commits, "✔ verified"],
      ["Merged pull requests", s.mergedPrs, "✔ verified"],
      ["Peer reviews", s.reviews, "✔ verified"],
      [
        "Issues opened / resolved",
        `${formatCount(s.issuesOpened)} / ${formatCount(s.issuesResolved)}`,
        "✔ verified",
      ],
      ["Releases", s.releases, "✔ verified"],
      [
        "Battles (victories, MVP)",
        `${formatCount(s.battles)} (${formatCount(s.victories)}, ${formatCount(s.mvps)})`,
        "Σ derived",
      ],
      ["Quests completed", s.questsCompleted, "Σ derived"],
      ["Campaigns completed", s.campaignsCompleted, "Σ derived"],
      ["Medals", `${formatCount(s.medals)} / ${formatCount(s.medalTiers)}`, "Σ derived"],
    ];
    return {
      cards: [],
      text: join([
        md`**Level ${m.player.level} · ${rankLabel(m)}${season} · ${m.player.bp} BP**`,
        trusted(""),
        details(
          md`<b>📊 Player statistics</b>: ${s.commits} commits · ${s.mergedPrs} merged PRs · ${s.reviews} reviews`,
          table(["Statistic", "Value", "Source"], rows),
        ),
      ]),
    };
  },

  level: ({ model: m }) => {
    const p = m.player;
    const rest =
      p.expRemaining === null
        ? md`maximum level · ${p.exp} EXP`
        : md`${p.expIntoLevel} / ${p.expForNext} EXP · ${p.expRemaining} EXP to level ${p.level + 1}`;
    return {
      cards: [],
      text: md`✨ **Level ${p.level} · ${p.title}** — ${textBar(p.levelPercent)} · ${rest}`,
    };
  },

  rank: ({ model: m }) => {
    const r = m.rank;
    if (!r) return { cards: [], text: md`🛡 **Rank:** unranked until Season 1 starts` };
    const next = r.next
      ? md`${r.next.starsNeeded} ★ to ${r.next.label}`
      : trusted("top rank reached");
    const trial = r.trial?.required
      ? md` · ${tierName(r.trial.tier)} trial: objectives ${Math.min(r.trial.progress.objectives, r.trial.required.objectives)}/${r.trial.required.objectives}, contested ${Math.min(r.trial.progress.contested, r.trial.required.contested)}/${r.trial.required.contested}${r.trial.met ? " (met)" : ""}`
      : trusted("");
    const banked = r.bankedStars > 0 ? md` · ${r.bankedStars} ★ banked` : trusted("");
    return {
      cards: [],
      text: md`🛡 **${rankLabel(m)}** — ${next} · ${r.weekStars}/${r.weeklyStarCap} ★ this week${banked}${trial}`,
    };
  },

  season: ({ model: m }) => {
    const s = m.season;
    const past =
      m.archives.length > 0
        ? md` · past: ${m.archives.map((a) => `${a.seasonId} ${a.finalRank ?? a.peakTier}`).join(", ")}`
        : trusted("");
    if (!s) return { cards: [], text: md`🗓 **Season:** none active${past}` };
    return {
      cards: [],
      text: md`🗓 **Season ${s.id.slice(1)}** · ${formatDay(s.startDay)} – ${formatDay(s.endDay, true)} · ${s.daysLeft} days left · ${s.battles} battles, ${s.victories} victories, ${s.mvps} MVP${past}`,
    };
  },

  heroes: (ctx) => {
    const m = ctx.model;
    const main = m.player.mainHero
      ? md` · main: ${m.player.mainHero.name} (${m.player.mainHero.technology})`
      : trusted("");
    return {
      cards: [cardPicture(ctx, "heroes")],
      text: md`🦸 **Heroes:** ${m.stats.heroesUnlocked} unlocked · ${m.stats.heroesDiscovered} discovered${main} · ${trusted("<sub>")}technology usage, not proof of expertise${trusted("</sub>")}`,
    };
  },

  mastery: ({ model: m }) => {
    if (m.collection.length === 0)
      return { cards: [], text: md`🎓 **Hero mastery:** no hero unlocked yet` };
    const rows = m.collection
      .slice(0, 8)
      .map((h) => [
        md`${h.name}${h.isMain ? " ★" : ""} · ${h.technology}`,
        md`${h.mastery.tierName ?? "Novice"}`,
        md`${h.mastery.indicator.label}`,
      ]);
    return {
      cards: [],
      text: details(
        md`<b>🎓 Hero mastery</b>: ${m.collection.length} heroes`,
        join([
          table(["Hero", "Tier", "Mastery points"], rows),
          trusted(""),
          md`Mastery reflects verified activity volume, not assessed skill.`,
        ]),
      ),
    };
  },

  emblems: (ctx) => {
    const e = ctx.model.emblems;
    const summary = e.active
      ? md`${e.active.name} Lv ${e.active.level} active`
      : trusted("no active emblem");
    const rows = e.emblems.map((x) => [
      md`${x.name}${x.active ? " (active)" : ""}`,
      md`Lv ${x.level}`,
      md`${x.indicator.label}`,
    ]);
    return {
      cards: [],
      text: details(
        md`<b>🔰 Emblems</b>: ${summary}`,
        join([
          centered(cardPicture(ctx, "emblems")),
          trusted(""),
          table(["Emblem", "Level", "Emblem points"], rows),
        ]),
      ),
    };
  },

  equipment: (ctx) => {
    const q = ctx.model.equipment;
    const filled = q.build.filter((s) => s.item).length;
    const rows = q.inventory
      .slice(0, 12)
      .map((i) => [
        md`${i.name}`,
        md`${i.state === "tagged" ? "tagged" : (i.tier ?? "—")}`,
        md`${i.state === "verified" ? `verified in ${plural(i.verifiedRepos, "repo")}` : `topic tag in ${plural(i.taggedRepos, "repo")}`}`,
      ]);
    const declared =
      q.declaredKit.length > 0
        ? md`✎ Declared, not verified: ${q.declaredKit.map((d) => d.name).join(" · ")}`
        : null;
    return {
      cards: [],
      text: details(
        md`<b>🎒 Equipment</b>: ${filled}/5 build slots · ${q.inventory.length} tools`,
        join([
          centered(cardPicture(ctx, "build")),
          trusted(""),
          rows.length > 0
            ? table(["Tool", "Tier", "Evidence"], rows)
            : md`No tools detected in owned public repositories yet.`,
          declared ? trusted("") : null,
          declared,
          trusted(""),
          md`A detected tool shows that it is configured in a project, not proficiency.`,
        ]),
      ),
    };
  },

  quests: ({ model: m }) => {
    const q = m.quests;
    const parts: Array<SafeMd | null> = [
      md`#### 🗡 Today's quests ${trusted("<sub>")}as of ${m.updatedLabel}${trusted("</sub>")}`,
      trusted(""),
    ];
    if (!q.today || q.today.quests.length === 0)
      parts.push(md`No daily board yet: quests start with Season 1.`);
    else parts.push(...q.today.quests.map(questLine));
    parts.push(trusted(""));
    if (q.week && q.week.quests.length > 0) {
      const dedication = q.dedication
        ? md` · Dedication ${q.dedication.daysWithAllDailies}/${q.dedication.target} days${q.dedication.completed ? " (done)" : ""}`
        : trusted("");
      parts.push(
        md`**This week**${dedication}`,
        trusted(""),
        ...q.week.quests.map(questLine),
        trusted(""),
      );
    } else if (q.week) parts.push(md`**This week:** weekly quests unlock at level 3.`, trusted(""));
    if (q.contracts && q.contracts.quests.length > 0)
      parts.push(
        md`**Season contracts:** ${q.contracts.quests
          .map(
            (c) =>
              `${c.name} ${c.status === "completed" ? "(done)" : `${formatCount(c.progress.current)}/${formatCount(c.progress.target)}`}`,
          )
          .join(" · ")}`,
        trusted(""),
      );
    if (m.campaign) {
      const step = m.campaign.steps.find((s) => !s.done);
      const index = step ? step.index : m.campaign.steps.length;
      parts.push(
        md`**Featured campaign · ${m.campaign.name}**: step ${index}/${m.campaign.steps.length}${step ? md`, ${step.text} (${formatCount(step.progress.current)}/${formatCount(step.progress.target)})` : trusted("")} · +${m.campaign.reward.bp} BP`,
      );
    }
    return { cards: [], text: join(parts) };
  },

  medals: (ctx) => {
    const m = ctx.model;
    const latest = m.medals.earned[0];
    const next = m.medals.next;
    return {
      cards: [cardPicture(ctx, "medals")],
      text: md`🏅 **Medals** (game achievements): ${m.stats.medals} of ${m.stats.medalTiers} earned${latest ? md` · latest: ${latest.name}${latest.tier === "-" ? "" : ` ${latest.tier}`} (${latest.earnedOn ? formatDay(latest.earnedOn) : "date unknown"})` : trusted("")}${next ? md` · closest: ${next.name}${next.tier === "-" ? "" : ` ${next.tier}`} ${next.progress.current}/${next.progress.target}` : trusted("")}`,
    };
  },

  map: (ctx) => {
    const m = ctx.model.map;
    const current = m.regions.find((r) => r.id === m.current);
    const cleared = current?.checkpoints.filter((c) => c.status === "cleared").length ?? 0;
    const img = picture({
      dark: repoPath(`${ctx.assetBase}/dark/${CARD_FILES.map}`),
      light: repoPath(`${ctx.assetBase}/light/${CARD_FILES.map}`),
      alt: mapAltText(m),
      width: 420,
    });
    return {
      cards: [],
      text: details(
        md`<b>🗺 World map</b>: ${regionDef(m.current).name} (${cleared}/3)`,
        join([centered(img), trusted(""), trusted(regionList(m))]),
      ),
    };
  },

  battles: ({ model: m }) => {
    if (m.battles.length === 0)
      return {
        cards: [],
        text: details(
          md`<b>📜 Battle history</b>: no battles yet`,
          md`Battles start with the first qualifying activity.`,
        ),
      };
    const result = { mvp: "★★ MVP", victory: "★ Victory", skirmish: "· Skirmish" } as const;
    const rows = m.battles.map((b) => {
      const bits = [
        b.commits ? `${b.commits} commit${b.commits === 1 ? "" : "s"}` : "",
        b.prs ? `${b.prs} PR${b.prs === 1 ? "" : "s"} merged` : "",
        b.reviews ? `${b.reviews} review${b.reviews === 1 ? "" : "s"}` : "",
        b.issues ? `${b.issues} issue${b.issues === 1 ? "" : "s"}` : "",
        b.releases ? `${b.releases} release${b.releases === 1 ? "" : "s"}` : "",
      ].filter(Boolean);
      return [
        md`${formatDay(b.day)}`,
        md`${result[b.result]} (${b.score})`,
        md`${bits.join(" · ") || "private activity"}`,
      ];
    });
    return {
      cards: [],
      text: details(
        md`<b>📜 Battle history</b>: last ${m.battles.length} battles`,
        table(["Date", "Result (score)", "Highlights"], rows),
      ),
    };
  },

  squad: ({ model: m }) => {
    const c = m.collaboration;
    return {
      cards: [],
      text: details(
        md`<b>🤝 Squad and collaboration</b>: ${c.collaborators} verified collaborators`,
        join([
          md`- Pull requests merged after another person's approval: **${c.reviewedMerges}**`,
          md`- Pull requests merged in repositories the player does not own: **${c.externalMerges}**`,
          md`- Peer reviews on other people's pull requests: **${c.peerReviews}**`,
          md`- Issues opened by others and resolved by the player: **${c.communityFixes}**`,
          trusted(""),
          md`Verified allies need the squad system, which is not available yet; no ally is shown.`,
        ]),
      ),
    };
  },

  identity: ({ model: m }) => {
    const profile = link(md`@${m.player.login}`, githubProfileUrl(m.player.login));
    const repos = m.repos.map((r) => link(md`${r.fullName}`, githubRepoUrl(r.fullName)));
    return {
      cards: [],
      text: join([
        md`🔗 **Player:** ${profile}${repos.length > 0 ? md` · **Most active public repositories** (verified commit EXP): ${join(repos, " · ")}` : trusted("")}`,
      ]),
    };
  },
};

export function renderSection(id: SectionId, ctx: SectionContext): SectionOutput {
  const out = SECTIONS[id](ctx);
  return { cards: out.cards, text: join([sectionMarker(id), out.text]) };
}

export function banner(m: ProfileModel): SafeMd {
  return join([
    m.sample
      ? md`> **Sample data.** This block was generated from fixtures. It is not a real player's progress.`
      : null,
    m.sample && m.stale ? trusted("") : null,
    m.stale
      ? md`> ⚠ Data may be stale (last complete refresh ${m.lastRefreshLabel}). The generator will retry.`
      : null,
  ]);
}

export function footer(m: ProfileModel): SafeMd {
  return md`${trusted("<sub>")}✔ Verified · Σ Derived · ✎ Self-declared · Levels, ranks and mastery reflect verified activity, not assessed skill · ${link(md`How GitHub Legends works`, repoPath(HOW_IT_WORKS))} · updated ${m.updatedLabel}${trusted("</sub>")}`;
}

export const CARD_ALTS = {
  player: playerCardDesc,
  season: seasonCardDesc,
  heroes: heroLineupDesc,
  medals: medalsDesc,
  emblems: emblemsDesc,
  build: buildDesc,
} as const;
