import type { AnyEvent } from "../../normalize/event.ts";
import type { LedgerIndex } from "../ledger.ts";
import type { Diagnostics, EngineConfig } from "../qualify.ts";
import { attribute } from "./attribution.ts";
import { type EmblemResult, evaluateEmblems } from "./emblems.ts";
import { type EquipmentResult, evaluateEquipment } from "./equipment.ts";
import { evaluateHeroes, type HeroState } from "./mastery.ts";

export interface SpecializationResult {
  heroes: HeroState[];
  emblems: EmblemResult;
  equipment: EquipmentResult;
}

/** Heroes, mastery, emblems and equipment from the ledger and stored events (pure). */
export function evaluateSpecialization(
  ledger: LedgerIndex,
  events: ReadonlyMap<string, AnyEvent>,
  config: EngineConfig,
  rulesVersion: string,
  runAt: string,
  diagnostics: Diagnostics,
): SpecializationResult {
  const attribution = attribute(ledger.entries, events, config, diagnostics);
  const heroes = evaluateHeroes(
    attribution,
    ledger,
    config.heroes,
    rulesVersion,
    runAt,
    config.timezone,
    diagnostics,
  );
  const emblems = evaluateEmblems(
    attribution,
    events,
    ledger,
    config,
    config.emblem,
    rulesVersion,
    runAt,
    diagnostics,
  );
  const equipment = evaluateEquipment(
    attribution,
    events,
    ledger,
    config,
    { build: config.build ?? [], declaredTools: config.declaredTools ?? [] },
    rulesVersion,
    runAt,
    diagnostics,
  );
  return { heroes, emblems, equipment };
}

export * from "./catalog.ts";
export {
  DOMAIN_WEIGHTS,
  EMBLEM_LEVELS,
  EMBLEMS,
  type EmblemId,
  type EmblemState,
  emblemLevelFor,
} from "./emblems.ts";
export { ITEM_TIERS, ITEMS, type ItemState } from "./equipment.ts";
export type { HeroState } from "./mastery.ts";
export * from "./presentation.ts";
