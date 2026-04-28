/**
 * Enhanced raid simulation engine.
 *
 * Extends the basic pathfinding-based raid with:
 * - Trap detection and effects (spike, poison, decoy, wall mimic, mana drain)
 * - Guard encounters with turn-based combat (via @/game/combat)
 * - Poison damage-over-time tracking
 * - Path penalties from decoy crystals and wall mimics
 * - Full replay data for animation
 *
 * Deterministic given the same seed — uses a seeded PRNG for all randomness.
 */

import { findPath, type GridPos, type PathTile } from "@/lib/pathfinding";
import {
  simulateCombat,
  type Combatant,
  type CombatResult,
  type ElementType,
  type SkillType,
} from "@/game/combat";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RaidPet {
  id: string;
  name: string | null;
  hp: number;
  max_hp: number;
  mp?: number;
  max_mp?: number;
  atk: number;
  def: number;
  spd: number;
  hunger: number;
  element?: string | null;
  skills?: Array<{
    id: string;
    name: string;
    type: string;
    mp_cost: number;
    power: number;
    element: string | null;
    cooldown: number;
  }>;
}

export interface RaidTile {
  local_x: number;
  local_y: number;
  chunk_x: number;
  chunk_y: number;
  type: string;
}

export interface RaidTrap {
  id: string;
  tile_x: number; // global x
  tile_y: number; // global y
  type: "spike_floor" | "poison_gas" | "decoy_crystal" | "wall_mimic" | "mana_drain";
  damage: number;
}

export interface RaidGuard {
  pet: RaidPet;
  chunk_x: number;
  chunk_y: number;
  patrol_radius: number;
}

export interface SimFrame {
  tick: number;
  pets: Array<{
    id: string;
    x: number;
    y: number;
    hp: number;
    action: "move" | "idle" | "dead" | "combat" | "trapped";
  }>;
}

export interface SimEvent {
  tick: number;
  type:
    | "pet_death"
    | "crystal_reached"
    | "raid_start"
    | "raid_end"
    | "trap_triggered"
    | "guard_encounter"
    | "combat_start"
    | "combat_end";
  pet_id?: string;
  guard_id?: string;
  trap_id?: string;
  cause?: string;
  combat_result?: { winner: string; loser: string; turns: number };
}

export interface ReplayData {
  frames: SimFrame[];
  events: SimEvent[];
}

export interface EnhancedRaidResult {
  result: "attacker_win" | "defender_win" | "draw" | "timeout";
  depth_reached: number;
  loot: { resources: Record<string, number> };
  captured_pet_id: string | null;
  energy_drained: number;
  replay_data: ReplayData;
  surviving_pet_ids: string[];
  dead_pet_ids: string[];
  traps_triggered: number;
  guards_defeated: number;
  guards_won: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_TICKS = 200;
const FATIGUE_DAMAGE_PER_10_TILES = 2;
const HUNGER_DAMAGE_THRESHOLD = 0.2;
const CHUNK_W = 20;
const CHUNK_H = 15;

// Resource loot amounts by depth (same table as raid-simulation.ts)
const DEPTH_LOOT_TABLE: Array<{
  minDepth: number;
  mushroom: number;
  moss: number;
  crystal_shard: number;
  bone: number;
  mana_orb: number;
}> = [
  { minDepth: 1, mushroom: 1, moss: 1, crystal_shard: 0, bone: 0, mana_orb: 0 },
  { minDepth: 5, mushroom: 2, moss: 1, crystal_shard: 1, bone: 1, mana_orb: 0 },
  { minDepth: 10, mushroom: 3, moss: 2, crystal_shard: 2, bone: 1, mana_orb: 1 },
  { minDepth: 20, mushroom: 4, moss: 2, crystal_shard: 3, bone: 2, mana_orb: 2 },
  { minDepth: 30, mushroom: 5, moss: 3, crystal_shard: 4, bone: 3, mana_orb: 3 },
];

function getLootForDepth(
  depth: number,
  crystalReached: boolean,
): Record<string, number> {
  if (depth === 0) return {};

  const entry =
    [...DEPTH_LOOT_TABLE].reverse().find((e) => depth >= e.minDepth) ||
    DEPTH_LOOT_TABLE[0];
  const multiplier = crystalReached ? 2.5 : 1;

  return {
    mushroom: Math.ceil(entry.mushroom * multiplier),
    moss: Math.ceil(entry.moss * multiplier),
    crystal_shard: Math.ceil(entry.crystal_shard * multiplier),
    bone: Math.ceil(entry.bone * multiplier),
    mana_orb: Math.ceil(entry.mana_orb * multiplier),
  };
}

// ── Seeded PRNG ──────────────────────────────────────────────────────────────

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

// ── Pet → Combatant conversion ────────────────────────────────────────────────

function raidPetToCombatant(pet: RaidPet): Combatant {
  return {
    id: pet.id,
    name: pet.name ?? "Unknown",
    hp: pet.hp,
    maxHp: pet.max_hp,
    mp: pet.mp ?? 0,
    maxMp: pet.max_mp ?? 0,
    atk: pet.atk,
    def: pet.def,
    spd: pet.spd,
    element: (pet.element ?? "neutral") as ElementType,
    skills: (pet.skills ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type as SkillType,
      mpCost: s.mp_cost,
      power: s.power,
      element: (s.element ?? null) as ElementType | null,
      cooldown: s.cooldown,
      currentCooldown: 0,
    })),
    isDefending: false,
    isStealthed: false,
    buffs: [],
    debuffs: [],
  };
}

// ── Pet state tracking ────────────────────────────────────────────────────────

interface PetState {
  hp: number;
  mp: number;
  pos: GridPos;
  pathIndex: number;
  path: GridPos[] | null;
  dead: boolean;
  tilesWalked: number;
  reachedCrystal: boolean;
  // Trap effects
  poisonTicksRemaining: number;
  poisonDamagePerTick: number;
  delayTicks: number; // ticks where pet is stuck (from decoy/wall_mimic)
  // Combat state
  inCombat: boolean;
  combatTicksRemaining: number;
}

// ── Guard center position ─────────────────────────────────────────────────────

function guardCenter(guard: RaidGuard): GridPos {
  return {
    x: guard.chunk_x * CHUNK_W + Math.floor(CHUNK_W / 2),
    y: guard.chunk_y * CHUNK_H + Math.floor(CHUNK_H / 2),
  };
}

function manhattanDistance(a: GridPos, b: GridPos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// ── Trap lookup ───────────────────────────────────────────────────────────────

function buildTrapMap(traps: RaidTrap[]): Map<string, RaidTrap> {
  const map = new Map<string, RaidTrap>();
  for (const trap of traps) {
    map.set(`${trap.tile_x},${trap.tile_y}`, trap);
  }
  return map;
}

// ── Main simulation ──────────────────────────────────────────────────────────

/**
 * Simulate an enhanced raid with pathfinding, traps, guards, and combat.
 *
 * @param tiles - Dungeon tile layout
 * @param pets - Attacking pets
 * @param traps - Traps placed in the dungeon
 * @param guards - Guard pets defending the dungeon
 * @param seed - Random seed for determinism
 * @param crystalPos - Global coordinates of the crystal
 * @param entrancePos - Global coordinates of the entrance
 */
export function simulateEnhancedRaid(
  tiles: RaidTile[],
  pets: RaidPet[],
  traps: RaidTrap[],
  guards: RaidGuard[],
  seed: number,
  crystalPos: { x: number; y: number },
  entrancePos: { x: number; y: number },
): EnhancedRaidResult {
  const rng = new SeededRandom(seed);

  const frames: SimFrame[] = [];
  const events: SimEvent[] = [];

  events.push({ tick: 0, type: "raid_start" });

  // Build path from entrance to crystal
  const fullPath = findPath(
    tiles as PathTile[],
    entrancePos as GridPos,
    crystalPos as GridPos,
  );

  if (!fullPath) {
    // No path to crystal — automatic defender win
    events.push({ tick: 0, type: "raid_end" });
    return {
      result: "defender_win",
      depth_reached: 0,
      loot: { resources: {} },
      captured_pet_id: null,
      energy_drained: 0,
      replay_data: { frames, events },
      surviving_pet_ids: [],
      dead_pet_ids: pets.map((p) => p.id),
      traps_triggered: 0,
      guards_defeated: 0,
      guards_won: 0,
    };
  }

  // Build trap lookup
  const trapMap = buildTrapMap(traps);
  const triggeredTraps = new Set<string>(); // trap IDs already triggered

  // Track defeated guards
  const defeatedGuardIds = new Set<string>();

  // Initialize pet state
  const petState = new Map<string, PetState>();

  for (const pet of pets) {
    const startPos: GridPos = { x: entrancePos.x, y: entrancePos.y };

    petState.set(pet.id, {
      hp: pet.hp,
      mp: pet.mp ?? 0,
      pos: startPos,
      pathIndex: 0,
      path: [...fullPath],
      dead: false,
      tilesWalked: 0,
      reachedCrystal: false,
      poisonTicksRemaining: 0,
      poisonDamagePerTick: 0,
      delayTicks: 0,
      inCombat: false,
      combatTicksRemaining: 0,
    });
  }

  let maxDepthReached = 0;
  let crystalReached = false;
  let trapsTriggered = 0;
  let guardsDefeated = 0;
  let guardsWon = 0;

  // ── Simulation loop ──────────────────────────────────────────────────────

  for (let tick = 0; tick < MAX_TICKS; tick++) {
    const frameState: SimFrame["pets"] = [];
    let anyAlive = false;
    let anyMoving = false;

    for (const pet of pets) {
      const state = petState.get(pet.id)!;

      // Dead pet
      if (state.dead) {
        frameState.push({
          id: pet.id,
          x: state.pos.x,
          y: state.pos.y,
          hp: 0,
          action: "dead",
        });
        continue;
      }

      anyAlive = true;

      // Already reached crystal — idle
      if (state.reachedCrystal) {
        frameState.push({
          id: pet.id,
          x: crystalPos.x,
          y: crystalPos.y,
          hp: state.hp,
          action: "idle",
        });
        continue;
      }

      // ── Apply poison DOT ────────────────────────────────────────────────
      if (state.poisonTicksRemaining > 0) {
        state.hp -= state.poisonDamagePerTick;
        state.poisonTicksRemaining--;

        if (state.hp <= 0) {
          state.dead = true;
          events.push({
            tick,
            type: "pet_death",
            pet_id: pet.id,
            cause: "poison",
          });
          frameState.push({
            id: pet.id,
            x: state.pos.x,
            y: state.pos.y,
            hp: 0,
            action: "dead",
          });
          continue;
        }
      }

      // ── Delayed (from decoy_crystal / wall_mimic) ──────────────────────
      if (state.delayTicks > 0) {
        state.delayTicks--;
        frameState.push({
          id: pet.id,
          x: state.pos.x,
          y: state.pos.y,
          hp: Math.max(0, state.hp),
          action: "trapped",
        });
        continue;
      }

      // ── Move along path ─────────────────────────────────────────────────
      if (state.path && state.pathIndex < state.path.length - 1) {
        state.pathIndex++;
        state.pos = state.path[state.pathIndex];
        state.tilesWalked++;
        anyMoving = true;

        // Track depth (Manhattan distance from entrance)
        const depth =
          Math.abs(state.pos.x - entrancePos.x) +
          Math.abs(state.pos.y - entrancePos.y);
        if (depth > maxDepthReached) maxDepthReached = depth;

        // ── Check for trap at current position ────────────────────────────
        const posKey = `${state.pos.x},${state.pos.y}`;
        const trap = trapMap.get(posKey);
        if (trap && !triggeredTraps.has(trap.id)) {
          triggeredTraps.add(trap.id);
          trapsTriggered++;
          events.push({
            tick,
            type: "trap_triggered",
            pet_id: pet.id,
            trap_id: trap.id,
            cause: trap.type,
          });

          switch (trap.type) {
            case "spike_floor": {
              // Direct damage
              state.hp -= trap.damage;
              break;
            }
            case "poison_gas": {
              // Damage over time: trap.damage / 3 per tick for 3 ticks
              state.poisonTicksRemaining = 3;
              state.poisonDamagePerTick = Math.max(1, Math.floor(trap.damage / 3));
              break;
            }
            case "decoy_crystal": {
              // Pet takes wrong path — adds 20% more tiles to walk
              const remainingPath =
                state.path.length - state.pathIndex;
              const extraDelay = Math.max(
                1,
                Math.ceil(remainingPath * 0.2),
              );
              state.delayTicks += extraDelay;
              break;
            }
            case "wall_mimic": {
              // Pet blocked — must find alternate path (+10 tiles penalty)
              state.delayTicks += 10;
              break;
            }
            case "mana_drain": {
              // Reduce pet MP by 30%
              state.mp = Math.max(0, Math.floor(state.mp * 0.7));
              break;
            }
          }

          // Check if trap killed the pet
          if (state.hp <= 0) {
            state.dead = true;
            events.push({
              tick,
              type: "pet_death",
              pet_id: pet.id,
              cause: `trap:${trap.type}`,
            });
            frameState.push({
              id: pet.id,
              x: state.pos.x,
              y: state.pos.y,
              hp: 0,
              action: "dead",
            });
            continue;
          }
        }

        // ── Check for guard encounters ─────────────────────────────────────
        for (const guard of guards) {
          if (defeatedGuardIds.has(guard.pet.id)) continue;

          const center = guardCenter(guard);
          const dist = manhattanDistance(state.pos, center);

          if (dist <= guard.patrol_radius) {
            // Guard encounter! Start combat
            events.push({
              tick,
              type: "guard_encounter",
              pet_id: pet.id,
              guard_id: guard.pet.id,
            });
            events.push({
              tick,
              type: "combat_start",
              pet_id: pet.id,
              guard_id: guard.pet.id,
            });

            // Derive combat seed from main seed + tick + pet/guard indices
            const combatSeed =
              seed * 31 + tick * 7919 + pets.indexOf(pet) * 13 + guards.indexOf(guard) * 7 + 1;

            // Convert pets to combatants
            // Use current pet HP/MP (may be reduced from traps/fatigue)
            const attackerPet: RaidPet = {
              ...pet,
              hp: state.hp,
              mp: state.mp,
            };
            const attackerCombatant = raidPetToCombatant(attackerPet);
            const defenderCombatant = raidPetToCombatant(guard.pet);

            const combatResult: CombatResult = simulateCombat(
              attackerCombatant,
              defenderCombatant,
              20,
              combatSeed,
            );

            events.push({
              tick,
              type: "combat_end",
              pet_id: pet.id,
              guard_id: guard.pet.id,
              combat_result: {
                winner: combatResult.winnerId,
                loser: combatResult.loserId,
                turns: combatResult.turns,
              },
            });

            if (combatResult.winnerId === pet.id) {
              // Attacker wins — update HP, guard defeated
              state.hp = Math.max(1, combatResult.winnerHp);
              defeatedGuardIds.add(guard.pet.id);
              guardsDefeated++;
            } else {
              // Guard wins — attacker pet dies
              state.hp = 0;
              state.dead = true;
              guardsWon++;
              events.push({
                tick,
                type: "pet_death",
                pet_id: pet.id,
                cause: `guard:${guard.pet.id}`,
              });
              frameState.push({
                id: pet.id,
                x: state.pos.x,
                y: state.pos.y,
                hp: 0,
                action: "dead",
              });
              break; // Stop checking more guards — pet is dead
            }
          }
        }

        // If pet died from combat, skip further processing
        if (state.dead) continue;

        // ── Apply fatigue every 10 tiles ────────────────────────────────────
        if (state.tilesWalked % 10 === 0) {
          const fatigue =
            FATIGUE_DAMAGE_PER_10_TILES + (rng.next() < 0.3 ? 1 : 0);
          state.hp -= fatigue;
        }

        // ── Apply hunger damage ────────────────────────────────────────────
        if (pet.hunger < HUNGER_DAMAGE_THRESHOLD && tick % 5 === 0) {
          state.hp -= 1;
        }

        // ── Check if reached crystal ───────────────────────────────────────
        if (state.pathIndex === state.path.length - 1) {
          state.reachedCrystal = true;
          crystalReached = true;
          events.push({
            tick,
            type: "crystal_reached",
            pet_id: pet.id,
          });
        }

        // ── Check for death ────────────────────────────────────────────────
        if (state.hp <= 0 && !state.dead) {
          state.dead = true;
          events.push({
            tick,
            type: "pet_death",
            pet_id: pet.id,
            cause: "fatigue",
          });
        }

        frameState.push({
          id: pet.id,
          x: state.pos.x,
          y: state.pos.y,
          hp: Math.max(0, state.hp),
          action: state.dead ? "dead" : "move",
        });
      } else {
        // No path or at end of path without reaching crystal — idle
        frameState.push({
          id: pet.id,
          x: state.pos.x,
          y: state.pos.y,
          hp: Math.max(0, state.hp),
          action: "idle",
        });
      }
    }

    frames.push({ tick, pets: frameState });

    // Check termination conditions
    const allDead = pets.every((p) => petState.get(p.id)!.dead);
    const allResolved = pets.every(
      (p) => petState.get(p.id)!.dead || petState.get(p.id)!.reachedCrystal,
    );

    if (allDead || allResolved) break;
  }

  events.push({ tick: frames.length, type: "raid_end" });

  // ── Determine result ──────────────────────────────────────────────────────

  const survivingPetIds = pets
    .filter((p) => !petState.get(p.id)!.dead)
    .map((p) => p.id);
  const deadPetIds = pets
    .filter((p) => petState.get(p.id)!.dead)
    .map((p) => p.id);

  let result: EnhancedRaidResult["result"];
  let energyDrained: number;

  if (crystalReached) {
    result = "attacker_win";
    energyDrained = 40 + Math.floor(rng.next() * 20); // 40–60
  } else if (survivingPetIds.length === 0) {
    result = "defender_win";
    energyDrained = 0;
  } else if (maxDepthReached >= 10) {
    result = "draw";
    energyDrained = 10 + Math.floor(rng.next() * 20); // 10–30
  } else {
    result = "defender_win";
    energyDrained = 5;
  }

  const loot = getLootForDepth(maxDepthReached, crystalReached);

  return {
    result,
    depth_reached: maxDepthReached,
    loot: { resources: loot },
    captured_pet_id: null,
    energy_drained: energyDrained,
    replay_data: { frames, events },
    surviving_pet_ids: survivingPetIds,
    dead_pet_ids: deadPetIds,
    traps_triggered: trapsTriggered,
    guards_defeated: guardsDefeated,
    guards_won: guardsWon,
  };
}