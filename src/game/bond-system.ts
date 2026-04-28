/**
 * Pet bond system — pure functions for calculating bond levels, XP, and combat bonuses.
 *
 * Bond levels represent the relationship strength between a pet and its trainer.
 * Higher bond levels grant ATK/DEF bonuses and combo attack chances during raids.
 */

// ═══════════════════════════════════════════════════════════════════
// BOND LEVEL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

export interface BondLevelDef {
  level: number;
  name: string;
  bonus: string;
}

export const BOND_LEVELS: BondLevelDef[] = [
  { level: 0, name: "Strangers", bonus: "No bonus" },
  { level: 1, name: "Acquaintances", bonus: "+2% ATK when fighting together" },
  { level: 2, name: "Friends", bonus: "+4% ATK" },
  { level: 3, name: "Companions", bonus: "+6% ATK, +2% DEF" },
  { level: 4, name: "Allies", bonus: "+8% ATK, +4% DEF" },
  { level: 5, name: "Partners", bonus: "+10% ATK, +6% DEF, 5% combo attack" },
  { level: 6, name: "Close Partners", bonus: "+12% ATK, +8% DEF, 10% combo attack" },
  { level: 7, name: "Soul Bonds", bonus: "+15% ATK, +10% DEF, 15% combo attack" },
  { level: 8, name: "Eternal Bonds", bonus: "+18% ATK, +12% DEF, 20% combo attack" },
  { level: 9, name: "Deepborn Link", bonus: "+20% ATK, +15% DEF, 25% combo attack" },
];

// ═══════════════════════════════════════════════════════════════════
// BOND XP TABLE
// ═══════════════════════════════════════════════════════════════════

/** XP needed to reach each bond level (index = target level). */
export const BOND_XP_TABLE: Record<number, number> = {
  1: 100,
  2: 200,
  3: 350,
  4: 500,
  5: 750,
  6: 1000,
  7: 1500,
  8: 2000,
  9: 3000,
};

// ═══════════════════════════════════════════════════════════════════
// BOND XP SOURCES
// ═══════════════════════════════════════════════════════════════════

export const BOND_XP_SOURCES = {
  raid_together: 5,
  feed_same_time: 1,
  evolve_together: 20,
} as const;

export type BondXpSource = keyof typeof BOND_XP_SOURCES;

// ═══════════════════════════════════════════════════════════════════
// CORE CALCULATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * XP needed to reach a specific bond level from the previous level.
 * Returns 0 for level 0 (no XP needed to be a stranger).
 */
export function calcBondXpForLevel(level: number): number {
  if (level <= 0) return 0;
  return BOND_XP_TABLE[level] ?? 0;
}

/**
 * Determine current bond level from total accumulated bond XP.
 */
export function calcBondLevel(bondXp: number): number {
  if (bondXp <= 0) return 0;

  let level = 0;
  for (let i = 1; i <= 9; i++) {
    const threshold = BOND_XP_TABLE[i];
    if (bondXp >= threshold) {
      level = i;
    } else {
      break;
    }
  }
  return level;
}

/**
 * Calculate total bond XP gained from a set of actions.
 */
export function calcBondReward(
  actions: Array<{ source: BondXpSource; count: number }>
): number {
  let total = 0;
  for (const action of actions) {
    const xpPerAction = BOND_XP_SOURCES[action.source];
    total += xpPerAction * action.count;
  }
  return total;
}

/**
 * Get ATK/DEF/combo bonuses for a given bond level.
 */
export function getBondBonus(bondLevel: number): {
  atkBonus: number;
  defBonus: number;
  comboChance: number;
} {
  const clampedLevel = Math.max(0, Math.min(9, bondLevel));

  const atkBonusMap: Record<number, number> = {
    0: 0, 1: 2, 2: 4, 3: 6, 4: 8, 5: 10, 6: 12, 7: 15, 8: 18, 9: 20,
  };
  const defBonusMap: Record<number, number> = {
    0: 0, 1: 0, 2: 0, 3: 2, 4: 4, 5: 6, 6: 8, 7: 10, 8: 12, 9: 15,
  };
  const comboMap: Record<number, number> = {
    0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 5, 6: 10, 7: 15, 8: 20, 9: 25,
  };

  return {
    atkBonus: atkBonusMap[clampedLevel] ?? 0,
    defBonus: defBonusMap[clampedLevel] ?? 0,
    comboChance: comboMap[clampedLevel] ?? 0,
  };
}

/**
 * Get the display name for a bond level.
 */
export function getBondName(level: number): string {
  const clampedLevel = Math.max(0, Math.min(9, level));
  return BOND_LEVELS[clampedLevel]?.name ?? "Strangers";
}

/**
 * Check if a combo attack triggers based on bond level.
 * Uses the provided RNG function for determinism.
 *
 * @param bondLevel - Current bond level
 * @param rng - Function returning a value in [0, 1)
 * @returns true if combo attack triggers
 */
export function checkComboAttack(bondLevel: number, rng: () => number): boolean {
  const { comboChance } = getBondBonus(bondLevel);
  if (comboChance <= 0) return false;
  return rng() * 100 < comboChance;
}

/**
 * Get XP progress info for a bond level.
 * Returns current XP toward next level and the threshold.
 */
export function getBondProgress(bondXp: number): {
  currentLevel: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progress: number; // 0-1
  hasMaxLevel: boolean;
} {
  const currentLevel = calcBondLevel(bondXp);
  const hasMaxLevel = currentLevel >= 9;

  const currentLevelThreshold = currentLevel > 0 ? BOND_XP_TABLE[currentLevel] ?? 0 : 0;
  const nextLevelThreshold = BOND_XP_TABLE[currentLevel + 1] ?? BOND_XP_TABLE[9];

  const progress = hasMaxLevel
    ? 1
    : (bondXp - currentLevelThreshold) / (nextLevelThreshold - currentLevelThreshold);

  return {
    currentLevel,
    currentLevelXp: currentLevelThreshold,
    nextLevelXp: nextLevelThreshold,
    progress: Math.min(1, Math.max(0, progress)),
    hasMaxLevel,
  };
}
