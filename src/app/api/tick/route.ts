import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { ResourceType } from "@/types/database";

const TICK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Base regrow times in hours
const REGROW_BASE_HOURS: Record<string, number> = {
  solid: 24,
  corridor: 6,
  packed: 2,
};

// Crystal energy growth: +1.7/hr, tick every 5 min = 12 ticks/hr
const CRYSTAL_ENERGY_PER_TICK = 1.7 / 12;

// Hunger resource values
const RESOURCE_HUNGER_VALUES: Record<string, number> = {
  mushroom: 0.15,
  crystal_shard: 0.1,
  bone: 0.12,
  mana_orb: 0.08,
  moss: 0.2,
};

export async function POST(request: NextRequest) {
  // Verify tick secret
  const tickSecret = request.headers.get("X-Tick-Secret");
  if (tickSecret !== process.env.TICK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();

  // Get all active players (logged in within 7 days)
  const sevenDaysAgo = new Date(
    now.getTime() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("*")
    .gte("updated_at", sevenDaysAgo);

  if (playersError || !players) {
    return NextResponse.json(
      { error: playersError?.message || "No players" },
      { status: 500 }
    );
  }

  const results = await Promise.allSettled(
    players.map((player) => processPlayer(supabase, player, now))
  );

  const settledResults = results.map((r) =>
    r.status === "fulfilled" ? r.value : { error: String(r.reason) }
  );

  return NextResponse.json({
    processed: settledResults.length,
    timestamp: now.toISOString(),
    results: settledResults,
  });
}

async function processPlayer(
  supabase: ReturnType<typeof createServiceClient>,
  player: { id: string; last_tick_at: string; chrono_dust: number },
  now: Date
) {
  const lastTick = new Date(player.last_tick_at);
  const elapsed = now.getTime() - lastTick.getTime();
  const missedTicks = Math.max(1, Math.floor(elapsed / TICK_INTERVAL_MS));

  // 1. Chrono Dust accrual — rate scales with crystal energy
  // At 100% crystal: +1 dust/tick. At 50%: +0.5/tick. At 0%: +0.1/tick (minimum)
  // We need dungeon first to get crystal energy, but we update dust here using
  // a preliminary fetch. Dust is floored to integer.
  const { data: dungeonForDust } = await supabase
    .from("dungeons")
    .select("crystal_energy")
    .eq("player_id", player.id)
    .single();

  const crystalEnergyPct = (dungeonForDust?.crystal_energy ?? 100) / 100;
  const dustRate = Math.max(0.1, crystalEnergyPct); // min 0.1 dust/tick
  const dustGained = Math.floor(dustRate * missedTicks);
  const newDust = player.chrono_dust + Math.max(1, dustGained);

  await supabase
    .from("players")
    .update({
      chrono_dust: newDust,
      last_tick_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", player.id);

  // 2. Get dungeon
  const { data: dungeon } = await supabase
    .from("dungeons")
    .select("*")
    .eq("player_id", player.id)
    .single();

  if (!dungeon) return { player_id: player.id, status: "no_dungeon" };

  // 3. Crystal energy growth
  const newEnergy = Math.min(
    100,
    dungeon.crystal_energy + CRYSTAL_ENERGY_PER_TICK * missedTicks
  );

  await supabase
    .from("dungeons")
    .update({
      crystal_energy: newEnergy,
      updated_at: now.toISOString(),
    })
    .eq("id", dungeon.id);

  // 4. Resource regrowth
  const crystalFactor = Math.max(0.01, newEnergy / 100);

  const { data: regrowTiles } = await supabase
    .from("tiles")
    .select("*")
    .eq("dungeon_id", dungeon.id)
    .not("regrow_at", "is", null)
    .lte("regrow_at", now.toISOString())
    .in("type", ["corridor", "packed", "solid"]);

  if (regrowTiles && regrowTiles.length > 0) {
    // Check which tiles don't already have a resource
    const tileIds = regrowTiles.map((t) => t.id);
    const { data: existingResources } = await supabase
      .from("resources")
      .select("tile_id")
      .in("tile_id", tileIds);

    const tilesWithResource = new Set(
      (existingResources || []).map((r) => r.tile_id)
    );

    const newResources = [];
    const tileUpdates = [];

    for (const tile of regrowTiles) {
      if (tilesWithResource.has(tile.id)) continue;

      // Determine resource type based on nutrient/mana
      const resourceType = determineResourceType(tile.nutrient, tile.mana);

      newResources.push({
        tile_id: tile.id,
        dungeon_id: dungeon.id,
        type: resourceType,
        quantity: 1,
      });

      // Calculate next regrow_at
      const baseHours = REGROW_BASE_HOURS[tile.type] || 6;
      const actualMs = (baseHours / crystalFactor) * 60 * 60 * 1000;
      const nextRegrow = new Date(now.getTime() + actualMs).toISOString();

      tileUpdates.push({ id: tile.id, regrow_at: nextRegrow });
    }

    // Batch insert resources
    if (newResources.length > 0) {
      await supabase.from("resources").insert(newResources);
    }

    // Update tile regrow_at values
    for (const update of tileUpdates) {
      await supabase
        .from("tiles")
        .update({ regrow_at: update.regrow_at })
        .eq("id", update.id);
    }
  }

  // 5. Pet movement + eating (Phase 2 — placeholder)
  const { data: alivePets } = await supabase
    .from("pets")
    .select("*")
    .eq("dungeon_id", dungeon.id)
    .eq("status", "alive");

  if (alivePets && alivePets.length > 0) {
    for (const pet of alivePets) {
      await processPatMovement(supabase, pet, dungeon.id, crystalFactor, now);
    }

    // Starvation damage — pets at 0 hunger lose 5% max HP per tick
    const { data: starvedPets } = await supabase
      .from("pets")
      .select("id, hp, max_hp, hunger")
      .eq("dungeon_id", dungeon.id)
      .eq("status", "alive")
      .lte("hunger", 0);

    if (starvedPets) {
      for (const pet of starvedPets) {
        const starveDamage = Math.ceil((pet.max_hp || 40) * 0.02);
        const newHp = (pet.hp || 0) - starveDamage;
        if (newHp <= 0) {
          await supabase.from("pets").update({ status: "dead", hp: 0 }).eq("id", pet.id);
        } else {
          await supabase.from("pets").update({ hp: newHp }).eq("id", pet.id);
        }
      }
    }
  }

  // 6. Egg hatching
  const { data: readyEggs } = await supabase
    .from("eggs")
    .select("*")
    .eq("dungeon_id", dungeon.id)
    .eq("hatched", false)
    .lte("hatches_at", now.toISOString());

  if (readyEggs && readyEggs.length > 0) {
    for (const egg of readyEggs) {
      await hatchEgg(supabase, egg, dungeon.id, player.id);
    }
  }

  return {
    player_id: player.id,
    status: "ok",
    missed_ticks: missedTicks,
    resources_spawned: regrowTiles?.length || 0,
  };
}

function determineResourceType(nutrient: number, mana: number): ResourceType {
  // Weighted random based on tile properties
  const total = nutrient + mana;
  if (total === 0) return "moss";

  const manaRatio = mana / total;
  const r = Math.random();

  if (manaRatio > 0.7) {
    return r < 0.5 ? "mana_orb" : "crystal_shard";
  } else if (manaRatio > 0.3) {
    return r < 0.4 ? "crystal_shard" : r < 0.7 ? "mushroom" : "moss";
  } else {
    // High nutrient
    if (r < 0.4) return "mushroom";
    if (r < 0.65) return "moss";
    if (r < 0.85) return "bone";
    return "crystal_shard";
  }
}

async function processPatMovement(
  supabase: ReturnType<typeof createServiceClient>,
  pet: {
    id: string;
    tile_x: number | null;
    tile_y: number | null;
    chunk_x: number;
    chunk_y: number;
    hunger: number;
    food_log: string[];
  },
  dungeonId: string,
  _crystalFactor: number,
  now: Date
) {
  if (pet.tile_x === null || pet.tile_y === null) return;

  // Get adjacent walkable tiles
  const walkableTypes = ["corridor", "packed", "hatchery", "crystal"];
  const directions = [
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
  ];

  const { data: neighborTiles } = await supabase
    .from("tiles")
    .select("*")
    .eq("dungeon_id", dungeonId)
    .eq("chunk_x", pet.chunk_x)
    .in("type", walkableTypes);

  if (!neighborTiles || neighborTiles.length === 0) return;

  // Filter to actual neighbors
  const validNeighbors = neighborTiles.filter((t) =>
    directions.some(
      (d) =>
        t.local_x === pet.tile_x! + d.dx && t.local_y === pet.tile_y! + d.dy
    )
  );

  if (validNeighbors.length === 0) return;

  // If hungry, prefer tiles with resources; navigate toward food if none adjacent
  let chosen;
  if (pet.hunger < 0.7) {
    const { data: chunkResources } = await supabase
      .from("resources")
      .select("tile_id, type")
      .eq("dungeon_id", dungeonId);

    const { data: chunkTiles } = await supabase
      .from("tiles")
      .select("id, local_x, local_y, chunk_x, chunk_y")
      .eq("dungeon_id", dungeonId)
      .eq("chunk_x", pet.chunk_x)
      .eq("chunk_y", pet.chunk_y);

    const tileById = new Map<string, {local_x: number; local_y: number}>();
    (chunkTiles || []).forEach((t) => tileById.set(t.id, {local_x: t.local_x, local_y: t.local_y}));

    const resourceByTile = new Map<string, string>();
    (chunkResources || []).forEach((r) => {
      if (tileById.has(r.tile_id)) resourceByTile.set(r.tile_id, r.type);
    });

    const resourceNeighbors = validNeighbors.filter((t) => resourceByTile.has(t.id));

    if (resourceNeighbors.length > 0) {
      chosen = resourceNeighbors[Math.floor(Math.random() * resourceNeighbors.length)];
    } else if (pet.hunger < 0.5) {
      // Navigate toward nearest food in chunk
      let targetX: number | null = null;
      let targetY: number | null = null;
      let bestDist = Infinity;
      for (const [tileId] of resourceByTile.entries()) {
        const tile = tileById.get(tileId);
        if (!tile) continue;
        const dist = Math.abs(tile.local_x - pet.tile_x!) + Math.abs(tile.local_y - pet.tile_y!);
        if (dist < bestDist) {
          bestDist = dist;
          targetX = tile.local_x;
          targetY = tile.local_y;
        }
      }
      if (targetX !== null && targetY !== null) {
        const closerNeighbors = validNeighbors.filter((t) => {
          const curDist = Math.abs(pet.tile_x! - targetX!) + Math.abs(pet.tile_y! - targetY!);
          const newDist = Math.abs(t.local_x - targetX!) + Math.abs(t.local_y - targetY!);
          return newDist < curDist;
        });
        chosen = closerNeighbors.length > 0
          ? closerNeighbors[Math.floor(Math.random() * closerNeighbors.length)]
          : validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
      } else {
        chosen = validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
      }
    } else {
      chosen = validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
    }
  } else {
    chosen = validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
  }

  // Move pet
  const newHunger = Math.max(0, pet.hunger - 0.02);

  await supabase
    .from("pets")
    .update({
      tile_x: chosen.local_x,
      tile_y: chosen.local_y,
      chunk_x: chosen.chunk_x,
      chunk_y: chosen.chunk_y,
      hunger: newHunger,
      updated_at: now.toISOString(),
    })
    .eq("id", pet.id);

  // Increment traffic count on destination tile
  await supabase
    .from("tiles")
    .update({ traffic_count: chosen.traffic_count + 1 })
    .eq("id", chosen.id);

  // Check packed soil (traffic >= 3)
  if (chosen.traffic_count + 1 >= 3 && chosen.type === "corridor") {
    await supabase
      .from("tiles")
      .update({ type: "packed" })
      .eq("id", chosen.id);
  }

  // Try eating: check if pet is on a tile with a resource
  const { data: tileResource } = await supabase
    .from("resources")
    .select("*")
    .eq("tile_id", chosen.id)
    .single();

  if (tileResource && newHunger < 0.9) {
    // Eat the resource
    const hungerGain =
      RESOURCE_HUNGER_VALUES[tileResource.type] || 0.1;
    const updatedHunger = Math.min(1.0, newHunger + hungerGain);
    const updatedFoodLog = [...(pet.food_log || []), tileResource.type].slice(
      -10
    );

    await supabase
      .from("pets")
      .update({
        hunger: updatedHunger,
        food_log: updatedFoodLog,
      })
      .eq("id", pet.id);

    // Remove the resource
    await supabase.from("resources").delete().eq("id", tileResource.id);

    // TODO: Check evolution combos (Phase 2)
  }
}

async function hatchEgg(
  supabase: ReturnType<typeof createServiceClient>,
  egg: {
    id: string;
    base_type: string;
    hatchery_tile_id: string;
  },
  dungeonId: string,
  playerId: string
) {
  // Get hatchery tile position
  const { data: tile } = await supabase
    .from("tiles")
    .select("local_x, local_y, chunk_x, chunk_y")
    .eq("id", egg.hatchery_tile_id)
    .single();

  if (!tile) return;

  // Base stats by type
  const baseStats: Record<
    string,
    { hp: number; mp: number; atk: number; def: number; spd: number }
  > = {
    shroom_slime: { hp: 50, mp: 20, atk: 12, def: 10, spd: 10 },
    crystal_sprite: { hp: 30, mp: 50, atk: 18, def: 6, spd: 14 },
    stone_crawler: { hp: 70, mp: 10, atk: 8, def: 18, spd: 6 },
  };

  const stats = baseStats[egg.base_type] || baseStats.shroom_slime;

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
  });

  // Mark egg as hatched
  await supabase.from("eggs").update({ hatched: true }).eq("id", egg.id);
}
