/**
 * Monster Bestiary — 12 base monsters, each with 3–5 evolution forms.
 *
 * Design draws from classic RPG traditions:
 *   Slimes / oozes (Dragon Quest), elemental sprites (Final Fantasy),
 *   insects & beasts (Shin Megami Tensei), fungi & plants (Monster Rancher),
 *   undead & constructs (D&D), dragons & wyverns (Pokemon/DQ).
 *
 * Soil-based spawning:
 *   nutrient ≥ 0.6          → "green" soil  (organic / mossy)
 *   mana ≥ 2.0              → "crystal" soil (mana-saturated)
 *   nutrient < 0.6 & mana < 2 → "brown" soil (dry / mineral)
 *   special combos create rare spawns
 *
 * Evolution criteria categories:
 *   level    — reach a target level (gained via exp from combat / eating)
 *   eat      — consume N of a specific resource type
 *   prey     — successfully hunt/kill N of a specific monster species
 *   walk     — accumulate N tiles of walking distance
 *   combat   — win N fights (any opponent)
 *   special  — unique condition (e.g. survive at low HP, coexist with ally type)
 */

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type SoilType = "green" | "crystal" | "brown";

/** How a monster can spawn from digging */
export interface SpawnCondition {
  /** Primary soil type required on the dug tile */
  soilType: SoilType;
  /** Minimum nutrient value on the dug tile (0–1) */
  minNutrient?: number;
  /** Minimum mana value on the dug tile (0–5) */
  minMana?: number;
  /** Neighboring resource types that boost spawn chance */
  boostResources: string[];
  /** Base weight — higher = more common within its soil tier */
  weight: number;
}

/** A single criterion that must be met for evolution */
export interface EvolutionCriterion {
  type: "level" | "eat" | "prey" | "walk" | "combat" | "special";
  /** For level: target level. For eat/prey/combat/walk: count needed */
  target: number;
  /** For eat: resource type. For prey: monster species id */
  subtype?: string;
  /** Human-readable description */
  description: string;
}

/** An evolution path from a base or intermediate form */
export interface Evolution {
  /** Target form id */
  to: string;
  /** All criteria must be met (AND) */
  criteria: EvolutionCriterion[];
}

/** Stat growth rates per level (additive per level) */
export interface StatGrowth {
  hp: number;
  mp: number;
  atk: number;
  def: number;
  spd: number;
}

/** Base stats at level 1 */
export interface BaseStats {
  hp: number;
  mp: number;
  atk: number;
  def: number;
  spd: number;
}

/** Behavior weights that determine how a monster acts during ticks */
export interface BehaviorProfile {
  /** 0–1: tendency to wander vs stay in place */
  wanderlust: number;
  /** 0–1: tendency to seek food when not hungry */
  foraging: number;
  /** 0–1: tendency to initiate fights with nearby monsters */
  aggression: number;
  /** 0–1: tendency to flee from stronger monsters */
  cowardice: number;
  /** Preferred food resource types (sorted by preference) */
  preferredFood: string[];
  /** Monster species this monster will try to hunt (prey ids) */
  preySpecies: string[];
  /** Monster species this monster fears and flees from */
  predators: string[];
}

/** Full definition of a single monster form (base or evolved) */
export interface MonsterDef {
  id: string;
  name: string;
  /** Display name with title */
  title?: string;
  /** Evolution stage: 1 = base, 2 = intermediate, 3+ = final */
  stage: number;
  /** Base stats at this form's starting level */
  baseStats: BaseStats;
  /** Stat growth per level */
  growth: StatGrowth;
  /** Behavior profile */
  behavior: BehaviorProfile;
  /** Available evolution paths from this form */
  evolutions: Evolution[];
  /** Render color for canvas (primary body color) */
  color: string;
  /** Secondary/accent color */
  accentColor: string;
  /** Short lore text */
  lore: string;
}

/** A complete monster family (base + all evolutions) */
export interface MonsterFamily {
  baseId: string;
  familyName: string;
  spawnCondition: SpawnCondition;
  forms: MonsterDef[];
}

// ═══════════════════════════════════════════════════════════════════
// COMBAT CONSTANTS
// ═══════════════════════════════════════════════════════════════════

/** EXP gained = baseExp * levelGapMultiplier(attackerLv, defenderLv) */
export const BASE_EXP_PER_KILL = 20;
export const EXP_PER_LEVEL = 100; // exp needed for each level = level * EXP_PER_LEVEL
export const MAX_LEVEL = 50;

/**
 * Level gap multiplier for exp gain.
 * Killing higher-level monsters gives bonus;
 * killing much-lower-level monsters gives almost nothing.
 */
export function levelGapMultiplier(attackerLevel: number, defenderLevel: number): number {
  const gap = defenderLevel - attackerLevel;
  if (gap >= 10) return 3.0;    // huge underdog bonus
  if (gap >= 5) return 2.0;
  if (gap >= 2) return 1.5;
  if (gap >= 0) return 1.0;     // same level or slightly higher
  if (gap >= -2) return 0.7;
  if (gap >= -5) return 0.3;
  if (gap >= -10) return 0.1;
  return 0.02; // trivial kill
}

/**
 * Simple combat damage formula.
 * damage = max(1, atk * (atk / (atk + def)) * variance)
 */
export function calcDamage(attackerAtk: number, defenderDef: number): number {
  const ratio = attackerAtk / (attackerAtk + defenderDef);
  const base = attackerAtk * ratio;
  const variance = 0.85 + Math.random() * 0.3; // ±15%
  return Math.max(1, Math.floor(base * variance));
}

/**
 * Who goes first in a fight round — higher spd wins, ties broken randomly.
 */
export function speedCheck(spdA: number, spdB: number): "a" | "b" {
  if (spdA > spdB) return "a";
  if (spdB > spdA) return "b";
  return Math.random() < 0.5 ? "a" : "b";
}

// ═══════════════════════════════════════════════════════════════════
// THE BESTIARY — 12 base families, 120+ total forms
// ═══════════════════════════════════════════════════════════════════

export const MONSTER_FAMILIES: MonsterFamily[] = [
  // ─────────────────────────────────────────────────────────────────
  // 1. GLOB SLIME — green soil, very common, the starter monster
  // Inspired by: Dragon Quest Slime
  // ─────────────────────────────────────────────────────────────────
  {
    baseId: "glob_slime",
    familyName: "Slime",
    spawnCondition: {
      soilType: "green",
      minNutrient: 0.5,
      boostResources: ["mushroom", "moss"],
      weight: 10,
    },
    forms: [
      {
        id: "glob_slime",
        name: "Glob Slime",
        stage: 1,
        baseStats: { hp: 45, mp: 10, atk: 8, def: 8, spd: 10 },
        growth: { hp: 8, mp: 2, atk: 2, def: 2, spd: 2 },
        behavior: {
          wanderlust: 0.7, foraging: 0.8, aggression: 0.1, cowardice: 0.6,
          preferredFood: ["moss", "mushroom"],
          preySpecies: [],
          predators: ["fang_beetle", "cave_serpent"],
        },
        evolutions: [
          {
            to: "moss_slime",
            criteria: [
              { type: "level", target: 5, description: "Reach level 5" },
              { type: "eat", target: 10, subtype: "moss", description: "Eat 10 moss" },
            ],
          },
          {
            to: "toxic_slime",
            criteria: [
              { type: "level", target: 5, description: "Reach level 5" },
              { type: "eat", target: 8, subtype: "mushroom", description: "Eat 8 mushrooms" },
            ],
          },
          {
            to: "iron_slime",
            criteria: [
              { type: "level", target: 7, description: "Reach level 7" },
              { type: "eat", target: 5, subtype: "bone", description: "Eat 5 bones" },
              { type: "combat", target: 5, description: "Win 5 fights" },
            ],
          },
        ],
        color: "#7cb342",
        accentColor: "#558b2f",
        lore: "A wobbly glob of green ooze. Harmless and curious, it eats everything on the cave floor.",
      },
      {
        id: "moss_slime",
        name: "Moss Slime",
        stage: 2,
        baseStats: { hp: 70, mp: 25, atk: 10, def: 14, spd: 8 },
        growth: { hp: 10, mp: 4, atk: 2, def: 3, spd: 1 },
        behavior: {
          wanderlust: 0.5, foraging: 0.9, aggression: 0.05, cowardice: 0.7,
          preferredFood: ["moss", "mushroom"],
          preySpecies: [],
          predators: ["fang_beetle"],
        },
        evolutions: [
          {
            to: "elder_moss",
            criteria: [
              { type: "level", target: 15, description: "Reach level 15" },
              { type: "walk", target: 200, description: "Walk 200 tiles" },
            ],
          },
          {
            to: "garden_king",
            criteria: [
              { type: "level", target: 20, description: "Reach level 20" },
              { type: "eat", target: 30, subtype: "moss", description: "Eat 30 moss total" },
              { type: "special", target: 1, subtype: "coexist_3_slimes", description: "Have 3+ slimes in same chunk" },
            ],
          },
        ],
        color: "#558b2f",
        accentColor: "#33691e",
        lore: "Covered in a thick layer of living moss, it barely moves but regenerates rapidly.",
      },
      {
        id: "toxic_slime",
        name: "Toxic Slime",
        stage: 2,
        baseStats: { hp: 55, mp: 35, atk: 16, def: 10, spd: 12 },
        growth: { hp: 7, mp: 5, atk: 4, def: 2, spd: 2 },
        behavior: {
          wanderlust: 0.8, foraging: 0.6, aggression: 0.4, cowardice: 0.3,
          preferredFood: ["mushroom", "moss"],
          preySpecies: ["dust_mite", "cave_beetle"],
          predators: ["cave_serpent"],
        },
        evolutions: [
          {
            to: "plague_ooze",
            criteria: [
              { type: "level", target: 18, description: "Reach level 18" },
              { type: "prey", target: 10, subtype: "dust_mite", description: "Hunt 10 dust mites" },
            ],
          },
          {
            to: "acid_king",
            criteria: [
              { type: "level", target: 22, description: "Reach level 22" },
              { type: "combat", target: 30, description: "Win 30 fights" },
              { type: "eat", target: 15, subtype: "mushroom", description: "Eat 15 mushrooms" },
            ],
          },
        ],
        color: "#9c27b0",
        accentColor: "#6a1b9a",
        lore: "Mushroom toxins have turned this slime into a venomous predator.",
      },
      {
        id: "iron_slime",
        name: "Iron Slime",
        stage: 2,
        baseStats: { hp: 80, mp: 10, atk: 14, def: 22, spd: 5 },
        growth: { hp: 12, mp: 1, atk: 3, def: 5, spd: 1 },
        behavior: {
          wanderlust: 0.3, foraging: 0.5, aggression: 0.2, cowardice: 0.1,
          preferredFood: ["bone", "crystal_shard"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [
          {
            to: "adamant_slime",
            criteria: [
              { type: "level", target: 20, description: "Reach level 20" },
              { type: "eat", target: 20, subtype: "bone", description: "Eat 20 bones" },
              { type: "combat", target: 15, description: "Win 15 fights" },
            ],
          },
        ],
        color: "#78909c",
        accentColor: "#546e7a",
        lore: "Mineral deposits have hardened its body to near-metal density. Extremely tough.",
      },
      {
        id: "elder_moss",
        name: "Elder Moss",
        stage: 3,
        baseStats: { hp: 120, mp: 50, atk: 14, def: 28, spd: 4 },
        growth: { hp: 14, mp: 6, atk: 2, def: 5, spd: 1 },
        behavior: {
          wanderlust: 0.2, foraging: 0.9, aggression: 0.0, cowardice: 0.8,
          preferredFood: ["moss", "mushroom"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [],
        color: "#2e7d32",
        accentColor: "#1b5e20",
        lore: "An ancient mound of living moss. Other creatures nest in its body undisturbed.",
      },
      {
        id: "garden_king",
        name: "Garden King",
        stage: 3,
        baseStats: { hp: 140, mp: 60, atk: 18, def: 30, spd: 6 },
        growth: { hp: 15, mp: 7, atk: 3, def: 5, spd: 1 },
        behavior: {
          wanderlust: 0.1, foraging: 0.95, aggression: 0.0, cowardice: 0.3,
          preferredFood: ["moss", "mushroom", "mana_orb"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [],
        color: "#1b5e20",
        accentColor: "#ffeb3b",
        lore: "The undisputed monarch of the moss. A crown of golden fungus adorns its peak.",
      },
      {
        id: "plague_ooze",
        name: "Plague Ooze",
        stage: 3,
        baseStats: { hp: 90, mp: 60, atk: 28, def: 14, spd: 14 },
        growth: { hp: 9, mp: 7, atk: 5, def: 2, spd: 3 },
        behavior: {
          wanderlust: 0.9, foraging: 0.5, aggression: 0.7, cowardice: 0.1,
          preferredFood: ["mushroom"],
          preySpecies: ["dust_mite", "cave_beetle", "glob_slime"],
          predators: [],
        },
        evolutions: [],
        color: "#7b1fa2",
        accentColor: "#4a148c",
        lore: "A crawling biohazard. Its touch dissolves organic matter in seconds.",
      },
      {
        id: "acid_king",
        name: "Acid King",
        stage: 3,
        baseStats: { hp: 100, mp: 70, atk: 35, def: 16, spd: 12 },
        growth: { hp: 10, mp: 8, atk: 6, def: 3, spd: 2 },
        behavior: {
          wanderlust: 0.7, foraging: 0.4, aggression: 0.8, cowardice: 0.05,
          preferredFood: ["mushroom", "mana_orb"],
          preySpecies: ["dust_mite", "cave_beetle", "glob_slime", "moss_slime"],
          predators: [],
        },
        evolutions: [],
        color: "#e91e63",
        accentColor: "#880e4f",
        lore: "Apex predator among oozes. Its caustic body melts stone itself.",
      },
      {
        id: "adamant_slime",
        name: "Adamant Slime",
        stage: 3,
        baseStats: { hp: 150, mp: 15, atk: 20, def: 40, spd: 3 },
        growth: { hp: 16, mp: 2, atk: 3, def: 7, spd: 0 },
        behavior: {
          wanderlust: 0.1, foraging: 0.3, aggression: 0.1, cowardice: 0.0,
          preferredFood: ["bone", "crystal_shard"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [],
        color: "#455a64",
        accentColor: "#263238",
        lore: "Nearly indestructible. Scholars debate whether it's alive or a mineral formation.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  // 2. DUST MITE — brown soil, very common, tiny vermin
  // Inspired by: FF Flan / DQ Bug family
  // ─────────────────────────────────────────────────────────────────
  {
    baseId: "dust_mite",
    familyName: "Mite",
    spawnCondition: {
      soilType: "brown",
      boostResources: ["bone", "moss"],
      weight: 10,
    },
    forms: [
      {
        id: "dust_mite",
        name: "Dust Mite",
        stage: 1,
        baseStats: { hp: 25, mp: 5, atk: 6, def: 4, spd: 16 },
        growth: { hp: 4, mp: 1, atk: 2, def: 1, spd: 3 },
        behavior: {
          wanderlust: 0.9, foraging: 0.7, aggression: 0.15, cowardice: 0.8,
          preferredFood: ["moss", "bone"],
          preySpecies: [],
          predators: ["glob_slime", "toxic_slime", "fang_beetle", "cave_serpent"],
        },
        evolutions: [
          {
            to: "sand_flea",
            criteria: [
              { type: "level", target: 5, description: "Reach level 5" },
              { type: "walk", target: 100, description: "Walk 100 tiles" },
            ],
          },
          {
            to: "dust_devil",
            criteria: [
              { type: "level", target: 6, description: "Reach level 6" },
              { type: "combat", target: 8, description: "Win 8 fights" },
            ],
          },
          {
            to: "hive_mite",
            criteria: [
              { type: "level", target: 5, description: "Reach level 5" },
              { type: "special", target: 1, subtype: "coexist_3_mites", description: "Have 3+ mites in same chunk" },
            ],
          },
        ],
        color: "#a1887f",
        accentColor: "#8d6e63",
        lore: "Barely visible, these tiny creatures swarm through dry cave dust by the hundreds.",
      },
      {
        id: "sand_flea",
        name: "Sand Flea",
        stage: 2,
        baseStats: { hp: 35, mp: 10, atk: 12, def: 6, spd: 22 },
        growth: { hp: 5, mp: 2, atk: 3, def: 1, spd: 4 },
        behavior: {
          wanderlust: 0.95, foraging: 0.6, aggression: 0.3, cowardice: 0.5,
          preferredFood: ["moss", "mushroom"],
          preySpecies: ["dust_mite"],
          predators: ["cave_serpent"],
        },
        evolutions: [
          {
            to: "dune_hopper",
            criteria: [
              { type: "level", target: 16, description: "Reach level 16" },
              { type: "walk", target: 500, description: "Walk 500 tiles" },
            ],
          },
        ],
        color: "#d7ccc8",
        accentColor: "#bcaaa4",
        lore: "Evolved powerful hind legs for leaping great distances through tunnels.",
      },
      {
        id: "dust_devil",
        name: "Dust Devil",
        stage: 2,
        baseStats: { hp: 40, mp: 20, atk: 18, def: 8, spd: 20 },
        growth: { hp: 6, mp: 3, atk: 4, def: 2, spd: 3 },
        behavior: {
          wanderlust: 0.8, foraging: 0.5, aggression: 0.6, cowardice: 0.2,
          preferredFood: ["bone", "moss"],
          preySpecies: ["dust_mite", "glob_slime"],
          predators: ["cave_serpent"],
        },
        evolutions: [
          {
            to: "sandstorm_fiend",
            criteria: [
              { type: "level", target: 18, description: "Reach level 18" },
              { type: "prey", target: 15, subtype: "dust_mite", description: "Hunt 15 dust mites" },
              { type: "combat", target: 20, description: "Win 20 fights" },
            ],
          },
        ],
        color: "#795548",
        accentColor: "#4e342e",
        lore: "A whirling mass of dust and spite. Spins rapidly to batter its foes.",
      },
      {
        id: "hive_mite",
        name: "Hive Mite",
        stage: 2,
        baseStats: { hp: 40, mp: 15, atk: 10, def: 10, spd: 18 },
        growth: { hp: 6, mp: 2, atk: 2, def: 2, spd: 3 },
        behavior: {
          wanderlust: 0.6, foraging: 0.8, aggression: 0.2, cowardice: 0.4,
          preferredFood: ["moss", "bone"],
          preySpecies: [],
          predators: ["fang_beetle"],
        },
        evolutions: [
          {
            to: "swarm_queen",
            criteria: [
              { type: "level", target: 20, description: "Reach level 20" },
              { type: "special", target: 1, subtype: "coexist_5_mites", description: "Have 5+ mites in same chunk" },
            ],
          },
        ],
        color: "#bcaaa4",
        accentColor: "#ffab91",
        lore: "A larger mite variant that organizes its kin into coordinated colonies.",
      },
      {
        id: "dune_hopper",
        name: "Dune Hopper",
        stage: 3,
        baseStats: { hp: 60, mp: 20, atk: 22, def: 10, spd: 35 },
        growth: { hp: 7, mp: 3, atk: 4, def: 2, spd: 5 },
        behavior: {
          wanderlust: 1.0, foraging: 0.5, aggression: 0.4, cowardice: 0.3,
          preferredFood: ["moss", "mushroom"],
          preySpecies: ["dust_mite", "glob_slime"],
          predators: [],
        },
        evolutions: [],
        color: "#efebe9",
        accentColor: "#d7ccc8",
        lore: "Fastest creature in the dungeon. Its leaps span entire corridors.",
      },
      {
        id: "sandstorm_fiend",
        name: "Sandstorm Fiend",
        stage: 3,
        baseStats: { hp: 75, mp: 35, atk: 30, def: 14, spd: 28 },
        growth: { hp: 8, mp: 5, atk: 5, def: 3, spd: 4 },
        behavior: {
          wanderlust: 0.9, foraging: 0.3, aggression: 0.8, cowardice: 0.05,
          preferredFood: ["bone"],
          preySpecies: ["dust_mite", "glob_slime", "cave_beetle"],
          predators: [],
        },
        evolutions: [],
        color: "#5d4037",
        accentColor: "#3e2723",
        lore: "A living dust storm. Corridors tremble when it passes through.",
      },
      {
        id: "swarm_queen",
        name: "Swarm Queen",
        stage: 3,
        baseStats: { hp: 80, mp: 40, atk: 16, def: 16, spd: 24 },
        growth: { hp: 10, mp: 5, atk: 3, def: 3, spd: 3 },
        behavior: {
          wanderlust: 0.4, foraging: 0.7, aggression: 0.3, cowardice: 0.2,
          preferredFood: ["moss", "bone", "mushroom"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [],
        color: "#ff8a65",
        accentColor: "#e64a19",
        lore: "Matriarch of the mite colony. Her pheromones command legions of tiny workers.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  // 3. CAVE BEETLE — brown soil, armored insect
  // Inspired by: Heracross / DQ armor beetle
  // ─────────────────────────────────────────────────────────────────
  {
    baseId: "cave_beetle",
    familyName: "Beetle",
    spawnCondition: {
      soilType: "brown",
      boostResources: ["bone", "crystal_shard"],
      weight: 7,
    },
    forms: [
      {
        id: "cave_beetle",
        name: "Cave Beetle",
        stage: 1,
        baseStats: { hp: 40, mp: 5, atk: 12, def: 14, spd: 8 },
        growth: { hp: 7, mp: 1, atk: 3, def: 3, spd: 1 },
        behavior: {
          wanderlust: 0.5, foraging: 0.6, aggression: 0.3, cowardice: 0.3,
          preferredFood: ["bone", "moss"],
          preySpecies: ["dust_mite"],
          predators: ["cave_serpent", "stone_golem"],
        },
        evolutions: [
          {
            to: "horn_beetle",
            criteria: [
              { type: "level", target: 6, description: "Reach level 6" },
              { type: "combat", target: 8, description: "Win 8 fights" },
            ],
          },
          {
            to: "jewel_beetle",
            criteria: [
              { type: "level", target: 7, description: "Reach level 7" },
              { type: "eat", target: 8, subtype: "crystal_shard", description: "Eat 8 crystal shards" },
            ],
          },
          {
            to: "dung_beetle",
            criteria: [
              { type: "level", target: 5, description: "Reach level 5" },
              { type: "eat", target: 12, subtype: "moss", description: "Eat 12 moss" },
              { type: "walk", target: 80, description: "Walk 80 tiles" },
            ],
          },
        ],
        color: "#6d4c41",
        accentColor: "#4e342e",
        lore: "A hardy beetle with a thick carapace. Clicks its mandibles when threatened.",
      },
      {
        id: "horn_beetle",
        name: "Horn Beetle",
        stage: 2,
        baseStats: { hp: 65, mp: 8, atk: 22, def: 20, spd: 10 },
        growth: { hp: 9, mp: 1, atk: 5, def: 4, spd: 1 },
        behavior: {
          wanderlust: 0.4, foraging: 0.5, aggression: 0.6, cowardice: 0.1,
          preferredFood: ["bone", "mushroom"],
          preySpecies: ["dust_mite", "cave_beetle"],
          predators: ["cave_serpent"],
        },
        evolutions: [
          {
            to: "titan_beetle",
            criteria: [
              { type: "level", target: 20, description: "Reach level 20" },
              { type: "combat", target: 25, description: "Win 25 fights" },
              { type: "prey", target: 8, subtype: "cave_beetle", description: "Hunt 8 beetles" },
            ],
          },
        ],
        color: "#4e342e",
        accentColor: "#bf360c",
        lore: "A massive horn protrudes from its head. Charges foes with devastating force.",
      },
      {
        id: "jewel_beetle",
        name: "Jewel Beetle",
        stage: 2,
        baseStats: { hp: 50, mp: 30, atk: 16, def: 18, spd: 14 },
        growth: { hp: 7, mp: 4, atk: 3, def: 3, spd: 2 },
        behavior: {
          wanderlust: 0.6, foraging: 0.7, aggression: 0.2, cowardice: 0.4,
          preferredFood: ["crystal_shard", "mana_orb"],
          preySpecies: [],
          predators: ["cave_serpent"],
        },
        evolutions: [
          {
            to: "prismatic_scarab",
            criteria: [
              { type: "level", target: 18, description: "Reach level 18" },
              { type: "eat", target: 20, subtype: "crystal_shard", description: "Eat 20 crystal shards" },
              { type: "eat", target: 10, subtype: "mana_orb", description: "Eat 10 mana orbs" },
            ],
          },
        ],
        color: "#00bcd4",
        accentColor: "#006064",
        lore: "Crystal shards have embedded in its shell, giving it a dazzling iridescence.",
      },
      {
        id: "dung_beetle",
        name: "Dung Beetle",
        stage: 2,
        baseStats: { hp: 55, mp: 10, atk: 14, def: 16, spd: 12 },
        growth: { hp: 8, mp: 2, atk: 3, def: 3, spd: 2 },
        behavior: {
          wanderlust: 0.7, foraging: 0.9, aggression: 0.1, cowardice: 0.4,
          preferredFood: ["moss", "mushroom", "bone"],
          preySpecies: [],
          predators: ["fang_beetle"],
        },
        evolutions: [
          {
            to: "compost_titan",
            criteria: [
              { type: "level", target: 18, description: "Reach level 18" },
              { type: "eat", target: 40, subtype: "moss", description: "Eat 40 moss total" },
              { type: "walk", target: 300, description: "Walk 300 tiles" },
            ],
          },
        ],
        color: "#8d6e63",
        accentColor: "#5d4037",
        lore: "Rolls organic matter into balls and buries them. Surprisingly important to the ecosystem.",
      },
      {
        id: "titan_beetle",
        name: "Titan Beetle",
        stage: 3,
        baseStats: { hp: 120, mp: 10, atk: 38, def: 35, spd: 8 },
        growth: { hp: 14, mp: 1, atk: 6, def: 6, spd: 1 },
        behavior: {
          wanderlust: 0.3, foraging: 0.4, aggression: 0.7, cowardice: 0.0,
          preferredFood: ["bone"],
          preySpecies: ["cave_beetle", "glob_slime", "dust_mite"],
          predators: [],
        },
        evolutions: [],
        color: "#3e2723",
        accentColor: "#d50000",
        lore: "The size of a small cart. Its horn can crack solid stone.",
      },
      {
        id: "prismatic_scarab",
        name: "Prismatic Scarab",
        stage: 3,
        baseStats: { hp: 85, mp: 55, atk: 28, def: 28, spd: 18 },
        growth: { hp: 9, mp: 6, atk: 4, def: 4, spd: 3 },
        behavior: {
          wanderlust: 0.5, foraging: 0.6, aggression: 0.3, cowardice: 0.2,
          preferredFood: ["crystal_shard", "mana_orb"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [],
        color: "#e040fb",
        accentColor: "#00e5ff",
        lore: "Its shell refracts light into rainbows. Ancient cultures worshipped them as sacred.",
      },
      {
        id: "compost_titan",
        name: "Compost Titan",
        stage: 3,
        baseStats: { hp: 100, mp: 20, atk: 22, def: 26, spd: 14 },
        growth: { hp: 12, mp: 3, atk: 4, def: 5, spd: 2 },
        behavior: {
          wanderlust: 0.6, foraging: 0.95, aggression: 0.05, cowardice: 0.3,
          preferredFood: ["moss", "mushroom", "bone"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [],
        color: "#795548",
        accentColor: "#4caf50",
        lore: "Where it walks, moss grows thicker. A gentle giant of the deep.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  // 4. MYCELID — green soil, fungal creature
  // Inspired by: Paras/Parasect, Matango (FF)
  // ─────────────────────────────────────────────────────────────────
  {
    baseId: "mycelid",
    familyName: "Fungus",
    spawnCondition: {
      soilType: "green",
      minNutrient: 0.7,
      boostResources: ["mushroom"],
      weight: 6,
    },
    forms: [
      {
        id: "mycelid",
        name: "Mycelid",
        stage: 1,
        baseStats: { hp: 35, mp: 25, atk: 10, def: 6, spd: 6 },
        growth: { hp: 6, mp: 4, atk: 3, def: 2, spd: 1 },
        behavior: {
          wanderlust: 0.3, foraging: 0.9, aggression: 0.2, cowardice: 0.5,
          preferredFood: ["mushroom", "moss"],
          preySpecies: [],
          predators: ["fang_beetle", "cave_beetle"],
        },
        evolutions: [
          {
            to: "sporeling",
            criteria: [
              { type: "level", target: 6, description: "Reach level 6" },
              { type: "eat", target: 12, subtype: "mushroom", description: "Eat 12 mushrooms" },
            ],
          },
          {
            to: "truffle_imp",
            criteria: [
              { type: "level", target: 7, description: "Reach level 7" },
              { type: "walk", target: 80, description: "Walk 80 tiles" },
              { type: "eat", target: 5, subtype: "mana_orb", description: "Eat 5 mana orbs" },
            ],
          },
        ],
        color: "#d4a373",
        accentColor: "#c8553d",
        lore: "A tiny walking fungus with expressive cap-eyes. Communicates through spore clouds.",
      },
      {
        id: "sporeling",
        name: "Sporeling",
        stage: 2,
        baseStats: { hp: 55, mp: 40, atk: 18, def: 10, spd: 8 },
        growth: { hp: 7, mp: 6, atk: 4, def: 2, spd: 1 },
        behavior: {
          wanderlust: 0.4, foraging: 0.8, aggression: 0.35, cowardice: 0.3,
          preferredFood: ["mushroom", "moss"],
          preySpecies: ["dust_mite"],
          predators: ["cave_serpent"],
        },
        evolutions: [
          {
            to: "fungal_titan",
            criteria: [
              { type: "level", target: 18, description: "Reach level 18" },
              { type: "eat", target: 30, subtype: "mushroom", description: "Eat 30 mushrooms" },
            ],
          },
          {
            to: "death_cap",
            criteria: [
              { type: "level", target: 16, description: "Reach level 16" },
              { type: "prey", target: 12, subtype: "dust_mite", description: "Hunt 12 dust mites" },
              { type: "combat", target: 15, description: "Win 15 fights" },
            ],
          },
        ],
        color: "#c0392b",
        accentColor: "#e74c3c",
        lore: "Releases clouds of spores when attacked. The spores cause drowsiness.",
      },
      {
        id: "truffle_imp",
        name: "Truffle Imp",
        stage: 2,
        baseStats: { hp: 45, mp: 50, atk: 14, def: 8, spd: 14 },
        growth: { hp: 6, mp: 7, atk: 3, def: 2, spd: 3 },
        behavior: {
          wanderlust: 0.7, foraging: 0.7, aggression: 0.25, cowardice: 0.4,
          preferredFood: ["mushroom", "mana_orb"],
          preySpecies: [],
          predators: ["fang_beetle"],
        },
        evolutions: [
          {
            to: "myco_sage",
            criteria: [
              { type: "level", target: 20, description: "Reach level 20" },
              { type: "eat", target: 15, subtype: "mana_orb", description: "Eat 15 mana orbs" },
              { type: "walk", target: 250, description: "Walk 250 tiles" },
            ],
          },
        ],
        color: "#f39c12",
        accentColor: "#e67e22",
        lore: "A mischievous mushroom spirit. Hoards magical truffles in hidden caches.",
      },
      {
        id: "fungal_titan",
        name: "Fungal Titan",
        stage: 3,
        baseStats: { hp: 130, mp: 55, atk: 26, def: 22, spd: 5 },
        growth: { hp: 15, mp: 7, atk: 5, def: 4, spd: 1 },
        behavior: {
          wanderlust: 0.2, foraging: 0.95, aggression: 0.1, cowardice: 0.1,
          preferredFood: ["mushroom", "moss"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [],
        color: "#922b21",
        accentColor: "#641e16",
        lore: "A towering mushroom colossus. Its cap can span an entire corridor.",
      },
      {
        id: "death_cap",
        name: "Death Cap",
        stage: 3,
        baseStats: { hp: 80, mp: 65, atk: 32, def: 14, spd: 12 },
        growth: { hp: 8, mp: 8, atk: 6, def: 2, spd: 2 },
        behavior: {
          wanderlust: 0.6, foraging: 0.5, aggression: 0.7, cowardice: 0.05,
          preferredFood: ["mushroom"],
          preySpecies: ["dust_mite", "glob_slime", "mycelid"],
          predators: [],
        },
        evolutions: [],
        color: "#1a1a2e",
        accentColor: "#4a0e4e",
        lore: "Lethal to touch. Its spores paralyze prey before slowly digesting them.",
      },
      {
        id: "myco_sage",
        name: "Myco-Sage",
        stage: 3,
        baseStats: { hp: 70, mp: 80, atk: 24, def: 16, spd: 16 },
        growth: { hp: 7, mp: 10, atk: 4, def: 3, spd: 3 },
        behavior: {
          wanderlust: 0.5, foraging: 0.6, aggression: 0.15, cowardice: 0.3,
          preferredFood: ["mana_orb", "mushroom", "crystal_shard"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [],
        color: "#9b59b6",
        accentColor: "#f1c40f",
        lore: "An enlightened fungal being. Its spore network connects to distant dungeon levels.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  // 5. WISP — crystal soil, elemental spirit
  // Inspired by: Will-o'-Wisp, Gastly (Pokemon), Bomb (FF)
  // ─────────────────────────────────────────────────────────────────
  {
    baseId: "wisp",
    familyName: "Wisp",
    spawnCondition: {
      soilType: "crystal",
      minMana: 2.5,
      boostResources: ["mana_orb", "crystal_shard"],
      weight: 8,
    },
    forms: [
      {
        id: "wisp",
        name: "Wisp",
        stage: 1,
        baseStats: { hp: 20, mp: 40, atk: 14, def: 4, spd: 18 },
        growth: { hp: 3, mp: 6, atk: 3, def: 1, spd: 3 },
        behavior: {
          wanderlust: 0.9, foraging: 0.5, aggression: 0.2, cowardice: 0.6,
          preferredFood: ["mana_orb", "crystal_shard"],
          preySpecies: [],
          predators: ["shade_wraith"],
        },
        evolutions: [
          {
            to: "flame_sprite",
            criteria: [
              { type: "level", target: 6, description: "Reach level 6" },
              { type: "eat", target: 8, subtype: "mana_orb", description: "Eat 8 mana orbs" },
            ],
          },
          {
            to: "frost_wisp",
            criteria: [
              { type: "level", target: 6, description: "Reach level 6" },
              { type: "eat", target: 8, subtype: "crystal_shard", description: "Eat 8 crystal shards" },
            ],
          },
          {
            to: "spark_mote",
            criteria: [
              { type: "level", target: 5, description: "Reach level 5" },
              { type: "walk", target: 120, description: "Walk 120 tiles" },
              { type: "combat", target: 5, description: "Win 5 fights" },
            ],
          },
        ],
        color: "#fff9c4",
        accentColor: "#fff176",
        lore: "A faint glowing orb drifting through mana-rich passages. Beautiful but fragile.",
      },
      {
        id: "flame_sprite",
        name: "Flame Sprite",
        stage: 2,
        baseStats: { hp: 35, mp: 55, atk: 24, def: 6, spd: 20 },
        growth: { hp: 5, mp: 7, atk: 5, def: 1, spd: 3 },
        behavior: {
          wanderlust: 0.8, foraging: 0.6, aggression: 0.5, cowardice: 0.3,
          preferredFood: ["mana_orb"],
          preySpecies: ["mycelid", "glob_slime"],
          predators: ["shade_wraith"],
        },
        evolutions: [
          {
            to: "inferno_elemental",
            criteria: [
              { type: "level", target: 20, description: "Reach level 20" },
              { type: "prey", target: 10, subtype: "mycelid", description: "Burn 10 fungi" },
              { type: "combat", target: 20, description: "Win 20 fights" },
            ],
          },
        ],
        color: "#ff6f00",
        accentColor: "#ff3d00",
        lore: "Mana has ignited within it. Leaves scorch marks on corridor walls.",
      },
      {
        id: "frost_wisp",
        name: "Frost Wisp",
        stage: 2,
        baseStats: { hp: 40, mp: 50, atk: 18, def: 12, spd: 16 },
        growth: { hp: 6, mp: 7, atk: 4, def: 2, spd: 2 },
        behavior: {
          wanderlust: 0.6, foraging: 0.7, aggression: 0.3, cowardice: 0.4,
          preferredFood: ["crystal_shard", "mana_orb"],
          preySpecies: [],
          predators: ["shade_wraith"],
        },
        evolutions: [
          {
            to: "glacial_phantom",
            criteria: [
              { type: "level", target: 18, description: "Reach level 18" },
              { type: "eat", target: 25, subtype: "crystal_shard", description: "Eat 25 crystal shards" },
            ],
          },
        ],
        color: "#80deea",
        accentColor: "#4dd0e1",
        lore: "Crystal mana has chilled it to sub-zero. Frost forms on nearby walls.",
      },
      {
        id: "spark_mote",
        name: "Spark Mote",
        stage: 2,
        baseStats: { hp: 30, mp: 45, atk: 20, def: 5, spd: 28 },
        growth: { hp: 4, mp: 6, atk: 4, def: 1, spd: 5 },
        behavior: {
          wanderlust: 1.0, foraging: 0.4, aggression: 0.4, cowardice: 0.5,
          preferredFood: ["mana_orb", "crystal_shard"],
          preySpecies: ["dust_mite"],
          predators: [],
        },
        evolutions: [
          {
            to: "storm_elemental",
            criteria: [
              { type: "level", target: 20, description: "Reach level 20" },
              { type: "walk", target: 500, description: "Walk 500 tiles" },
              { type: "combat", target: 15, description: "Win 15 fights" },
            ],
          },
        ],
        color: "#ffeb3b",
        accentColor: "#ffc107",
        lore: "Crackles with electric mana. Zips through tunnels at blinding speed.",
      },
      {
        id: "inferno_elemental",
        name: "Inferno Elemental",
        stage: 3,
        baseStats: { hp: 65, mp: 80, atk: 42, def: 10, spd: 22 },
        growth: { hp: 7, mp: 10, atk: 7, def: 2, spd: 3 },
        behavior: {
          wanderlust: 0.7, foraging: 0.4, aggression: 0.8, cowardice: 0.0,
          preferredFood: ["mana_orb"],
          preySpecies: ["mycelid", "sporeling", "glob_slime"],
          predators: [],
        },
        evolutions: [],
        color: "#d50000",
        accentColor: "#ff6d00",
        lore: "Pure living fire. The stone beneath it glows red. Apex mana predator.",
      },
      {
        id: "glacial_phantom",
        name: "Glacial Phantom",
        stage: 3,
        baseStats: { hp: 75, mp: 70, atk: 30, def: 24, spd: 18 },
        growth: { hp: 8, mp: 9, atk: 5, def: 4, spd: 2 },
        behavior: {
          wanderlust: 0.5, foraging: 0.6, aggression: 0.4, cowardice: 0.1,
          preferredFood: ["crystal_shard", "mana_orb"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [],
        color: "#00b8d4",
        accentColor: "#e0f7fa",
        lore: "An ethereal ice spirit. Corridors freeze solid in its wake.",
      },
      {
        id: "storm_elemental",
        name: "Storm Elemental",
        stage: 3,
        baseStats: { hp: 55, mp: 75, atk: 35, def: 8, spd: 38 },
        growth: { hp: 6, mp: 9, atk: 6, def: 1, spd: 6 },
        behavior: {
          wanderlust: 1.0, foraging: 0.3, aggression: 0.6, cowardice: 0.1,
          preferredFood: ["mana_orb"],
          preySpecies: ["dust_mite", "wisp"],
          predators: [],
        },
        evolutions: [],
        color: "#ffd600",
        accentColor: "#6200ea",
        lore: "A crackling vortex of lightning. The fastest and most unpredictable dungeon dweller.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  // 6. CAVE SERPENT — brown/green border, reptile predator
  // Inspired by: Ekans/Arbok, Basilisk (DQ), Lamia (FF)
  // ─────────────────────────────────────────────────────────────────
  {
    baseId: "cave_serpent",
    familyName: "Serpent",
    spawnCondition: {
      soilType: "brown",
      minNutrient: 0.3,
      boostResources: ["bone", "mushroom"],
      weight: 4,
    },
    forms: [
      {
        id: "cave_serpent",
        name: "Cave Serpent",
        stage: 1,
        baseStats: { hp: 40, mp: 15, atk: 16, def: 8, spd: 14 },
        growth: { hp: 7, mp: 2, atk: 4, def: 2, spd: 3 },
        behavior: {
          wanderlust: 0.6, foraging: 0.4, aggression: 0.6, cowardice: 0.2,
          preferredFood: ["bone", "mushroom"],
          preySpecies: ["dust_mite", "glob_slime", "cave_beetle"],
          predators: ["stone_golem"],
        },
        evolutions: [
          {
            to: "viper",
            criteria: [
              { type: "level", target: 7, description: "Reach level 7" },
              { type: "prey", target: 6, subtype: "dust_mite", description: "Hunt 6 mites" },
            ],
          },
          {
            to: "constrictor",
            criteria: [
              { type: "level", target: 7, description: "Reach level 7" },
              { type: "prey", target: 4, subtype: "cave_beetle", description: "Hunt 4 beetles" },
              { type: "combat", target: 10, description: "Win 10 fights" },
            ],
          },
          {
            to: "tunnel_asp",
            criteria: [
              { type: "level", target: 6, description: "Reach level 6" },
              { type: "walk", target: 150, description: "Walk 150 tiles" },
            ],
          },
        ],
        color: "#4caf50",
        accentColor: "#2e7d32",
        lore: "A slender serpent that coils through crevices. Patient ambush hunter.",
      },
      {
        id: "viper",
        name: "Viper",
        stage: 2,
        baseStats: { hp: 55, mp: 25, atk: 26, def: 10, spd: 18 },
        growth: { hp: 7, mp: 3, atk: 5, def: 2, spd: 3 },
        behavior: {
          wanderlust: 0.5, foraging: 0.3, aggression: 0.7, cowardice: 0.15,
          preferredFood: ["bone"],
          preySpecies: ["dust_mite", "glob_slime", "mycelid"],
          predators: [],
        },
        evolutions: [
          {
            to: "basilisk",
            criteria: [
              { type: "level", target: 20, description: "Reach level 20" },
              { type: "prey", target: 20, subtype: "glob_slime", description: "Hunt 20 slimes" },
              { type: "combat", target: 30, description: "Win 30 fights" },
            ],
          },
        ],
        color: "#388e3c",
        accentColor: "#c62828",
        lore: "Venomous fangs drip with a paralytic toxin. Strikes with terrifying speed.",
      },
      {
        id: "constrictor",
        name: "Constrictor",
        stage: 2,
        baseStats: { hp: 75, mp: 15, atk: 22, def: 16, spd: 12 },
        growth: { hp: 10, mp: 2, atk: 4, def: 3, spd: 2 },
        behavior: {
          wanderlust: 0.4, foraging: 0.4, aggression: 0.5, cowardice: 0.1,
          preferredFood: ["bone", "mushroom"],
          preySpecies: ["cave_beetle", "dust_mite"],
          predators: [],
        },
        evolutions: [
          {
            to: "wyrm",
            criteria: [
              { type: "level", target: 22, description: "Reach level 22" },
              { type: "prey", target: 15, subtype: "cave_beetle", description: "Crush 15 beetles" },
            ],
          },
        ],
        color: "#6a1b9a",
        accentColor: "#4a148c",
        lore: "Thick coils can crush a beetle's shell. Wraps around prey and squeezes.",
      },
      {
        id: "tunnel_asp",
        name: "Tunnel Asp",
        stage: 2,
        baseStats: { hp: 50, mp: 20, atk: 20, def: 10, spd: 22 },
        growth: { hp: 7, mp: 3, atk: 4, def: 2, spd: 4 },
        behavior: {
          wanderlust: 0.8, foraging: 0.5, aggression: 0.5, cowardice: 0.25,
          preferredFood: ["bone", "moss"],
          preySpecies: ["dust_mite"],
          predators: [],
        },
        evolutions: [
          {
            to: "tunnel_dragon",
            criteria: [
              { type: "level", target: 22, description: "Reach level 22" },
              { type: "walk", target: 600, description: "Walk 600 tiles" },
              { type: "eat", target: 10, subtype: "crystal_shard", description: "Eat 10 crystal shards" },
            ],
          },
        ],
        color: "#827717",
        accentColor: "#f9a825",
        lore: "Evolved for speed through narrow tunnels. A blur of scales and fangs.",
      },
      {
        id: "basilisk",
        name: "Basilisk",
        stage: 3,
        baseStats: { hp: 100, mp: 50, atk: 40, def: 20, spd: 20 },
        growth: { hp: 12, mp: 6, atk: 7, def: 3, spd: 3 },
        behavior: {
          wanderlust: 0.4, foraging: 0.3, aggression: 0.85, cowardice: 0.0,
          preferredFood: ["bone"],
          preySpecies: ["glob_slime", "cave_beetle", "mycelid", "dust_mite"],
          predators: [],
        },
        evolutions: [],
        color: "#1b5e20",
        accentColor: "#b71c1c",
        lore: "The king of serpents. Its gaze petrifies weaker creatures with primal terror.",
      },
      {
        id: "wyrm",
        name: "Wyrm",
        stage: 3,
        baseStats: { hp: 130, mp: 30, atk: 35, def: 30, spd: 14 },
        growth: { hp: 14, mp: 4, atk: 6, def: 5, spd: 2 },
        behavior: {
          wanderlust: 0.3, foraging: 0.4, aggression: 0.7, cowardice: 0.0,
          preferredFood: ["bone", "crystal_shard"],
          preySpecies: ["cave_beetle", "stone_golem"],
          predators: [],
        },
        evolutions: [],
        color: "#4a148c",
        accentColor: "#e040fb",
        lore: "A massive subterranean serpent. Tunnels collapse in its coiled wake.",
      },
      {
        id: "tunnel_dragon",
        name: "Tunnel Dragon",
        stage: 3,
        baseStats: { hp: 110, mp: 45, atk: 38, def: 22, spd: 26 },
        growth: { hp: 12, mp: 6, atk: 6, def: 4, spd: 4 },
        behavior: {
          wanderlust: 0.7, foraging: 0.3, aggression: 0.75, cowardice: 0.0,
          preferredFood: ["crystal_shard", "bone"],
          preySpecies: ["cave_beetle", "wisp", "dust_mite"],
          predators: [],
        },
        evolutions: [],
        color: "#ef6c00",
        accentColor: "#f44336",
        lore: "Not a true dragon, but close enough. Wings vestigial, speed unmatched.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  // 7. STONE GOLEM — brown soil, needs bone, living rock
  // Inspired by: Golem (Pokemon/DQ), Gargoyle (FF)
  // ─────────────────────────────────────────────────────────────────
  {
    baseId: "stone_golem",
    familyName: "Golem",
    spawnCondition: {
      soilType: "brown",
      boostResources: ["bone"],
      weight: 3,
    },
    forms: [
      {
        id: "stone_golem",
        name: "Stone Golem",
        stage: 1,
        baseStats: { hp: 70, mp: 5, atk: 14, def: 20, spd: 4 },
        growth: { hp: 12, mp: 1, atk: 3, def: 5, spd: 0 },
        behavior: {
          wanderlust: 0.2, foraging: 0.3, aggression: 0.3, cowardice: 0.0,
          preferredFood: ["bone", "crystal_shard"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [
          {
            to: "granite_sentinel",
            criteria: [
              { type: "level", target: 8, description: "Reach level 8" },
              { type: "eat", target: 10, subtype: "bone", description: "Eat 10 bones" },
            ],
          },
          {
            to: "clay_brute",
            criteria: [
              { type: "level", target: 7, description: "Reach level 7" },
              { type: "combat", target: 10, description: "Win 10 fights" },
            ],
          },
          {
            to: "crystal_golem",
            criteria: [
              { type: "level", target: 8, description: "Reach level 8" },
              { type: "eat", target: 10, subtype: "crystal_shard", description: "Eat 10 crystal shards" },
              { type: "eat", target: 5, subtype: "mana_orb", description: "Eat 5 mana orbs" },
            ],
          },
        ],
        color: "#9e9e9e",
        accentColor: "#757575",
        lore: "A pile of rocks that learned to walk. Slow but nearly indestructible.",
      },
      {
        id: "granite_sentinel",
        name: "Granite Sentinel",
        stage: 2,
        baseStats: { hp: 110, mp: 10, atk: 20, def: 32, spd: 4 },
        growth: { hp: 14, mp: 1, atk: 4, def: 6, spd: 0 },
        behavior: {
          wanderlust: 0.1, foraging: 0.2, aggression: 0.2, cowardice: 0.0,
          preferredFood: ["bone"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [
          {
            to: "mountain_lord",
            criteria: [
              { type: "level", target: 22, description: "Reach level 22" },
              { type: "eat", target: 30, subtype: "bone", description: "Eat 30 bones" },
              { type: "combat", target: 20, description: "Win 20 fights" },
            ],
          },
        ],
        color: "#757575",
        accentColor: "#616161",
        lore: "Stands utterly motionless for days, then moves with terrifying purpose.",
      },
      {
        id: "clay_brute",
        name: "Clay Brute",
        stage: 2,
        baseStats: { hp: 90, mp: 8, atk: 26, def: 24, spd: 6 },
        growth: { hp: 12, mp: 1, atk: 5, def: 4, spd: 1 },
        behavior: {
          wanderlust: 0.3, foraging: 0.3, aggression: 0.5, cowardice: 0.0,
          preferredFood: ["bone"],
          preySpecies: ["cave_beetle"],
          predators: [],
        },
        evolutions: [
          {
            to: "iron_colossus",
            criteria: [
              { type: "level", target: 22, description: "Reach level 22" },
              { type: "combat", target: 30, description: "Win 30 fights" },
              { type: "prey", target: 10, subtype: "cave_beetle", description: "Crush 10 beetles" },
            ],
          },
        ],
        color: "#8d6e63",
        accentColor: "#5d4037",
        lore: "Softer than granite but faster. Reshapes its fists mid-swing.",
      },
      {
        id: "crystal_golem",
        name: "Crystal Golem",
        stage: 2,
        baseStats: { hp: 85, mp: 35, atk: 22, def: 26, spd: 6 },
        growth: { hp: 10, mp: 5, atk: 4, def: 5, spd: 1 },
        behavior: {
          wanderlust: 0.2, foraging: 0.5, aggression: 0.25, cowardice: 0.0,
          preferredFood: ["crystal_shard", "mana_orb"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [
          {
            to: "arcane_colossus",
            criteria: [
              { type: "level", target: 24, description: "Reach level 24" },
              { type: "eat", target: 30, subtype: "crystal_shard", description: "Eat 30 crystal shards" },
              { type: "eat", target: 15, subtype: "mana_orb", description: "Eat 15 mana orbs" },
            ],
          },
        ],
        color: "#4fc3f7",
        accentColor: "#0288d1",
        lore: "Crystal formations have fused with its stone body. Hums with latent energy.",
      },
      {
        id: "mountain_lord",
        name: "Mountain Lord",
        stage: 3,
        baseStats: { hp: 200, mp: 15, atk: 30, def: 50, spd: 3 },
        growth: { hp: 20, mp: 2, atk: 5, def: 8, spd: 0 },
        behavior: {
          wanderlust: 0.05, foraging: 0.2, aggression: 0.15, cowardice: 0.0,
          preferredFood: ["bone"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [],
        color: "#616161",
        accentColor: "#424242",
        lore: "An immovable fortress of living stone. The dungeon itself bows to it.",
      },
      {
        id: "iron_colossus",
        name: "Iron Colossus",
        stage: 3,
        baseStats: { hp: 160, mp: 10, atk: 40, def: 40, spd: 5 },
        growth: { hp: 18, mp: 1, atk: 7, def: 6, spd: 1 },
        behavior: {
          wanderlust: 0.2, foraging: 0.2, aggression: 0.6, cowardice: 0.0,
          preferredFood: ["bone", "crystal_shard"],
          preySpecies: ["cave_beetle", "cave_serpent"],
          predators: [],
        },
        evolutions: [],
        color: "#37474f",
        accentColor: "#263238",
        lore: "Metal-laced stone given terrible purpose. Its footsteps echo for hours.",
      },
      {
        id: "arcane_colossus",
        name: "Arcane Colossus",
        stage: 3,
        baseStats: { hp: 140, mp: 60, atk: 35, def: 38, spd: 6 },
        growth: { hp: 15, mp: 8, atk: 6, def: 6, spd: 1 },
        behavior: {
          wanderlust: 0.15, foraging: 0.4, aggression: 0.3, cowardice: 0.0,
          preferredFood: ["crystal_shard", "mana_orb"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [],
        color: "#1565c0",
        accentColor: "#e1f5fe",
        lore: "Crystal and stone in perfect harmony. Radiates protective auras.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  // 8. SHADE WRAITH — crystal soil, undead/spectral
  // Inspired by: Ghast (DQ), Ghost (Pokemon), Specter (FF)
  // ─────────────────────────────────────────────────────────────────
  {
    baseId: "shade_wraith",
    familyName: "Shade",
    spawnCondition: {
      soilType: "crystal",
      minMana: 3.0,
      boostResources: ["mana_orb"],
      weight: 4,
    },
    forms: [
      {
        id: "shade_wraith",
        name: "Shade Wraith",
        stage: 1,
        baseStats: { hp: 30, mp: 35, atk: 12, def: 6, spd: 16 },
        growth: { hp: 5, mp: 5, atk: 3, def: 1, spd: 3 },
        behavior: {
          wanderlust: 0.7, foraging: 0.4, aggression: 0.5, cowardice: 0.3,
          preferredFood: ["mana_orb", "bone"],
          preySpecies: ["wisp", "dust_mite"],
          predators: [],
        },
        evolutions: [
          {
            to: "phantom",
            criteria: [
              { type: "level", target: 7, description: "Reach level 7" },
              { type: "prey", target: 5, subtype: "wisp", description: "Consume 5 wisps" },
            ],
          },
          {
            to: "banshee",
            criteria: [
              { type: "level", target: 7, description: "Reach level 7" },
              { type: "eat", target: 10, subtype: "mana_orb", description: "Eat 10 mana orbs" },
              { type: "combat", target: 8, description: "Win 8 fights" },
            ],
          },
          {
            to: "bone_shade",
            criteria: [
              { type: "level", target: 6, description: "Reach level 6" },
              { type: "eat", target: 8, subtype: "bone", description: "Eat 8 bones" },
            ],
          },
        ],
        color: "#b0bec5",
        accentColor: "#78909c",
        lore: "A thin shadow that flickers at the edge of torchlight. Feeds on magical residue.",
      },
      {
        id: "phantom",
        name: "Phantom",
        stage: 2,
        baseStats: { hp: 45, mp: 55, atk: 22, def: 8, spd: 22 },
        growth: { hp: 6, mp: 7, atk: 5, def: 1, spd: 4 },
        behavior: {
          wanderlust: 0.8, foraging: 0.3, aggression: 0.65, cowardice: 0.15,
          preferredFood: ["mana_orb"],
          preySpecies: ["wisp", "glob_slime", "mycelid"],
          predators: [],
        },
        evolutions: [
          {
            to: "revenant",
            criteria: [
              { type: "level", target: 22, description: "Reach level 22" },
              { type: "prey", target: 15, subtype: "wisp", description: "Consume 15 wisps" },
              { type: "combat", target: 25, description: "Win 25 fights" },
            ],
          },
        ],
        color: "#90a4ae",
        accentColor: "#546e7a",
        lore: "Fully formed spectral predator. Phases through solid walls to ambush prey.",
      },
      {
        id: "banshee",
        name: "Banshee",
        stage: 2,
        baseStats: { hp: 40, mp: 60, atk: 28, def: 6, spd: 18 },
        growth: { hp: 5, mp: 8, atk: 6, def: 1, spd: 3 },
        behavior: {
          wanderlust: 0.6, foraging: 0.4, aggression: 0.7, cowardice: 0.1,
          preferredFood: ["mana_orb"],
          preySpecies: ["wisp", "dust_mite", "glob_slime"],
          predators: [],
        },
        evolutions: [
          {
            to: "lich",
            criteria: [
              { type: "level", target: 25, description: "Reach level 25" },
              { type: "eat", target: 30, subtype: "mana_orb", description: "Eat 30 mana orbs" },
              { type: "prey", target: 10, subtype: "wisp", description: "Consume 10 wisps" },
            ],
          },
        ],
        color: "#7e57c2",
        accentColor: "#4527a0",
        lore: "Its shriek freezes hearts. Mana has given the dead a terrible voice.",
      },
      {
        id: "bone_shade",
        name: "Bone Shade",
        stage: 2,
        baseStats: { hp: 55, mp: 30, atk: 18, def: 16, spd: 14 },
        growth: { hp: 8, mp: 4, atk: 4, def: 3, spd: 2 },
        behavior: {
          wanderlust: 0.5, foraging: 0.5, aggression: 0.4, cowardice: 0.2,
          preferredFood: ["bone", "mana_orb"],
          preySpecies: ["dust_mite"],
          predators: [],
        },
        evolutions: [
          {
            to: "death_knight",
            criteria: [
              { type: "level", target: 22, description: "Reach level 22" },
              { type: "eat", target: 20, subtype: "bone", description: "Eat 20 bones" },
              { type: "combat", target: 25, description: "Win 25 fights" },
            ],
          },
        ],
        color: "#e0e0e0",
        accentColor: "#9e9e9e",
        lore: "A ghost wrapped in a shell of collected bones. More physical than its kin.",
      },
      {
        id: "revenant",
        name: "Revenant",
        stage: 3,
        baseStats: { hp: 75, mp: 70, atk: 38, def: 12, spd: 28 },
        growth: { hp: 8, mp: 9, atk: 7, def: 2, spd: 4 },
        behavior: {
          wanderlust: 0.8, foraging: 0.2, aggression: 0.85, cowardice: 0.0,
          preferredFood: ["mana_orb"],
          preySpecies: ["wisp", "mycelid", "glob_slime"],
          predators: [],
        },
        evolutions: [],
        color: "#455a64",
        accentColor: "#cfd8dc",
        lore: "Pure undead malice given form. Nothing in the dungeon challenges it willingly.",
      },
      {
        id: "lich",
        name: "Lich",
        stage: 3,
        baseStats: { hp: 65, mp: 100, atk: 45, def: 10, spd: 20 },
        growth: { hp: 7, mp: 12, atk: 8, def: 2, spd: 3 },
        behavior: {
          wanderlust: 0.3, foraging: 0.4, aggression: 0.6, cowardice: 0.0,
          preferredFood: ["mana_orb"],
          preySpecies: ["wisp", "shade_wraith", "mycelid"],
          predators: [],
        },
        evolutions: [],
        color: "#311b92",
        accentColor: "#b388ff",
        lore: "An arcane intellect freed from mortality. The most magically powerful dungeon entity.",
      },
      {
        id: "death_knight",
        name: "Death Knight",
        stage: 3,
        baseStats: { hp: 110, mp: 40, atk: 35, def: 30, spd: 14 },
        growth: { hp: 12, mp: 5, atk: 6, def: 5, spd: 2 },
        behavior: {
          wanderlust: 0.4, foraging: 0.3, aggression: 0.7, cowardice: 0.0,
          preferredFood: ["bone", "mana_orb"],
          preySpecies: ["cave_beetle", "cave_serpent"],
          predators: [],
        },
        evolutions: [],
        color: "#212121",
        accentColor: "#b71c1c",
        lore: "A warrior spirit clad in bone armor. Its sword is a shard of crystallized mana.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  // 9. FANG BEETLE — green soil, aggressive insect predator
  // Inspired by: Pinsir, Scyther (Pokemon), Antlion (FF)
  // ─────────────────────────────────────────────────────────────────
  {
    baseId: "fang_beetle",
    familyName: "Fang",
    spawnCondition: {
      soilType: "green",
      minNutrient: 0.6,
      boostResources: ["mushroom", "bone"],
      weight: 4,
    },
    forms: [
      {
        id: "fang_beetle",
        name: "Fang Beetle",
        stage: 1,
        baseStats: { hp: 35, mp: 10, atk: 16, def: 10, spd: 12 },
        growth: { hp: 6, mp: 2, atk: 4, def: 2, spd: 2 },
        behavior: {
          wanderlust: 0.6, foraging: 0.5, aggression: 0.7, cowardice: 0.15,
          preferredFood: ["mushroom", "bone"],
          preySpecies: ["dust_mite", "glob_slime", "mycelid"],
          predators: ["cave_serpent"],
        },
        evolutions: [
          {
            to: "mantis_beetle",
            criteria: [
              { type: "level", target: 7, description: "Reach level 7" },
              { type: "prey", target: 8, subtype: "glob_slime", description: "Hunt 8 slimes" },
            ],
          },
          {
            to: "trapdoor_hunter",
            criteria: [
              { type: "level", target: 6, description: "Reach level 6" },
              { type: "prey", target: 6, subtype: "dust_mite", description: "Hunt 6 mites" },
              { type: "walk", target: 60, description: "Walk 60 tiles" },
            ],
          },
        ],
        color: "#d32f2f",
        accentColor: "#b71c1c",
        lore: "Oversized mandibles snap shut with crushing force. An ambush predator.",
      },
      {
        id: "mantis_beetle",
        name: "Mantis Beetle",
        stage: 2,
        baseStats: { hp: 55, mp: 15, atk: 28, def: 12, spd: 18 },
        growth: { hp: 7, mp: 2, atk: 6, def: 2, spd: 3 },
        behavior: {
          wanderlust: 0.5, foraging: 0.4, aggression: 0.8, cowardice: 0.05,
          preferredFood: ["mushroom", "bone"],
          preySpecies: ["glob_slime", "mycelid", "cave_beetle"],
          predators: [],
        },
        evolutions: [
          {
            to: "reaper_mantis",
            criteria: [
              { type: "level", target: 20, description: "Reach level 20" },
              { type: "prey", target: 20, subtype: "glob_slime", description: "Hunt 20 slimes" },
              { type: "combat", target: 30, description: "Win 30 fights" },
            ],
          },
        ],
        color: "#c62828",
        accentColor: "#880e4f",
        lore: "Blade-like forelimbs carve through prey. Silent, precise, lethal.",
      },
      {
        id: "trapdoor_hunter",
        name: "Trapdoor Hunter",
        stage: 2,
        baseStats: { hp: 50, mp: 12, atk: 24, def: 14, spd: 14 },
        growth: { hp: 7, mp: 2, atk: 5, def: 3, spd: 2 },
        behavior: {
          wanderlust: 0.3, foraging: 0.4, aggression: 0.75, cowardice: 0.1,
          preferredFood: ["bone"],
          preySpecies: ["dust_mite", "cave_beetle", "mycelid"],
          predators: [],
        },
        evolutions: [
          {
            to: "abyssal_lurker",
            criteria: [
              { type: "level", target: 18, description: "Reach level 18" },
              { type: "prey", target: 15, subtype: "dust_mite", description: "Hunt 15 mites" },
            ],
          },
        ],
        color: "#4e342e",
        accentColor: "#d84315",
        lore: "Digs shallow pits and waits. Unsuspecting prey falls right into its jaws.",
      },
      {
        id: "reaper_mantis",
        name: "Reaper Mantis",
        stage: 3,
        baseStats: { hp: 85, mp: 20, atk: 45, def: 16, spd: 24 },
        growth: { hp: 9, mp: 3, atk: 8, def: 2, spd: 4 },
        behavior: {
          wanderlust: 0.4, foraging: 0.3, aggression: 0.9, cowardice: 0.0,
          preferredFood: ["bone", "mushroom"],
          preySpecies: ["glob_slime", "mycelid", "cave_beetle", "dust_mite"],
          predators: [],
        },
        evolutions: [],
        color: "#b71c1c",
        accentColor: "#f44336",
        lore: "The apex arthropod predator. Its twin sickle arms reap through entire corridors.",
      },
      {
        id: "abyssal_lurker",
        name: "Abyssal Lurker",
        stage: 3,
        baseStats: { hp: 80, mp: 15, atk: 38, def: 22, spd: 16 },
        growth: { hp: 10, mp: 2, atk: 7, def: 4, spd: 2 },
        behavior: {
          wanderlust: 0.2, foraging: 0.3, aggression: 0.85, cowardice: 0.0,
          preferredFood: ["bone"],
          preySpecies: ["dust_mite", "cave_beetle", "glob_slime"],
          predators: [],
        },
        evolutions: [],
        color: "#1a1a1a",
        accentColor: "#ff1744",
        lore: "Perfectly adapted to darkness. By the time you see its eyes, it's already too late.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  // 10. CRYSTAL SPRITE — crystal soil, original base type (redesigned)
  // Inspired by: Carbuncle (FF), Natu (Pokemon)
  // ─────────────────────────────────────────────────────────────────
  {
    baseId: "crystal_sprite",
    familyName: "Sprite",
    spawnCondition: {
      soilType: "crystal",
      minMana: 2.0,
      boostResources: ["crystal_shard", "mana_orb"],
      weight: 7,
    },
    forms: [
      {
        id: "crystal_sprite",
        name: "Crystal Sprite",
        stage: 1,
        baseStats: { hp: 30, mp: 40, atk: 14, def: 8, spd: 14 },
        growth: { hp: 5, mp: 6, atk: 3, def: 2, spd: 2 },
        behavior: {
          wanderlust: 0.7, foraging: 0.7, aggression: 0.15, cowardice: 0.5,
          preferredFood: ["crystal_shard", "mana_orb"],
          preySpecies: [],
          predators: ["shade_wraith", "cave_serpent"],
        },
        evolutions: [
          {
            to: "prism_dancer",
            criteria: [
              { type: "level", target: 6, description: "Reach level 6" },
              { type: "eat", target: 10, subtype: "crystal_shard", description: "Eat 10 crystal shards" },
            ],
          },
          {
            to: "mana_sprite",
            criteria: [
              { type: "level", target: 6, description: "Reach level 6" },
              { type: "eat", target: 8, subtype: "mana_orb", description: "Eat 8 mana orbs" },
            ],
          },
          {
            to: "gem_hoarder",
            criteria: [
              { type: "level", target: 7, description: "Reach level 7" },
              { type: "eat", target: 6, subtype: "crystal_shard", description: "Eat 6 crystal shards" },
              { type: "walk", target: 100, description: "Walk 100 tiles" },
            ],
          },
        ],
        color: "#29b6f6",
        accentColor: "#0288d1",
        lore: "A tiny luminous being made of crystallized mana. Hums a resonant tone.",
      },
      {
        id: "prism_dancer",
        name: "Prism Dancer",
        stage: 2,
        baseStats: { hp: 40, mp: 55, atk: 22, def: 10, spd: 20 },
        growth: { hp: 5, mp: 7, atk: 4, def: 2, spd: 3 },
        behavior: {
          wanderlust: 0.8, foraging: 0.6, aggression: 0.2, cowardice: 0.4,
          preferredFood: ["crystal_shard"],
          preySpecies: [],
          predators: ["shade_wraith"],
        },
        evolutions: [
          {
            to: "crystal_archon",
            criteria: [
              { type: "level", target: 20, description: "Reach level 20" },
              { type: "eat", target: 25, subtype: "crystal_shard", description: "Eat 25 crystal shards" },
              { type: "walk", target: 400, description: "Walk 400 tiles" },
            ],
          },
        ],
        color: "#e040fb",
        accentColor: "#ea80fc",
        lore: "Refracts light into dazzling patterns. Mesmerizes predators with prismatic displays.",
      },
      {
        id: "mana_sprite",
        name: "Mana Sprite",
        stage: 2,
        baseStats: { hp: 35, mp: 65, atk: 26, def: 8, spd: 16 },
        growth: { hp: 4, mp: 9, atk: 5, def: 1, spd: 2 },
        behavior: {
          wanderlust: 0.6, foraging: 0.8, aggression: 0.2, cowardice: 0.4,
          preferredFood: ["mana_orb"],
          preySpecies: [],
          predators: ["shade_wraith"],
        },
        evolutions: [
          {
            to: "mana_wellspring",
            criteria: [
              { type: "level", target: 20, description: "Reach level 20" },
              { type: "eat", target: 30, subtype: "mana_orb", description: "Eat 30 mana orbs" },
            ],
          },
        ],
        color: "#ab47bc",
        accentColor: "#7b1fa2",
        lore: "Saturated with pure mana. Floats serenely, leaving trails of magical residue.",
      },
      {
        id: "gem_hoarder",
        name: "Gem Hoarder",
        stage: 2,
        baseStats: { hp: 50, mp: 40, atk: 18, def: 18, spd: 12 },
        growth: { hp: 7, mp: 5, atk: 3, def: 4, spd: 2 },
        behavior: {
          wanderlust: 0.5, foraging: 0.9, aggression: 0.1, cowardice: 0.3,
          preferredFood: ["crystal_shard", "mana_orb"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [
          {
            to: "treasure_dragon",
            criteria: [
              { type: "level", target: 22, description: "Reach level 22" },
              { type: "eat", target: 20, subtype: "crystal_shard", description: "Eat 20 crystal shards" },
              { type: "eat", target: 15, subtype: "mana_orb", description: "Eat 15 mana orbs" },
              { type: "combat", target: 15, description: "Win 15 fights" },
            ],
          },
        ],
        color: "#ffc107",
        accentColor: "#ff8f00",
        lore: "Obsessively collects shiny objects. Its nest glitters with stolen crystal shards.",
      },
      {
        id: "crystal_archon",
        name: "Crystal Archon",
        stage: 3,
        baseStats: { hp: 70, mp: 80, atk: 35, def: 20, spd: 24 },
        growth: { hp: 8, mp: 10, atk: 6, def: 3, spd: 4 },
        behavior: {
          wanderlust: 0.6, foraging: 0.5, aggression: 0.3, cowardice: 0.1,
          preferredFood: ["crystal_shard", "mana_orb"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [],
        color: "#e1bee7",
        accentColor: "#ce93d8",
        lore: "A radiant crystal being of immense beauty. Its presence purifies nearby mana.",
      },
      {
        id: "mana_wellspring",
        name: "Mana Wellspring",
        stage: 3,
        baseStats: { hp: 50, mp: 120, atk: 40, def: 12, spd: 14 },
        growth: { hp: 5, mp: 14, atk: 7, def: 2, spd: 2 },
        behavior: {
          wanderlust: 0.3, foraging: 0.7, aggression: 0.1, cowardice: 0.2,
          preferredFood: ["mana_orb"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [],
        color: "#7c4dff",
        accentColor: "#b388ff",
        lore: "A living fountain of magical energy. Mana orbs spontaneously form in its wake.",
      },
      {
        id: "treasure_dragon",
        name: "Treasure Dragon",
        stage: 3,
        baseStats: { hp: 100, mp: 55, atk: 35, def: 30, spd: 16 },
        growth: { hp: 12, mp: 7, atk: 6, def: 5, spd: 2 },
        behavior: {
          wanderlust: 0.4, foraging: 0.7, aggression: 0.4, cowardice: 0.0,
          preferredFood: ["crystal_shard", "mana_orb"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [],
        color: "#ffd600",
        accentColor: "#ff6f00",
        lore: "A dragon born from greed itself. Its scales are living gemstones.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  // 11. MOSS CRAWLER — green/brown border, worm/centipede
  // Inspired by: Caterpie (Pokemon), Crawler (FF)
  // ─────────────────────────────────────────────────────────────────
  {
    baseId: "moss_crawler",
    familyName: "Crawler",
    spawnCondition: {
      soilType: "green",
      boostResources: ["moss"],
      weight: 8,
    },
    forms: [
      {
        id: "moss_crawler",
        name: "Moss Crawler",
        stage: 1,
        baseStats: { hp: 35, mp: 8, atk: 10, def: 12, spd: 8 },
        growth: { hp: 6, mp: 1, atk: 2, def: 3, spd: 2 },
        behavior: {
          wanderlust: 0.5, foraging: 0.85, aggression: 0.1, cowardice: 0.6,
          preferredFood: ["moss", "mushroom"],
          preySpecies: [],
          predators: ["fang_beetle", "cave_serpent"],
        },
        evolutions: [
          {
            to: "silk_weaver",
            criteria: [
              { type: "level", target: 5, description: "Reach level 5" },
              { type: "eat", target: 10, subtype: "moss", description: "Eat 10 moss" },
            ],
          },
          {
            to: "tunnel_centipede",
            criteria: [
              { type: "level", target: 6, description: "Reach level 6" },
              { type: "walk", target: 80, description: "Walk 80 tiles" },
              { type: "combat", target: 5, description: "Win 5 fights" },
            ],
          },
        ],
        color: "#66bb6a",
        accentColor: "#43a047",
        lore: "A plump segmented worm that grazes on cave moss. Moves in rhythmic waves.",
      },
      {
        id: "silk_weaver",
        name: "Silk Weaver",
        stage: 2,
        baseStats: { hp: 45, mp: 20, atk: 12, def: 16, spd: 10 },
        growth: { hp: 7, mp: 3, atk: 2, def: 4, spd: 2 },
        behavior: {
          wanderlust: 0.3, foraging: 0.8, aggression: 0.05, cowardice: 0.5,
          preferredFood: ["moss", "mushroom"],
          preySpecies: [],
          predators: ["fang_beetle"],
        },
        evolutions: [
          {
            to: "silk_moth",
            criteria: [
              { type: "level", target: 15, description: "Reach level 15" },
              { type: "eat", target: 25, subtype: "moss", description: "Eat 25 moss" },
              { type: "walk", target: 150, description: "Walk 150 tiles" },
            ],
          },
          {
            to: "web_matriarch",
            criteria: [
              { type: "level", target: 18, description: "Reach level 18" },
              { type: "prey", target: 8, subtype: "dust_mite", description: "Trap 8 mites" },
            ],
          },
        ],
        color: "#e8f5e9",
        accentColor: "#c8e6c9",
        lore: "Spins fine silk threads across corridors. Peaceful unless its web is disturbed.",
      },
      {
        id: "tunnel_centipede",
        name: "Tunnel Centipede",
        stage: 2,
        baseStats: { hp: 55, mp: 10, atk: 20, def: 14, spd: 16 },
        growth: { hp: 8, mp: 1, atk: 4, def: 3, spd: 3 },
        behavior: {
          wanderlust: 0.7, foraging: 0.5, aggression: 0.5, cowardice: 0.2,
          preferredFood: ["moss", "bone"],
          preySpecies: ["dust_mite", "glob_slime"],
          predators: ["cave_serpent"],
        },
        evolutions: [
          {
            to: "megapede",
            criteria: [
              { type: "level", target: 18, description: "Reach level 18" },
              { type: "walk", target: 400, description: "Walk 400 tiles" },
              { type: "combat", target: 20, description: "Win 20 fights" },
            ],
          },
        ],
        color: "#ff7043",
        accentColor: "#d84315",
        lore: "Dozens of legs propel it through tunnels. Its bite delivers a painful venom.",
      },
      {
        id: "silk_moth",
        name: "Silk Moth",
        stage: 3,
        baseStats: { hp: 60, mp: 45, atk: 16, def: 20, spd: 20 },
        growth: { hp: 7, mp: 6, atk: 3, def: 4, spd: 3 },
        behavior: {
          wanderlust: 0.8, foraging: 0.7, aggression: 0.05, cowardice: 0.3,
          preferredFood: ["moss", "mana_orb"],
          preySpecies: [],
          predators: [],
        },
        evolutions: [],
        color: "#f3e5f5",
        accentColor: "#e1bee7",
        lore: "Emerged from its cocoon with luminous wings. A rare beauty in the dark.",
      },
      {
        id: "web_matriarch",
        name: "Web Matriarch",
        stage: 3,
        baseStats: { hp: 75, mp: 30, atk: 28, def: 22, spd: 14 },
        growth: { hp: 9, mp: 4, atk: 5, def: 4, spd: 2 },
        behavior: {
          wanderlust: 0.2, foraging: 0.4, aggression: 0.6, cowardice: 0.05,
          preferredFood: ["bone"],
          preySpecies: ["dust_mite", "cave_beetle", "glob_slime"],
          predators: [],
        },
        evolutions: [],
        color: "#4a148c",
        accentColor: "#e8eaf6",
        lore: "Her web spans entire corridors. Anything that touches a strand becomes a meal.",
      },
      {
        id: "megapede",
        name: "Megapede",
        stage: 3,
        baseStats: { hp: 100, mp: 15, atk: 34, def: 24, spd: 20 },
        growth: { hp: 12, mp: 2, atk: 6, def: 4, spd: 3 },
        behavior: {
          wanderlust: 0.8, foraging: 0.4, aggression: 0.65, cowardice: 0.0,
          preferredFood: ["bone", "moss"],
          preySpecies: ["dust_mite", "glob_slime", "cave_beetle"],
          predators: [],
        },
        evolutions: [],
        color: "#e64a19",
        accentColor: "#bf360c",
        lore: "A massive armored centipede. Its venom can paralyze creatures twice its size.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  // 12. EMBER SALAMANDER — brown/crystal border, fire lizard
  // Inspired by: Charmander (Pokemon), Bomb (FF), Salamander myth
  // ─────────────────────────────────────────────────────────────────
  {
    baseId: "ember_salamander",
    familyName: "Salamander",
    spawnCondition: {
      soilType: "brown",
      minMana: 1.0,
      boostResources: ["bone", "crystal_shard"],
      weight: 3,
    },
    forms: [
      {
        id: "ember_salamander",
        name: "Ember Salamander",
        stage: 1,
        baseStats: { hp: 38, mp: 20, atk: 14, def: 10, spd: 12 },
        growth: { hp: 6, mp: 3, atk: 3, def: 2, spd: 2 },
        behavior: {
          wanderlust: 0.6, foraging: 0.6, aggression: 0.4, cowardice: 0.3,
          preferredFood: ["bone", "crystal_shard"],
          preySpecies: ["dust_mite"],
          predators: ["cave_serpent"],
        },
        evolutions: [
          {
            to: "magma_newt",
            criteria: [
              { type: "level", target: 7, description: "Reach level 7" },
              { type: "eat", target: 8, subtype: "crystal_shard", description: "Eat 8 crystal shards" },
              { type: "combat", target: 6, description: "Win 6 fights" },
            ],
          },
          {
            to: "ash_lizard",
            criteria: [
              { type: "level", target: 6, description: "Reach level 6" },
              { type: "eat", target: 10, subtype: "bone", description: "Eat 10 bones" },
            ],
          },
          {
            to: "spark_salamander",
            criteria: [
              { type: "level", target: 7, description: "Reach level 7" },
              { type: "eat", target: 6, subtype: "mana_orb", description: "Eat 6 mana orbs" },
              { type: "walk", target: 100, description: "Walk 100 tiles" },
            ],
          },
        ],
        color: "#ff5722",
        accentColor: "#e64a19",
        lore: "A small lizard with smoldering skin. Leaves warm footprints on cool stone.",
      },
      {
        id: "magma_newt",
        name: "Magma Newt",
        stage: 2,
        baseStats: { hp: 60, mp: 35, atk: 24, def: 14, spd: 14 },
        growth: { hp: 8, mp: 5, atk: 5, def: 3, spd: 2 },
        behavior: {
          wanderlust: 0.5, foraging: 0.5, aggression: 0.6, cowardice: 0.1,
          preferredFood: ["crystal_shard", "bone"],
          preySpecies: ["dust_mite", "cave_beetle"],
          predators: [],
        },
        evolutions: [
          {
            to: "drake",
            criteria: [
              { type: "level", target: 22, description: "Reach level 22" },
              { type: "eat", target: 20, subtype: "crystal_shard", description: "Eat 20 crystal shards" },
              { type: "combat", target: 25, description: "Win 25 fights" },
            ],
          },
        ],
        color: "#ff3d00",
        accentColor: "#dd2c00",
        lore: "Its body glows with inner heat. Can briefly ignite the air around it.",
      },
      {
        id: "ash_lizard",
        name: "Ash Lizard",
        stage: 2,
        baseStats: { hp: 55, mp: 15, atk: 20, def: 18, spd: 12 },
        growth: { hp: 8, mp: 2, atk: 4, def: 4, spd: 2 },
        behavior: {
          wanderlust: 0.5, foraging: 0.6, aggression: 0.4, cowardice: 0.2,
          preferredFood: ["bone"],
          preySpecies: ["dust_mite"],
          predators: [],
        },
        evolutions: [
          {
            to: "cinder_wyrm",
            criteria: [
              { type: "level", target: 20, description: "Reach level 20" },
              { type: "eat", target: 25, subtype: "bone", description: "Eat 25 bones" },
              { type: "prey", target: 10, subtype: "dust_mite", description: "Hunt 10 mites" },
            ],
          },
        ],
        color: "#616161",
        accentColor: "#ff6e40",
        lore: "Coated in volcanic ash. The embers in its belly still glow faintly.",
      },
      {
        id: "spark_salamander",
        name: "Spark Salamander",
        stage: 2,
        baseStats: { hp: 45, mp: 45, atk: 22, def: 10, spd: 18 },
        growth: { hp: 6, mp: 6, atk: 4, def: 2, spd: 3 },
        behavior: {
          wanderlust: 0.7, foraging: 0.6, aggression: 0.35, cowardice: 0.25,
          preferredFood: ["mana_orb", "crystal_shard"],
          preySpecies: ["wisp"],
          predators: [],
        },
        evolutions: [
          {
            to: "plasma_dragon",
            criteria: [
              { type: "level", target: 24, description: "Reach level 24" },
              { type: "eat", target: 20, subtype: "mana_orb", description: "Eat 20 mana orbs" },
              { type: "prey", target: 8, subtype: "wisp", description: "Absorb 8 wisps" },
            ],
          },
        ],
        color: "#ffab40",
        accentColor: "#ffd740",
        lore: "Electric and thermal energy merge in its body. Crackling with potential.",
      },
      {
        id: "drake",
        name: "Drake",
        stage: 3,
        baseStats: { hp: 110, mp: 50, atk: 40, def: 24, spd: 16 },
        growth: { hp: 13, mp: 6, atk: 7, def: 4, spd: 2 },
        behavior: {
          wanderlust: 0.5, foraging: 0.4, aggression: 0.7, cowardice: 0.0,
          preferredFood: ["crystal_shard", "bone"],
          preySpecies: ["cave_beetle", "dust_mite", "cave_serpent"],
          predators: [],
        },
        evolutions: [],
        color: "#d50000",
        accentColor: "#b71c1c",
        lore: "A true fire-breathing drake. The most feared predator of the upper depths.",
      },
      {
        id: "cinder_wyrm",
        name: "Cinder Wyrm",
        stage: 3,
        baseStats: { hp: 100, mp: 25, atk: 34, def: 30, spd: 12 },
        growth: { hp: 12, mp: 3, atk: 6, def: 5, spd: 2 },
        behavior: {
          wanderlust: 0.4, foraging: 0.5, aggression: 0.55, cowardice: 0.0,
          preferredFood: ["bone"],
          preySpecies: ["dust_mite", "cave_beetle"],
          predators: [],
        },
        evolutions: [],
        color: "#424242",
        accentColor: "#ff3d00",
        lore: "A serpentine beast of ash and ember. Where it sleeps, the stone chars black.",
      },
      {
        id: "plasma_dragon",
        name: "Plasma Dragon",
        stage: 3,
        baseStats: { hp: 90, mp: 75, atk: 42, def: 18, spd: 22 },
        growth: { hp: 10, mp: 9, atk: 7, def: 3, spd: 3 },
        behavior: {
          wanderlust: 0.6, foraging: 0.4, aggression: 0.65, cowardice: 0.0,
          preferredFood: ["mana_orb", "crystal_shard"],
          preySpecies: ["wisp", "crystal_sprite"],
          predators: [],
        },
        evolutions: [],
        color: "#ffea00",
        accentColor: "#00e5ff",
        lore: "Lightning and fire fused. A walking thunderstorm with scales and teeth.",
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// LOOKUP HELPERS
// ═══════════════════════════════════════════════════════════════════

/** All monster definitions flattened for quick lookup by id */
export const MONSTER_DEF_BY_ID: Record<string, MonsterDef> = {};
export const MONSTER_FAMILY_BY_ID: Record<string, MonsterFamily> = {};

for (const family of MONSTER_FAMILIES) {
  for (const form of family.forms) {
    MONSTER_DEF_BY_ID[form.id] = form;
    MONSTER_FAMILY_BY_ID[form.id] = family;
  }
}

/**
 * Get all base monster ids that can spawn from a given soil type.
 * Returns an array of { id, weight } sorted by weight desc.
 */
export function getSpawnCandidates(
  soilType: SoilType,
  nutrient: number,
  mana: number
): { id: string; weight: number }[] {
  return MONSTER_FAMILIES
    .filter((f) => {
      const sc = f.spawnCondition;
      if (sc.soilType !== soilType) return false;
      if (sc.minNutrient !== undefined && nutrient < sc.minNutrient) return false;
      if (sc.minMana !== undefined && mana < sc.minMana) return false;
      return true;
    })
    .map((f) => ({ id: f.baseId, weight: f.spawnCondition.weight }))
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Weighted random pick from spawn candidates.
 */
export function pickWeightedSpawn(candidates: { id: string; weight: number }[]): string {
  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const c of candidates) {
    roll -= c.weight;
    if (roll <= 0) return c.id;
  }
  return candidates[candidates.length - 1].id;
}

/**
 * Check if a pet meets all criteria for a given evolution.
 * `stats` is the pet's tracked behavior/stats from the database.
 */
export function checkEvolutionCriteria(
  evolution: Evolution,
  petLevel: number,
  petStats: PetBehaviorStats
): boolean {
  for (const criterion of evolution.criteria) {
    switch (criterion.type) {
      case "level":
        if (petLevel < criterion.target) return false;
        break;
      case "eat":
        if ((petStats.foodEaten[criterion.subtype!] ?? 0) < criterion.target) return false;
        break;
      case "prey":
        if ((petStats.preysHunted[criterion.subtype!] ?? 0) < criterion.target) return false;
        break;
      case "walk":
        if (petStats.tilesWalked < criterion.target) return false;
        break;
      case "combat":
        if (petStats.fightsWon < criterion.target) return false;
        break;
      case "special":
        // Special conditions checked externally
        if (!(petStats.specialFlags || []).includes(criterion.subtype!)) return false;
        break;
    }
  }
  return true;
}

/**
 * Stats tracked per pet in the database for evolution & behavior decisions.
 */
export interface PetBehaviorStats {
  /** Total tiles walked */
  tilesWalked: number;
  /** Total fights won */
  fightsWon: number;
  /** Total fights lost */
  fightsLost: number;
  /** Total exp accumulated */
  totalExp: number;
  /** Food eaten by type: { "mushroom": 5, "moss": 12 } */
  foodEaten: Record<string, number>;
  /** Prey hunted by species: { "dust_mite": 3 } */
  preysHunted: Record<string, number>;
  /** Special condition flags that have been met */
  specialFlags: string[];
}

/** Default empty stats for a newly spawned monster */
export function defaultBehaviorStats(): PetBehaviorStats {
  return {
    tilesWalked: 0,
    fightsWon: 0,
    fightsLost: 0,
    totalExp: 0,
    foodEaten: {},
    preysHunted: {},
    specialFlags: [],
  };
}

/**
 * Calculate level from total exp.
 * Level N requires N * EXP_PER_LEVEL cumulative exp.
 * level 1 = 0 exp, level 2 = 100, level 3 = 300, level 4 = 600...
 * Formula: level = floor((sqrt(1 + 8*exp/EXP_PER_LEVEL) - 1) / 2) + 1, capped at MAX_LEVEL
 */
export function expToLevel(totalExp: number): number {
  // Triangular number formula inverse
  const raw = (Math.sqrt(1 + (8 * totalExp) / EXP_PER_LEVEL) - 1) / 2;
  return Math.min(MAX_LEVEL, Math.max(1, Math.floor(raw) + 1));
}

/**
 * Exp needed to reach a target level.
 * Sum of 1+2+...+(level-1) * EXP_PER_LEVEL = level*(level-1)/2 * EXP_PER_LEVEL
 */
export function levelToExp(level: number): number {
  return (level * (level - 1) / 2) * EXP_PER_LEVEL;
}

// ═══════════════════════════════════════════════════════════════════
// Summary counts
// ═══════════════════════════════════════════════════════════════════

// Quick verification:
// 12 families × ~7-9 forms each = 94 total forms
// Base: 12, Stage 2: ~36, Stage 3: ~46
export const TOTAL_MONSTER_COUNT = Object.keys(MONSTER_DEF_BY_ID).length;
export const BASE_MONSTER_COUNT = MONSTER_FAMILIES.length;
