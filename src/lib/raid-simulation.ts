/**
 * Raid simulation engine.
 *
 * Runs a deterministic simulation of a raid using:
 * - A snapshot of the defender's dungeon (tile layout)
 * - A random seed (makes it deterministic for replays)
 * - The attacking pets' stats
 */

import { findPath, findEntrance, findCrystal, type GridPos, type PathTile } from "./pathfinding";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RaidPet {
  id: string;
  name: string | null;
  hp: number;
  max_hp: number;
  atk: number;
  def: number;
  spd: number;
  hunger: number;
}

export interface RaidTile {
  local_x: number;
  local_y: number;
  chunk_x: number;
  chunk_y: number;
  type: string;
}

export interface SimFrame {
  tick: number;
  pets: Array<{
    id: string;
    x: number;
    y: number;
    hp: number;
    action: "move" | "idle" | "dead";
  }>;
}

export interface SimEvent {
  tick: number;
  type: "pet_death" | "crystal_reached" | "raid_start" | "raid_end";
  pet_id?: string;
  cause?: string;
}

export interface ReplayData {
  frames: SimFrame[];
  events: SimEvent[];
}

export interface RaidResult {
  result: "attacker_win" | "defender_win" | "draw" | "timeout";
  depth_reached: number;
  loot: { resources: Record<string, number> };
  captured_pet_id: string | null;
  energy_drained: number;
  replay_data: ReplayData;
  surviving_pet_ids: string[];
  dead_pet_ids: string[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_TICKS = 200;
const FATIGUE_DAMAGE_PER_10_TILES = 2; // -2 HP per 10 tiles walked
const HUNGER_DAMAGE_THRESHOLD = 0.2; // extra damage if pet is starving

// Resource loot amounts by depth
const DEPTH_LOOT_TABLE: Array<{ minDepth: number; mushroom: number; moss: number; crystal_shard: number; bone: number; mana_orb: number }> = [
  { minDepth: 1,  mushroom: 1, moss: 1, crystal_shard: 0, bone: 0, mana_orb: 0 },
  { minDepth: 5,  mushroom: 2, moss: 1, crystal_shard: 1, bone: 1, mana_orb: 0 },
  { minDepth: 10, mushroom: 3, moss: 2, crystal_shard: 2, bone: 1, mana_orb: 1 },
  { minDepth: 20, mushroom: 4, moss: 2, crystal_shard: 3, bone: 2, mana_orb: 2 },
  { minDepth: 30, mushroom: 5, moss: 3, crystal_shard: 4, bone: 3, mana_orb: 3 },
];

function getLootForDepth(depth: number, crystalReached: boolean): Record<string, number> {
  if (depth === 0) return {};

  const entry = [...DEPTH_LOOT_TABLE].reverse().find((e) => depth >= e.minDepth) || DEPTH_LOOT_TABLE[0];
  const multiplier = crystalReached ? 2.5 : 1;

  return {
    mushroom: Math.ceil(entry.mushroom * multiplier),
    moss: Math.ceil(entry.moss * multiplier),
    crystal_shard: Math.ceil(entry.crystal_shard * multiplier),
    bone: Math.ceil(entry.bone * multiplier),
    mana_orb: Math.ceil(entry.mana_orb * multiplier),
  };
}

// ── Seeded PRNG ───────────────────────────────────────────────────────────────

class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) & 0xffffffff;
    return (this.seed >>> 0) / 0xffffffff;
  }
}

// ── Simulation ────────────────────────────────────────────────────────────────

export function simulateRaid(
  tiles: RaidTile[],
  pets: RaidPet[],
  seed: number
): RaidResult {
  const rng = new SeededRandom(seed);

  // Find start and crystal
  const entrance = findEntrance(tiles as PathTile[]);
  const crystal = findCrystal(tiles as PathTile[]);

  const frames: SimFrame[] = [];
  const events: SimEvent[] = [];

  events.push({ tick: 0, type: "raid_start" });

  if (!entrance || !crystal) {
    // Degenerate dungeon — automatic defender win
    return {
      result: "defender_win",
      depth_reached: 0,
      loot: { resources: {} },
      captured_pet_id: null,
      energy_drained: 0,
      replay_data: { frames, events },
      surviving_pet_ids: [],
      dead_pet_ids: pets.map((p) => p.id),
    };
  }

  // Build the path from entrance to crystal
  const fullPath = findPath(tiles as PathTile[], entrance, crystal);

  // State per pet
  const petState = new Map<
    string,
    {
      hp: number;
      pos: GridPos;
      pathIndex: number;
      path: GridPos[] | null;
      dead: boolean;
      tilesWalked: number;
      reachedCrystal: boolean;
    }
  >();

  for (const pet of pets) {
    // Each pet independently navigates to crystal
    // Small variance in starting position from entrance
    const startPos = {
      x: entrance.x + Math.floor(rng.next() * 3) - 1,
      y: entrance.y,
    };

    // Clamp to valid entrance
    const actualStart = entrance;

    petState.set(pet.id, {
      hp: pet.hp,
      pos: actualStart,
      pathIndex: 0,
      path: fullPath ? [...fullPath] : null,
      dead: false,
      tilesWalked: 0,
      reachedCrystal: false,
    });
  }

  let maxDepthReached = 0;
  let crystalReached = false;
  let crystalReachingPetId: string | null = null;

  for (let tick = 0; tick < MAX_TICKS; tick++) {
    const frameState: SimFrame["pets"] = [];
    let anyAlive = false;

    for (const pet of pets) {
      const state = petState.get(pet.id)!;

      if (state.dead) {
        frameState.push({ id: pet.id, x: state.pos.x, y: state.pos.y, hp: 0, action: "dead" });
        continue;
      }

      anyAlive = true;

      if (state.reachedCrystal) {
        frameState.push({ id: pet.id, x: crystal.x, y: crystal.y, hp: state.hp, action: "idle" });
        continue;
      }

      // Move along path
      if (state.path && state.pathIndex < state.path.length - 1) {
        state.pathIndex++;
        state.pos = state.path[state.pathIndex];
        state.tilesWalked++;

        // Track depth (distance from entrance)
        const depth = Math.abs(state.pos.x - entrance.x) + Math.abs(state.pos.y - entrance.y);
        if (depth > maxDepthReached) maxDepthReached = depth;

        // Apply fatigue every 10 tiles
        if (state.tilesWalked % 10 === 0) {
          const fatigue = FATIGUE_DAMAGE_PER_10_TILES + (rng.next() < 0.3 ? 1 : 0);
          state.hp -= fatigue;
        }

        // Extra damage if hungry
        if (pet.hunger < HUNGER_DAMAGE_THRESHOLD && tick % 5 === 0) {
          state.hp -= 1;
        }

        // Check if reached crystal
        if (state.pathIndex === state.path.length - 1) {
          state.reachedCrystal = true;
          crystalReached = true;
          if (!crystalReachingPetId) crystalReachingPetId = pet.id;
          events.push({ tick, type: "crystal_reached", pet_id: pet.id });
        }

        frameState.push({ id: pet.id, x: state.pos.x, y: state.pos.y, hp: Math.max(0, state.hp), action: "move" });
      } else if (!state.path || state.pathIndex >= (state.path?.length ?? 0) - 1) {
        // No path to crystal — pet wanders randomly
        state.tilesWalked++;
        frameState.push({ id: pet.id, x: state.pos.x, y: state.pos.y, hp: Math.max(0, state.hp), action: "idle" });
      }

      // Check death
      if (state.hp <= 0 && !state.dead) {
        state.dead = true;
        events.push({ tick, type: "pet_death", pet_id: pet.id, cause: "fatigue" });
        frameState.push({ id: pet.id, x: state.pos.x, y: state.pos.y, hp: 0, action: "dead" });
      }
    }

    frames.push({ tick, pets: frameState });

    if (!anyAlive || (crystalReached && pets.every((p) => petState.get(p.id)!.dead || petState.get(p.id)!.reachedCrystal))) {
      break;
    }
  }

  events.push({ tick: frames.length, type: "raid_end" });

  const survivingPetIds = pets.filter((p) => {
    const s = petState.get(p.id)!;
    return !s.dead;
  }).map((p) => p.id);

  const deadPetIds = pets.filter((p) => {
    const s = petState.get(p.id)!;
    return s.dead;
  }).map((p) => p.id);

  // Determine result
  let result: RaidResult["result"];
  let energyDrained: number;

  if (crystalReached) {
    result = "attacker_win";
    energyDrained = 40 + Math.floor(rng.next() * 20); // 40-60
  } else if (survivingPetIds.length === 0) {
    result = "defender_win";
    energyDrained = 0;
  } else if (maxDepthReached >= 10) {
    result = "draw";
    energyDrained = 10 + Math.floor(rng.next() * 20); // 10-30
  } else {
    result = "defender_win";
    energyDrained = 5;
  }

  // Calculate loot
  const loot = getLootForDepth(maxDepthReached, crystalReached);

  return {
    result,
    depth_reached: maxDepthReached,
    loot: { resources: loot },
    captured_pet_id: null, // Chosen by player after win — not auto-assigned
    energy_drained: energyDrained,
    replay_data: { frames, events },
    surviving_pet_ids: survivingPetIds,
    dead_pet_ids: deadPetIds,
  };
}
