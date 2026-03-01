import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { ResourceType, PetBehaviorStats } from "@/types/database";
import {
  MONSTER_DEF_BY_ID,
  MONSTER_FAMILY_BY_ID,
  calcDamage,
  speedCheck,
  levelGapMultiplier,
  BASE_EXP_PER_KILL,
  EXP_PER_LEVEL,
  MAX_LEVEL,
  checkEvolutionCriteria,
  expToLevel,
  defaultBehaviorStats,
} from "@/game/monsters";

// Map legacy pet species to new bestiary IDs
const LEGACY_SPECIES_MAP: Record<string, string> = {
  shroom_slime: "glob_slime",
  stone_crawler: "cave_beetle",
};
function resolveSpecies(species: string, baseType: string): string {
  const raw = species || baseType;
  return LEGACY_SPECIES_MAP[raw] || raw;
}

// Dev-only tick endpoint: authenticated via session, processes only the current player.
// Accepts optional overrides via JSON body for admin menu tuning.

const RESOURCE_HUNGER_VALUES: Record<string, number> = {
  mushroom: 0.15,
  crystal_shard: 0.1,
  bone: 0.12,
  mana_orb: 0.08,
  moss: 0.2,
};

interface DevTickParams {
  dustMultiplier?: number; // default 1
  crystalGrowthRate?: number; // default 1.7 per hour
  petMoveChance?: number; // 0-1, default 1 (always move)
  hatchSpeedMultiplier?: number; // default 1 (1 = normal, 10 = 10x faster)
  regrowthSpeed?: number; // default 1 — multiplier for resource regrowth speed (higher = faster)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let params: DevTickParams = {};
  try {
    const body = await request.json();
    params = body ?? {};
  } catch {
    // no body is fine
  }

  const serviceClient = createServiceClient();
  const now = new Date();

  // Get player (auth_id = supabase auth user id, id = internal player uuid)
  const { data: player } = await serviceClient
    .from("players")
    .select("*")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const result = await processDevTick(serviceClient, player, now, params);

  return NextResponse.json(result);
}

async function processDevTick(
  supabase: ReturnType<typeof createServiceClient>,
  player: { id: string; last_tick_at: string; chrono_dust: number },
  now: Date,
  params: DevTickParams
) {
  const dustMultiplier = params.dustMultiplier ?? 1;
  const crystalGrowthRate = params.crystalGrowthRate ?? 1.7;
  const petMoveChance = params.petMoveChance ?? 1;
  const hatchSpeedMultiplier = params.hatchSpeedMultiplier ?? 1;
  const regrowthSpeed = Math.max(0.1, params.regrowthSpeed ?? 1);

  // 1. Chrono Dust — scaled by crystal energy + dev multiplier
  const { data: dungeon } = await supabase
    .from("dungeons")
    .select("*")
    .eq("player_id", player.id)
    .single();

  if (!dungeon) return { player_id: player.id, status: "no_dungeon" };

  const crystalEnergyPct = (dungeon.crystal_energy ?? 100) / 100;
  const dustRate = Math.max(0.1, crystalEnergyPct) * dustMultiplier;
  const dustGained = Math.max(1, Math.floor(dustRate));
  const newDust = player.chrono_dust + dustGained;

  await supabase
    .from("players")
    .update({
      chrono_dust: newDust,
      last_tick_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", player.id);

  // 2. Crystal energy growth
  // crystalGrowthRate = per hour. Dev tick fires frequently so give proportional amount.
  // We just give a small chunk per tick call:
  const energyGain = crystalGrowthRate / 12; // as if 5-min tick
  const newEnergy = Math.min(100, dungeon.crystal_energy + energyGain);

  await supabase
    .from("dungeons")
    .update({
      crystal_energy: newEnergy,
      updated_at: now.toISOString(),
    })
    .eq("id", dungeon.id);

  // 3. Resource regrowth — check tiles with regrow_at <= now
  const crystalFactor = Math.max(0.01, newEnergy / 100);
  let resourcesSpawned = 0;

  const { data: regrowTiles } = await supabase
    .from("tiles")
    .select("*")
    .eq("dungeon_id", dungeon.id)
    .not("regrow_at", "is", null)
    .lte("regrow_at", now.toISOString())
    .in("type", ["corridor", "packed", "solid"]);

  if (regrowTiles && regrowTiles.length > 0) {
    const tileIds = regrowTiles.map((t) => t.id);
    const { data: existingResources } = await supabase
      .from("resources")
      .select("tile_id")
      .in("tile_id", tileIds);

    const tilesWithResource = new Set(
      (existingResources || []).map((r) => r.tile_id)
    );

    const newResources = [];

    for (const tile of regrowTiles) {
      if (tilesWithResource.has(tile.id)) continue;

      const resourceType = determineResourceType(tile.nutrient, tile.mana);
      newResources.push({
        tile_id: tile.id,
        dungeon_id: dungeon.id,
        type: resourceType,
        quantity: 1,
      });

      const baseHours =
        tile.type === "solid" ? 24 : tile.type === "corridor" ? 6 : 2;
      const actualMs = (baseHours / crystalFactor / regrowthSpeed) * 60 * 60 * 1000;
      const nextRegrow = new Date(now.getTime() + actualMs).toISOString();

      await supabase
        .from("tiles")
        .update({ regrow_at: nextRegrow })
        .eq("id", tile.id);
    }

    if (newResources.length > 0) {
      await supabase.from("resources").insert(newResources);
      resourcesSpawned = newResources.length;
    }
  }

  // Fast-forward future regrow_at timers when regrowthSpeed > 1
  if (regrowthSpeed > 1) {
    const { data: futureRegrowTiles } = await supabase
      .from("tiles")
      .select("id, regrow_at")
      .eq("dungeon_id", dungeon.id)
      .not("regrow_at", "is", null)
      .gt("regrow_at", now.toISOString());

    if (futureRegrowTiles && futureRegrowTiles.length > 0) {
      for (const tile of futureRegrowTiles) {
        const remaining = new Date(tile.regrow_at).getTime() - now.getTime();
        const accelerated = remaining / regrowthSpeed;
        const newRegrow = new Date(now.getTime() + accelerated).toISOString();
        await supabase
          .from("tiles")
          .update({ regrow_at: newRegrow })
          .eq("id", tile.id);
      }
    }
  }

  // 4. Pet movement + eating + combat + evolution
  let petsMoved = 0;
  let combatsFought = 0;
  let evolutions = 0;
  const { data: alivePets } = await supabase
    .from("pets")
    .select("*")
    .eq("dungeon_id", dungeon.id)
    .eq("status", "alive");

  if (alivePets && alivePets.length > 0) {
    // Phase A: Movement + eating
    for (const pet of alivePets) {
      if (Math.random() > petMoveChance) continue;
      await processPetMovement(supabase, pet, dungeon.id, now);
      petsMoved++;
    }

    // Phase B: Combat — nearby monsters may fight
    // Refetch pets after movement (positions may have changed)
    const { data: movedPets } = await supabase
      .from("pets")
      .select("*")
      .eq("dungeon_id", dungeon.id)
      .eq("status", "alive");

    if (movedPets && movedPets.length > 1) {
      const foughtThisTick = new Set<string>();

      for (const pet of movedPets) {
        if (foughtThisTick.has(pet.id)) continue;
        if (pet.tile_x === null || pet.tile_y === null) continue;

        // Get behavior profile for aggression check
        const monsterDef = MONSTER_DEF_BY_ID[resolveSpecies(pet.species, pet.base_type)];
        const aggression = monsterDef?.behavior.aggression ?? 0.3;

        if (Math.random() > aggression) continue; // not aggressive enough to fight

        // Find adjacent monsters (same chunk, within 1 tile)
        const nearbyFoes = movedPets.filter(
          (other) =>
            other.id !== pet.id &&
            !foughtThisTick.has(other.id) &&
            other.chunk_x === pet.chunk_x &&
            other.chunk_y === pet.chunk_y &&
            other.tile_x !== null &&
            other.tile_y !== null &&
            Math.abs(other.tile_x! - pet.tile_x!) <= 1 &&
            Math.abs(other.tile_y! - pet.tile_y!) <= 1
        );

        if (nearbyFoes.length === 0) continue;

        // Check if any of them are prey species
        const preySpecies = monsterDef?.behavior.preySpecies ?? [];
        let target = nearbyFoes.find((f) =>
          preySpecies.includes(resolveSpecies(f.species, f.base_type))
        );

        // If no prey found, pick random foe (only if very aggressive)
        if (!target && aggression > 0.6) {
          target = nearbyFoes[Math.floor(Math.random() * nearbyFoes.length)];
        }

        if (!target) continue;

        // Check cowardice — flee from predators instead of fighting
        const predators = monsterDef?.behavior.predators ?? [];
        if (predators.includes(resolveSpecies(target.species, target.base_type))) {
          const myCowardice = monsterDef?.behavior.cowardice ?? 0.5;
          if (Math.random() < myCowardice) continue; // flees
        }

        foughtThisTick.add(pet.id);
        foughtThisTick.add(target.id);

        await processCombat(supabase, pet, target, dungeon.id, now);
        combatsFought++;
      }
    }

    // Phase C: Evolution check
    // Refetch alive pets after combat
    const { data: postCombatPets } = await supabase
      .from("pets")
      .select("*")
      .eq("dungeon_id", dungeon.id)
      .eq("status", "alive");

    if (postCombatPets) {
      for (const pet of postCombatPets) {
        const evolved = await checkAndEvolve(supabase, pet, now);
        if (evolved) evolutions++;
      }
    }
  }

  // 5. Egg hatching — with speed multiplier (legacy, kept for backward compat)
  let eggsHatched = 0;
  const hatchCheckTime =
    hatchSpeedMultiplier > 1
      ? new Date(
          now.getTime() +
            (hatchSpeedMultiplier - 1) * 60 * 60 * 1000
        ).toISOString()
      : now.toISOString();

  const { data: readyEggs } = await supabase
    .from("eggs")
    .select("*")
    .eq("dungeon_id", dungeon.id)
    .eq("hatched", false)
    .lte("hatches_at", hatchCheckTime);

  if (readyEggs && readyEggs.length > 0) {
    for (const egg of readyEggs) {
      await hatchEgg(supabase, egg, dungeon.id, player.id);
      eggsHatched++;
    }
  }

  return {
    status: "ok",
    dust: newDust,
    dustGained,
    crystalEnergy: Number(newEnergy.toFixed(2)),
    resourcesSpawned,
    petsMoved,
    combatsFought,
    evolutions,
    eggsHatched,
  };
}

function determineResourceType(nutrient: number, mana: number): ResourceType {
  const total = nutrient + mana;
  if (total === 0) return "moss";

  const manaRatio = mana / total;
  const r = Math.random();

  if (manaRatio > 0.7) {
    return r < 0.5 ? "mana_orb" : "crystal_shard";
  } else if (manaRatio > 0.3) {
    return r < 0.4 ? "crystal_shard" : r < 0.7 ? "mushroom" : "moss";
  } else {
    if (r < 0.4) return "mushroom";
    if (r < 0.65) return "moss";
    if (r < 0.85) return "bone";
    return "crystal_shard";
  }
}

async function processPetMovement(
  supabase: ReturnType<typeof createServiceClient>,
  pet: {
    id: string;
    tile_x: number | null;
    tile_y: number | null;
    chunk_x: number;
    chunk_y: number;
    hunger: number;
    food_log: string[];
    species: string;
    base_type: string;
    behavior_stats: PetBehaviorStats;
  },
  dungeonId: string,
  now: Date
) {
  if (pet.tile_x === null || pet.tile_y === null) return;

  const monsterDef = MONSTER_DEF_BY_ID[resolveSpecies(pet.species, pet.base_type)];
  const behaviorProfile = monsterDef?.behavior;
  const stats: PetBehaviorStats = pet.behavior_stats ?? defaultBehaviorStats();

  const walkableTypes = ["corridor", "packed", "hatchery", "crystal"];
  const directions = [
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
  ];

  // Wanderlust check — low wanderlust means pet might stay put
  const wanderlust = behaviorProfile?.wanderlust ?? 0.5;
  if (Math.random() > wanderlust) return;

  const { data: neighborTiles } = await supabase
    .from("tiles")
    .select("*")
    .eq("dungeon_id", dungeonId)
    .eq("chunk_x", pet.chunk_x)
    .eq("chunk_y", pet.chunk_y)
    .in("type", walkableTypes);

  if (!neighborTiles || neighborTiles.length === 0) return;

  const validNeighbors = neighborTiles.filter((t) =>
    directions.some(
      (d) =>
        t.local_x === pet.tile_x! + d.dx && t.local_y === pet.tile_y! + d.dy
    )
  );

  if (validNeighbors.length === 0) return;

  let chosen;
  const foraging = behaviorProfile?.foraging ?? 0.5;
  const preferredFood = behaviorProfile?.preferredFood ?? [];

  if (pet.hunger < 0.5 || Math.random() < foraging) {
    const { data: nearbyResources } = await supabase
      .from("resources")
      .select("tile_id, type")
      .eq("dungeon_id", dungeonId);

    const resourceByTile = new Map<string, string>();
    (nearbyResources || []).forEach((r) => resourceByTile.set(r.tile_id, r.type));

    // Prioritize tiles with preferred food
    const preferredNeighbors = validNeighbors.filter((t) => {
      const rType = resourceByTile.get(t.id);
      return rType && preferredFood.includes(rType);
    });

    const anyResourceNeighbors = validNeighbors.filter((t) =>
      resourceByTile.has(t.id)
    );

    chosen =
      preferredNeighbors.length > 0
        ? preferredNeighbors[Math.floor(Math.random() * preferredNeighbors.length)]
        : anyResourceNeighbors.length > 0
          ? anyResourceNeighbors[Math.floor(Math.random() * anyResourceNeighbors.length)]
          : validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
  } else {
    chosen = validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
  }

  const newHunger = Math.max(0, pet.hunger - 0.05);

  // Track tiles walked
  stats.tilesWalked = (stats.tilesWalked || 0) + 1;

  await supabase
    .from("pets")
    .update({
      tile_x: chosen.local_x,
      tile_y: chosen.local_y,
      chunk_x: chosen.chunk_x,
      chunk_y: chosen.chunk_y,
      hunger: newHunger,
      behavior_stats: stats,
      updated_at: now.toISOString(),
    })
    .eq("id", pet.id);

  await supabase
    .from("tiles")
    .update({ traffic_count: chosen.traffic_count + 1 })
    .eq("id", chosen.id);

  if (chosen.traffic_count + 1 >= 3 && chosen.type === "corridor") {
    await supabase
      .from("tiles")
      .update({ type: "packed" })
      .eq("id", chosen.id);
  }

  // Try eating
  const { data: tileResource } = await supabase
    .from("resources")
    .select("*")
    .eq("tile_id", chosen.id)
    .single();

  if (tileResource && newHunger < 0.9) {
    const hungerGain = RESOURCE_HUNGER_VALUES[tileResource.type] || 0.1;
    const updatedHunger = Math.min(1.0, newHunger + hungerGain);
    const updatedFoodLog = [...(pet.food_log || []), tileResource.type].slice(-10);

    // Track food eaten in behavior stats
    if (!stats.foodEaten) stats.foodEaten = {};
    stats.foodEaten[tileResource.type] = (stats.foodEaten[tileResource.type] || 0) + 1;

    await supabase
      .from("pets")
      .update({
        hunger: updatedHunger,
        food_log: updatedFoodLog,
        behavior_stats: stats,
      })
      .eq("id", pet.id);

    await supabase.from("resources").delete().eq("id", tileResource.id);
  }
}

async function hatchEgg(
  supabase: ReturnType<typeof createServiceClient>,
  egg: { id: string; base_type: string; hatchery_tile_id: string },
  dungeonId: string,
  playerId: string
) {
  const { data: tile } = await supabase
    .from("tiles")
    .select("local_x, local_y, chunk_x, chunk_y")
    .eq("id", egg.hatchery_tile_id)
    .single();

  if (!tile) return;

  const def = MONSTER_DEF_BY_ID[egg.base_type];
  const stats = def?.baseStats ?? { hp: 40, mp: 10, atk: 8, def: 8, spd: 8 };

  await supabase.from("pets").insert({
    player_id: playerId,
    dungeon_id: dungeonId,
    base_type: egg.base_type,
    evolution_stage: 1,
    status: "alive",
    hp: stats.hp,
    max_hp: stats.hp,
    mp: stats.mp,
    max_mp: stats.mp,
    atk: stats.atk,
    def: stats.def,
    spd: stats.spd,
    hunger: 1.0,
    tile_x: tile.local_x,
    tile_y: tile.local_y,
    chunk_x: tile.chunk_x,
    chunk_y: tile.chunk_y,
    level: 1,
    total_exp: 0,
    species: egg.base_type,
    behavior_stats: defaultBehaviorStats(),
  });

  await supabase.from("eggs").update({ hatched: true }).eq("id", egg.id);
}

// ═══════════════════════════════════════════════════════════════════
// COMBAT SYSTEM
// ═══════════════════════════════════════════════════════════════════

interface CombatPet {
  id: string;
  hp: number;
  max_hp: number;
  atk: number;
  def: number;
  spd: number;
  level: number;
  total_exp: number;
  species: string;
  base_type: string;
  behavior_stats: PetBehaviorStats;
  tile_x: number | null;
  tile_y: number | null;
  chunk_x: number;
  chunk_y: number;
}

async function processCombat(
  supabase: ReturnType<typeof createServiceClient>,
  attacker: CombatPet,
  defender: CombatPet,
  dungeonId: string,
  now: Date
) {
  let aHp = attacker.hp;
  let dHp = defender.hp;
  let totalAttackerDmg = 0;
  let totalDefenderDmg = 0;
  let rounds = 0;
  const maxRounds = 10;

  while (aHp > 0 && dHp > 0 && rounds < maxRounds) {
    rounds++;

    const first = speedCheck(attacker.spd, defender.spd);

    if (first === "a") {
      const dmg = calcDamage(attacker.atk, defender.def);
      dHp -= dmg;
      totalAttackerDmg += dmg;

      if (dHp > 0) {
        const dmg2 = calcDamage(defender.atk, attacker.def);
        aHp -= dmg2;
        totalDefenderDmg += dmg2;
      }
    } else {
      const dmg = calcDamage(defender.atk, attacker.def);
      aHp -= dmg;
      totalDefenderDmg += dmg;

      if (aHp > 0) {
        const dmg2 = calcDamage(attacker.atk, defender.def);
        dHp -= dmg2;
        totalAttackerDmg += dmg2;
      }
    }
  }

  const attackerWon = dHp <= 0 && aHp > 0;
  const defenderWon = aHp <= 0 && dHp > 0;
  const winnerId = attackerWon ? attacker.id : defenderWon ? defender.id : null;

  // Calculate exp
  let attackerExp = 0;
  let defenderExp = 0;

  if (attackerWon) {
    attackerExp = Math.floor(
      BASE_EXP_PER_KILL * levelGapMultiplier(attacker.level, defender.level)
    );
  } else if (defenderWon) {
    defenderExp = Math.floor(
      BASE_EXP_PER_KILL * levelGapMultiplier(defender.level, attacker.level)
    );
  } else {
    // Draw — both get small exp
    attackerExp = Math.floor(BASE_EXP_PER_KILL * 0.3);
    defenderExp = Math.floor(BASE_EXP_PER_KILL * 0.3);
  }

  // Update attacker
  const aStats: PetBehaviorStats = attacker.behavior_stats ?? defaultBehaviorStats();
  const aNewExp = (attacker.total_exp || 0) + attackerExp;
  const aNewLevel = Math.min(MAX_LEVEL, expToLevel(aNewExp));

  // Apply level-up stat growth
  const aDef = MONSTER_DEF_BY_ID[resolveSpecies(attacker.species, attacker.base_type)];
  const aGrowth = aDef?.growth;
  const aLevelUps = aNewLevel - (attacker.level || 1);

  if (attackerWon) {
    aStats.fightsWon = (aStats.fightsWon || 0) + 1;
    // Track prey hunted
    if (!aStats.preysHunted) aStats.preysHunted = {};
    const defSpecies = resolveSpecies(defender.species, defender.base_type);
    aStats.preysHunted[defSpecies] = (aStats.preysHunted[defSpecies] || 0) + 1;
  } else if (defenderWon) {
    aStats.fightsLost = (aStats.fightsLost || 0) + 1;
  }
  aStats.totalExp = aNewExp;

  const attackerUpdate: Record<string, unknown> = {
    hp: attackerWon ? Math.max(1, aHp) : 0,
    total_exp: aNewExp,
    level: aNewLevel,
    behavior_stats: aStats,
    updated_at: now.toISOString(),
  };

  if (aLevelUps > 0 && aGrowth) {
    attackerUpdate.max_hp = attacker.max_hp + aGrowth.hp * aLevelUps;
    attackerUpdate.max_mp = (attacker as unknown as { max_mp: number }).max_mp + aGrowth.mp * aLevelUps;
    attackerUpdate.atk = attacker.atk + aGrowth.atk * aLevelUps;
    attackerUpdate.def = attacker.def + aGrowth.def * aLevelUps;
    attackerUpdate.spd = attacker.spd + aGrowth.spd * aLevelUps;
    if (attackerWon) {
      attackerUpdate.hp = Math.min(attackerUpdate.max_hp as number, Math.max(1, aHp));
    }
  }

  if (defenderWon) {
    attackerUpdate.status = "dead";
    attackerUpdate.died_at = now.toISOString();
    attackerUpdate.death_location_x = attacker.tile_x;
    attackerUpdate.death_location_y = attacker.tile_y;
  }

  await supabase.from("pets").update(attackerUpdate).eq("id", attacker.id);

  // Update defender
  const dStats: PetBehaviorStats = defender.behavior_stats ?? defaultBehaviorStats();
  const dNewExp = (defender.total_exp || 0) + defenderExp;
  const dNewLevel = Math.min(MAX_LEVEL, expToLevel(dNewExp));

  const dDef = MONSTER_DEF_BY_ID[resolveSpecies(defender.species, defender.base_type)];
  const dGrowth = dDef?.growth;
  const dLevelUps = dNewLevel - (defender.level || 1);

  if (defenderWon) {
    dStats.fightsWon = (dStats.fightsWon || 0) + 1;
    if (!dStats.preysHunted) dStats.preysHunted = {};
    const attSpecies = resolveSpecies(attacker.species, attacker.base_type);
    dStats.preysHunted[attSpecies] = (dStats.preysHunted[attSpecies] || 0) + 1;
  } else if (attackerWon) {
    dStats.fightsLost = (dStats.fightsLost || 0) + 1;
  }
  dStats.totalExp = dNewExp;

  const defenderUpdate: Record<string, unknown> = {
    hp: defenderWon ? Math.max(1, dHp) : 0,
    total_exp: dNewExp,
    level: dNewLevel,
    behavior_stats: dStats,
    updated_at: now.toISOString(),
  };

  if (dLevelUps > 0 && dGrowth) {
    defenderUpdate.max_hp = defender.max_hp + dGrowth.hp * dLevelUps;
    defenderUpdate.max_mp = (defender as unknown as { max_mp: number }).max_mp + dGrowth.mp * dLevelUps;
    defenderUpdate.atk = defender.atk + dGrowth.atk * dLevelUps;
    defenderUpdate.def = defender.def + dGrowth.def * dLevelUps;
    defenderUpdate.spd = defender.spd + dGrowth.spd * dLevelUps;
    if (defenderWon) {
      defenderUpdate.hp = Math.min(defenderUpdate.max_hp as number, Math.max(1, dHp));
    }
  }

  if (attackerWon) {
    defenderUpdate.status = "dead";
    defenderUpdate.died_at = now.toISOString();
    defenderUpdate.death_location_x = defender.tile_x;
    defenderUpdate.death_location_y = defender.tile_y;
  }

  await supabase.from("pets").update(defenderUpdate).eq("id", defender.id);

  // Log combat
  await supabase.from("combat_logs").insert({
    dungeon_id: dungeonId,
    attacker_id: attacker.id,
    defender_id: defender.id,
    winner_id: winnerId,
    attacker_damage: totalAttackerDmg,
    defender_damage: totalDefenderDmg,
    exp_gained: attackerWon ? attackerExp : defenderExp,
    rounds,
  });
}

// ═══════════════════════════════════════════════════════════════════
// EVOLUTION SYSTEM
// ═══════════════════════════════════════════════════════════════════

async function checkAndEvolve(
  supabase: ReturnType<typeof createServiceClient>,
  pet: {
    id: string;
    species: string;
    base_type: string;
    level: number;
    behavior_stats: PetBehaviorStats;
    evolution_stage: number;
    max_hp: number;
    max_mp: number;
    atk: number;
    def: number;
    spd: number;
  },
  now: Date
): Promise<boolean> {
  const currentDef = MONSTER_DEF_BY_ID[resolveSpecies(pet.species, pet.base_type)];
  if (!currentDef) return false;
  if (currentDef.evolutions.length === 0) return false;

  const stats = pet.behavior_stats ?? defaultBehaviorStats();

  // Check each evolution path
  for (const evo of currentDef.evolutions) {
    const met = checkEvolutionCriteria(
      evo,
      pet.level || 1,
      {
        tilesWalked: stats.tilesWalked || 0,
        fightsWon: stats.fightsWon || 0,
        fightsLost: stats.fightsLost || 0,
        totalExp: stats.totalExp || 0,
        foodEaten: stats.foodEaten || {},
        preysHunted: stats.preysHunted || {},
        specialFlags: stats.specialFlags || [],
      }
    );

    if (met) {
      const newForm = MONSTER_DEF_BY_ID[evo.to];
      if (!newForm) continue;

      // Apply evolution — stats jump to new form's base + current level growth
      const levelAboveBase = Math.max(0, (pet.level || 1) - 1);

      await supabase
        .from("pets")
        .update({
          species: newForm.id,
          evolved_form: newForm.id,
          evolution_stage: newForm.stage,
          max_hp: newForm.baseStats.hp + newForm.growth.hp * levelAboveBase,
          max_mp: newForm.baseStats.mp + newForm.growth.mp * levelAboveBase,
          hp: newForm.baseStats.hp + newForm.growth.hp * levelAboveBase, // full heal on evo
          mp: newForm.baseStats.mp + newForm.growth.mp * levelAboveBase,
          atk: newForm.baseStats.atk + newForm.growth.atk * levelAboveBase,
          def: newForm.baseStats.def + newForm.growth.def * levelAboveBase,
          spd: newForm.baseStats.spd + newForm.growth.spd * levelAboveBase,
          updated_at: now.toISOString(),
        })
        .eq("id", pet.id);

      return true;
    }
  }

  return false;
}
