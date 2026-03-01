import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getSpawnCandidates,
  pickWeightedSpawn,
  MONSTER_DEF_BY_ID,
  defaultBehaviorStats,
  type SoilType,
} from "@/game/monsters";

// Soil-type → resource mapping based on tile properties
function determineSoilResource(nutrient: number, mana: number): string {
  if (mana > 0.5) return Math.random() < 0.5 ? "crystal_shard" : "mana_orb";
  if (nutrient > 0.5) return Math.random() < 0.6 ? "mushroom" : "moss";
  return Math.random() < 0.5 ? "bone" : "moss";
}

function getSoilType(nutrient: number, mana: number): SoilType {
  if (mana >= 2.0) return "crystal";
  if (nutrient >= 0.6) return "green";
  return "brown";
}

// Base spawn chance per matching neighbor tile (out of 8 possible)
const SPAWN_CHANCE_PER_NEIGHBOR = 0.05; // 5% per matching neighbor → max ~40%

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { chunk_x, chunk_y, local_x, local_y } = body;

  if (
    chunk_x === undefined ||
    chunk_y === undefined ||
    local_x === undefined ||
    local_y === undefined
  ) {
    return NextResponse.json(
      { error: "Missing coordinates" },
      { status: 400 }
    );
  }

  // Get player + dungeon
  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const { data: dungeon } = await supabase
    .from("dungeons")
    .select("*")
    .eq("player_id", player.id)
    .single();

  if (!dungeon) {
    return NextResponse.json({ error: "Dungeon not found" }, { status: 404 });
  }

  // Find the target tile
  const { data: targetTile } = await supabase
    .from("tiles")
    .select("*")
    .eq("dungeon_id", dungeon.id)
    .eq("chunk_x", chunk_x)
    .eq("chunk_y", chunk_y)
    .eq("local_x", local_x)
    .eq("local_y", local_y)
    .single();

  if (!targetTile) {
    return NextResponse.json({ error: "Tile not found" }, { status: 404 });
  }

  if (targetTile.type !== "solid" && targetTile.type !== "solid_regrowing") {
    return NextResponse.json(
      { error: "Can only dig solid tiles" },
      { status: 400 }
    );
  }

  // Check adjacency — at least one neighbor must be walkable
  // Supports cross-chunk boundaries: when local coord goes out of bounds,
  // look in the adjacent chunk.
  const { data: chunk } = await supabase
    .from("chunks")
    .select("width, height")
    .eq("dungeon_id", dungeon.id)
    .eq("chunk_x", chunk_x)
    .eq("chunk_y", chunk_y)
    .single();

  if (!chunk) {
    return NextResponse.json({ error: "Chunk not found" }, { status: 404 });
  }

  const rawNeighbors = [
    { x: local_x - 1, y: local_y, cx: chunk_x, cy: chunk_y },
    { x: local_x + 1, y: local_y, cx: chunk_x, cy: chunk_y },
    { x: local_x, y: local_y - 1, cx: chunk_x, cy: chunk_y },
    { x: local_x, y: local_y + 1, cx: chunk_x, cy: chunk_y },
  ];

  // Resolve cross-chunk boundaries
  const resolvedNeighbors = rawNeighbors.map((n) => {
    let { x, y, cx, cy } = n;
    if (x < 0) { cx -= 1; x = chunk.width - 1; }    // wrap to left chunk
    else if (x >= chunk.width) { cx += 1; x = 0; }   // wrap to right chunk
    if (y < 0) { cy -= 1; y = chunk.height - 1; }    // wrap to top chunk
    else if (y >= chunk.height) { cy += 1; y = 0; }   // wrap to bottom chunk
    return { x, y, cx, cy };
  });

  // Check if any neighbor is walkable (including ground — can dig next to ground entrance)
  const walkableTypes = ["corridor", "packed", "crystal", "hatchery", "ground"];
  let hasWalkableNeighbor = false;

  for (const n of resolvedNeighbors) {
    const { data: neighborTile } = await supabase
      .from("tiles")
      .select("type")
      .eq("dungeon_id", dungeon.id)
      .eq("chunk_x", n.cx)
      .eq("chunk_y", n.cy)
      .eq("local_x", n.x)
      .eq("local_y", n.y)
      .single();

    if (neighborTile && walkableTypes.includes(neighborTile.type)) {
      hasWalkableNeighbor = true;
      break;
    }
  }

  if (!hasWalkableNeighbor) {
    return NextResponse.json(
      { error: "Must dig adjacent to an existing corridor" },
      { status: 400 }
    );
  }

  // Calculate regrow time based on crystal energy
  const crystalFactor = Math.max(0.01, dungeon.crystal_energy / 100);
  const baseRegrowHours = 6; // corridor base
  const regrowMs = (baseRegrowHours / crystalFactor) * 60 * 60 * 1000;
  const regrowAt = new Date(Date.now() + regrowMs).toISOString();

  // Dig the tile
  const { data: updatedTile, error } = await supabase
    .from("tiles")
    .update({
      type: "corridor",
      regrow_at: regrowAt,
    })
    .eq("id", targetTile.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // --- Resource drop: determined by soil properties ---
  const revealRoll = Math.random();
  let revealedResource = null;
  if (revealRoll < 0.35) {
    const resourceType = determineSoilResource(targetTile.nutrient, targetTile.mana);

    const { data: newResource } = await supabase
      .from("resources")
      .insert({
        tile_id: targetTile.id,
        dungeon_id: dungeon.id,
        type: resourceType,
        quantity: 1,
      })
      .select()
      .single();

    revealedResource = newResource;
  }

  // --- Monster spawn: use bestiary-based soil spawning ---
  let spawnedPet = null;

  // Determine soil type of the dug tile
  const tileSoil = getSoilType(targetTile.nutrient, targetTile.mana);
  const candidates = getSpawnCandidates(
    tileSoil,
    targetTile.nutrient,
    targetTile.mana
  );

  if (candidates.length > 0) {
    // Count nearby walkable tiles to determine spawn chance
    const allNeighborOffsets = [
      { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
      { dx: -1, dy: 0 },                      { dx: 1, dy: 0 },
      { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 },
    ];

    const neighborCoords = allNeighborOffsets.map((off) => {
      let nx = local_x + off.dx;
      let ny = local_y + off.dy;
      let ncx = chunk_x;
      let ncy = chunk_y;
      if (nx < 0) { ncx -= 1; nx = chunk.width - 1; }
      else if (nx >= chunk.width) { ncx += 1; nx = 0; }
      if (ny < 0) { ncy -= 1; ny = chunk.height - 1; }
      else if (ny >= chunk.height) { ncy += 1; ny = 0; }
      return { x: nx, y: ny, cx: ncx, cy: ncy };
    });

    const walkableForSpawn = ["corridor", "packed", "ground"];
    let matchingNeighbors = 0;

    for (const nc of neighborCoords) {
      const { data: nTile } = await supabase
        .from("tiles")
        .select("id, type, nutrient, mana")
        .eq("dungeon_id", dungeon.id)
        .eq("chunk_x", nc.cx)
        .eq("chunk_y", nc.cy)
        .eq("local_x", nc.x)
        .eq("local_y", nc.y)
        .single();

      if (!nTile || !walkableForSpawn.includes(nTile.type)) continue;

      // Check if neighbor has resources that boost spawn
      const { data: nResource } = await supabase
        .from("resources")
        .select("type")
        .eq("tile_id", nTile.id)
        .single();

      const neighborSoil = getSoilType(nTile.nutrient, nTile.mana);
      if (neighborSoil === tileSoil) {
        matchingNeighbors += 1;
      } else {
        matchingNeighbors += 0.3; // partial credit for different soil
      }

      // Bonus for resources that match candidate boost resources
      if (nResource) {
        const anyBoost = candidates.some(
          (c) => c.spawnCondition.boostResources.includes(nResource.type)
        );
        if (anyBoost) matchingNeighbors += 0.5;
      }
    }

    const spawnChance = matchingNeighbors * SPAWN_CHANCE_PER_NEIGHBOR;
    if (Math.random() < spawnChance) {
      const chosenId = pickWeightedSpawn(candidates);
      if (chosenId) {
        const baseDef = MONSTER_DEF_BY_ID[chosenId];
        const stats = baseDef?.baseStats ?? { hp: 40, mp: 10, atk: 8, def: 8, spd: 8 };

        const { data: newPet } = await supabase
          .from("pets")
          .insert({
            player_id: player.id,
            dungeon_id: dungeon.id,
            base_type: chosenId,
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
            tile_x: local_x,
            tile_y: local_y,
            chunk_x: chunk_x,
            chunk_y: chunk_y,
            level: 1,
            total_exp: 0,
            species: chosenId,
            behavior_stats: defaultBehaviorStats(),
          })
          .select()
          .single();

        spawnedPet = newPet;
      }
    }
  }

  return NextResponse.json({
    tile: updatedTile,
    resource: revealedResource,
    pet: spawnedPet,
  });
}
