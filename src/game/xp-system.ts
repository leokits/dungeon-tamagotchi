// XP and level progression system — pure, deterministic functions

export const XP_TABLE: Record<number, number> = (() => {
  const table: Record<number, number> = {};
  let cumulative = 0;
  for (let level = 2; level <= 100; level++) {
    cumulative += Math.floor(100 * Math.pow(1.2, level - 2));
    table[level] = cumulative;
  }
  return table;
})();

export const XP_SOURCES = {
  dig_tile: 1,
  feed_pet: 2,
  win_raid: 10,
  evolve_pet: 50,
  complete_quest: 25,
  discover_new_form: 5,
  defeat_guard: 15,
} as const;

interface LevelUnlock {
  type: string;
  description: string;
}

const LEVEL_UNLOCKS: Record<number, LevelUnlock[]> = {
  5: [{ type: "pet_slots", description: "+2 pet slots" }],
  10: [{ type: "trap", description: "Unlock poison_gas trap type" }],
  15: [
    { type: "pet_slots", description: "+2 pet slots" },
    { type: "trap", description: "Unlock decoy_crystal trap" },
  ],
  20: [{ type: "trap", description: "Unlock wall_mimic trap" }],
  25: [
    { type: "pet_slots", description: "+4 pet slots" },
    { type: "trap", description: "Unlock mana_drain trap" },
  ],
  30: [{ type: "egg", description: "Unlock rare egg type" }],
  50: [
    { type: "pet_slots", description: "+6 pet slots" },
    { type: "egg", description: "Unlock legendary egg type" },
  ],
  75: [{ type: "pet_slots", description: "+8 pet slots" }],
  100: [{ type: "title", description: 'Max level title "Deepborn Master"' }],
};

const UNLOCK_LEVELS = [5, 10, 15, 20, 25, 30, 50, 75, 100];

export function calcLevel(xp: number): number {
  if (xp <= 0) return 1;
  for (let level = 100; level >= 2; level--) {
    if (xp >= XP_TABLE[level]) return level;
  }
  return 1;
}

/**
 * Returns total cumulative XP needed to reach a given level.
 * Level 1 requires 0 XP.
 */
export function calcXpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level > 100) return XP_TABLE[100];
  return XP_TABLE[level] ?? 0;
}

/**
 * Returns progress toward the next level.
 */
export function calcXpProgress(xp: number): {
  current: number;
  needed: number;
  level: number;
} {
  const level = calcLevel(xp);
  if (level >= 100) {
    return { current: xp, needed: XP_TABLE[100], level };
  }
  const currentLevelXp = calcXpForLevel(level);
  const nextLevelXp = calcXpForLevel(level + 1);
  return {
    current: xp - currentLevelXp,
    needed: nextLevelXp - currentLevelXp,
    level,
  };
}

/**
 * Calculate total XP from a batch of actions.
 */
export function calcXpReward(
  actions: Array<{ source: keyof typeof XP_SOURCES; count: number }>
): number {
  return actions.reduce(
    (total, { source, count }) => total + (XP_SOURCES[source] ?? 0) * count,
    0
  );
}

/**
 * Returns all unlocks earned up to and including the given level.
 */
export function getLevelUnlocks(level: number): LevelUnlock[] {
  const unlocks: LevelUnlock[] = [];
  for (const milestone of UNLOCK_LEVELS) {
    if (milestone <= level) {
      unlocks.push(...LEVEL_UNLOCKS[milestone]);
    }
  }
  return unlocks;
}
