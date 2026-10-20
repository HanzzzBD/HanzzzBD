/**
 * Hero catalog v1 (GDD §C.2) and mastery rules (progression-tables §4).
 *
 * Every hero is an ORIGINAL character bound to one technology. No names, artwork or
 * descriptions come from Mobile Legends. Icons are configurable asset references plus
 * code-drawn ingredients (role glyph, monogram, accent colour); no image files ship here.
 * Accent colours follow GitHub Linguist's language colours (MIT-licensed data) and can be
 * overridden by the renderer.
 */
export type RoleId = "mage" | "fighter" | "marksman" | "assassin" | "tank" | "support";

export interface RoleDef {
  id: RoleId;
  name: string;
  /** Code-drawn glyph id (design/visual-direction §5). */
  glyph: "star" | "blades" | "arrow" | "diamond" | "hexagon" | "cross";
  domain: string;
}

export const ROLES: readonly RoleDef[] = [
  { id: "mage", name: "Mage", glyph: "star", domain: "Frontend and UI languages" },
  { id: "fighter", name: "Fighter", glyph: "blades", domain: "Backend and application languages" },
  { id: "marksman", name: "Marksman", glyph: "arrow", domain: "Data, AI and scientific languages" },
  {
    id: "assassin",
    name: "Assassin",
    glyph: "diamond",
    domain: "Systems and performance languages",
  },
  { id: "tank", name: "Tank", glyph: "hexagon", domain: "Infrastructure and operations" },
  { id: "support", name: "Support", glyph: "cross", domain: "Data stores, tooling and game tech" },
];

export interface HeroDef {
  /** Stable identifier (never reused or renamed). */
  id: string;
  name: string;
  epithet: string;
  role: RoleId;
  /** Primary technology label shown on the card. */
  technology: string;
  /** GitHub Linguist language names credited to this hero (aliases included). */
  languages: readonly string[];
  /** Original one-line description. Flavour only: it makes no claim about the player. */
  description: string;
  /** Linguist colour used as the medallion accent. */
  accent: string;
  /** Two-letter monogram drawn on the medallion. */
  monogram: string;
}

export const HEROES: readonly HeroDef[] = [
  {
    id: "syntaria",
    name: "Syntaria",
    epithet: "the Typed Arcanist",
    role: "mage",
    technology: "TypeScript",
    languages: ["TypeScript"],
    accent: "#3178C6",
    monogram: "Sy",
    description: "Weaves spells whose every rune is checked before it is cast.",
  },
  {
    id: "quillon",
    name: "Quillon",
    epithet: "the Script Weaver",
    role: "mage",
    technology: "JavaScript",
    languages: ["JavaScript"],
    accent: "#F1E05A",
    monogram: "Qu",
    description: "Writes living scripts that run wherever a browser can see them.",
  },
  {
    id: "tessera",
    name: "Tessera",
    epithet: "Keeper of Structure",
    role: "mage",
    technology: "HTML",
    languages: ["HTML"],
    accent: "#E34C26",
    monogram: "Te",
    description: "Lays the stone tiles every interface is built upon.",
  },
  {
    id: "lumen",
    name: "Lumen",
    epithet: "the Style Dancer",
    role: "mage",
    technology: "CSS",
    languages: ["CSS"],
    accent: "#663399",
    monogram: "Lu",
    description: "Bends light and space until a page finally feels right.",
  },
  {
    id: "verdance",
    name: "Verdance",
    epithet: "the Reactive Druid",
    role: "mage",
    technology: "Vue",
    languages: ["Vue"],
    accent: "#41B883",
    monogram: "Ve",
    description: "Grows interfaces that respond the moment the forest stirs.",
  },
  {
    id: "edgewright",
    name: "Edgewright",
    epithet: "the Template Smith",
    role: "mage",
    technology: "Blade",
    languages: ["Blade"],
    accent: "#F7523F",
    monogram: "Ed",
    description: "Forges views from server-side moulds, edge by careful edge.",
  },
  {
    id: "orrin",
    name: "Orrin",
    epithet: "the Elephant Vanguard",
    role: "fighter",
    technology: "PHP",
    languages: ["PHP"],
    accent: "#4F5D95",
    monogram: "Or",
    description: "A patient veteran who has held the server gates for decades.",
  },
  {
    id: "cerys",
    name: "Cerys",
    epithet: "the Sharp Blade",
    role: "fighter",
    technology: "C#",
    languages: ["C#"],
    accent: "#178600",
    monogram: "Ce",
    description: "A disciplined duelist equally at home in fortresses and arenas.",
  },
  {
    id: "brannoc",
    name: "Brannoc",
    epithet: "the Brewmaster Knight",
    role: "fighter",
    technology: "Java",
    languages: ["Java"],
    accent: "#B07219",
    monogram: "Br",
    description: "Brews sturdy services that keep running long after the feast.",
  },
  {
    id: "kestrel",
    name: "Kestrel",
    epithet: "the Swift Runner",
    role: "fighter",
    technology: "Go",
    languages: ["Go"],
    accent: "#00ADD8",
    monogram: "Ke",
    description: "Carries many messages at once and never drops a single one.",
  },
  {
    id: "kotra",
    name: "Kotra",
    epithet: "the Island Duelist",
    role: "fighter",
    technology: "Kotlin",
    languages: ["Kotlin"],
    accent: "#A97BFF",
    monogram: "Ko",
    description: "Fights with concise strikes and a shield against null curses.",
  },
  {
    id: "pytha",
    name: "Pytha",
    epithet: "the Serpent Archer",
    role: "marksman",
    technology: "Python",
    languages: ["Python"],
    accent: "#3572A5",
    monogram: "Py",
    description: "Looses readable arrows that find patterns hidden in the data.",
  },
  {
    id: "orrery",
    name: "Orrery",
    epithet: "the Notebook Seer",
    role: "marksman",
    technology: "Jupyter Notebook",
    languages: ["Jupyter Notebook"],
    accent: "#DA5B0B",
    monogram: "Oy",
    description: "Reads the heavens one experiment cell at a time.",
  },
  {
    id: "rowan",
    name: "Rowan",
    epithet: "the Statistic Ranger",
    role: "marksman",
    technology: "R",
    languages: ["R"],
    accent: "#198CE7",
    monogram: "Ro",
    description: "Tracks distributions across the wilds and charts every trail.",
  },
  {
    id: "ferrin",
    name: "Ferrin",
    epithet: "the Oxide Shade",
    role: "assassin",
    technology: "Rust",
    languages: ["Rust"],
    accent: "#DEA584",
    monogram: "Fe",
    description: "Moves fearlessly through memory without leaving a dangling trace.",
  },
  {
    id: "corvin",
    name: "Corvin",
    epithet: "the Bare-Metal Blade",
    role: "assassin",
    technology: "C",
    languages: ["C"],
    accent: "#555555",
    monogram: "Co",
    description: "Speaks directly to the machine and answers to no runtime.",
  },
  {
    id: "plexa",
    name: "Plexa",
    epithet: "the Template Phantom",
    role: "assassin",
    technology: "C++",
    languages: ["C++"],
    accent: "#F34B7D",
    monogram: "Pl",
    description: "Strikes at compile time, before the enemy even exists.",
  },
  {
    id: "basalt",
    name: "Basalt",
    epithet: "the Shell Bulwark",
    role: "tank",
    technology: "Shell",
    languages: ["Shell"],
    accent: "#89E051",
    monogram: "Ba",
    description: "Stands at every server's edge, piping trouble where it belongs.",
  },
  {
    id: "hullmar",
    name: "Hullmar",
    epithet: "the Container Colossus",
    role: "tank",
    technology: "Dockerfile",
    languages: ["Dockerfile"],
    accent: "#384D54",
    monogram: "Hu",
    description: "Carries entire worlds sealed safely inside iron hulls.",
  },
  {
    id: "terrane",
    name: "Terrane",
    epithet: "the Terraformer",
    role: "tank",
    technology: "HCL",
    languages: ["HCL"],
    accent: "#844FBA",
    monogram: "Tr",
    description: "Raises infrastructure from bare ground with declared intent.",
  },
  {
    id: "ledgera",
    name: "Ledgera",
    epithet: "the Query Oracle",
    role: "support",
    technology: "SQL",
    languages: ["SQL", "PLpgSQL", "TSQL", "PLSQL"],
    accent: "#E38C00",
    monogram: "Le",
    description: "Answers any question the archive can hold, joined and indexed.",
  },
  {
    id: "prismara",
    name: "Prismara",
    epithet: "the Shader Muse",
    role: "support",
    technology: "ShaderLab / HLSL",
    languages: ["ShaderLab", "HLSL"],
    accent: "#AACE60",
    monogram: "Pr",
    description: "Paints light itself across every frame of a world.",
  },
  {
    id: "gloam",
    name: "Gloam",
    epithet: "the Scene Bard",
    role: "support",
    technology: "GDScript",
    languages: ["GDScript"],
    accent: "#355570",
    monogram: "Gl",
    description: "Sings nodes into scenes and scenes into adventures.",
  },
  {
    id: "moonquill",
    name: "Moonquill",
    epithet: "the Moon Scribe",
    role: "support",
    technology: "Lua",
    languages: ["Lua"],
    accent: "#000080",
    monogram: "Mq",
    description: "Writes small, nimble verses that other worlds embed.",
  },
];

export type MasteryTierId = "novice" | "adept" | "veteran" | "expert" | "virtuoso" | "exalted";

export interface MasteryTierDef {
  id: MasteryTierId;
  name: string;
  /** Mastery points needed (cumulative). */
  mp: number;
  /** BP on first reaching the tier (Novice: the hero-unlock BP). */
  bp: number;
  /** Cosmetic unlocked (progression-tables §4). */
  cosmetic: string;
}

export const MASTERY_TIERS: readonly MasteryTierDef[] = [
  { id: "novice", name: "Novice", mp: 100, bp: 50, cosmetic: "Hero card" },
  { id: "adept", name: "Adept", mp: 1_000, bp: 30, cosmetic: "Bronze-tone frame" },
  { id: "veteran", name: "Veteran", mp: 3_000, bp: 60, cosmetic: "Silver-tone frame" },
  { id: "expert", name: "Expert", mp: 8_000, bp: 120, cosmetic: "Gilded skin variant" },
  { id: "virtuoso", name: "Virtuoso", mp: 20_000, bp: 250, cosmetic: "Prismatic frame" },
  {
    id: "exalted",
    name: "Exalted",
    mp: 50_000,
    bp: 500,
    cosmetic: 'Animated frame and title "<Hero>\'s Chosen"',
  },
];

/** Unlock rule (GDD §C.3): weighted usage ≥ 100 AND ≥ 10% share in an eligible repo with ≥ 5 qualifying commits. */
export const HERO_UNLOCK = {
  minWeightedUsage: 100,
  minSharePercent: 10,
  minRepoCommits: 5,
} as const;

/** Caption required on every mastery display (GDD §C.4). */
export const MASTERY_CAPTION = "Mastery reflects verified activity volume, not assessed skill.";

const byLanguage = new Map<string, HeroDef>();
for (const hero of HEROES)
  for (const language of hero.languages) byLanguage.set(language.toLowerCase(), hero);

/** Hero bound to a Linguist language name, or undefined for an unknown technology. */
export function heroForLanguage(language: string): HeroDef | undefined {
  return byLanguage.get(language.toLowerCase());
}

/** Stable id for a technology with no catalog hero ("Unknown Spirit"). */
export function unknownSpiritId(language: string): string {
  const slug = language
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\+/g, "plus")
    .replace(/#/g, "sharp")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `unknown:${slug || "language"}`;
}

export function masteryTierFor(mp: number): MasteryTierDef | null {
  let tier: MasteryTierDef | null = null;
  for (const t of MASTERY_TIERS) if (mp >= t.mp) tier = t;
  return tier;
}

export function nextMasteryTier(mp: number): MasteryTierDef | null {
  return MASTERY_TIERS.find((t) => mp < t.mp) ?? null;
}
