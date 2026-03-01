import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

const CHUNK_W = 20;
const CHUNK_H = 15;
const GRID = 10; // 10x10 areas

/**
 * Generate the full 10x10 dungeon grid.
 * All 100 chunks are created (locked=true), except the starting chunk.
 * Only the starting chunk gets tiles (ground row + drunk-walk path + crystal).
 *
 * Works with either the service client or a regular Supabase client.
 */
export async function generateDungeon(
  supabase: ReturnType<typeof createServiceClient> | SupabaseClient,
  playerId: string
) {
  const { data: newDungeon } = await supabase
    .from("dungeons")
    .insert({ player_id: playerId })
    .select()
    .single();

  if (!newDungeon) throw new Error("Failed to create dungeon");

  // Starting chunk: center of top row (near ground)
  const startCX = Math.floor(GRID / 2); // chunk_x = 5
  const startCY = 0; // top row = ground level

  // Create ALL 100 chunks — all locked except the start
  const chunkInserts = [];
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      chunkInserts.push({
        dungeon_id: newDungeon.id,
        chunk_x: cx,
        chunk_y: cy,
        width: CHUNK_W,
        height: CHUNK_H,
        locked: !(cx === startCX && cy === startCY),
      });
    }
  }

  const { data: chunks } = await supabase
    .from("chunks")
    .insert(chunkInserts)
    .select();

  if (!chunks) throw new Error("Failed to create chunks");

  // Generate tiles ONLY for the starting chunk
  const startChunk = chunks.find(
    (c: { chunk_x: number; chunk_y: number }) =>
      c.chunk_x === startCX && c.chunk_y === startCY
  )!;

  // Random dungeon path via drunk-walk from entrance down to crystal
  const entranceX = 5 + Math.floor(Math.random() * 10);
  const path = new Set<string>();

  let cx = entranceX;
  let cy = 1;
  path.add(`${cx},${cy}`);

  const minDepth = Math.min(CHUNK_H - 2, 8);
  while (cy < minDepth || path.size < 15) {
    const r = Math.random();
    let nx = cx;
    let ny = cy;
    if (r < 0.5) {
      ny = Math.min(CHUNK_H - 2, cy + 1);
    } else if (r < 0.75) {
      nx = Math.max(1, cx - 1);
    } else {
      nx = Math.min(CHUNK_W - 2, cx + 1);
    }
    if (ny < 1) ny = 1;
    cx = nx;
    cy = ny;
    path.add(`${cx},${cy}`);
    if (path.size >= 20 && cy >= minDepth) break;
    if (path.size > 40) break;
  }

  const crystalX = cx;
  const crystalY = cy;

  await supabase
    .from("dungeons")
    .update({
      crystal_tile_x: crystalX,
      crystal_tile_y: crystalY,
      crystal_chunk_x: startCX,
      crystal_chunk_y: startCY,
      crystal_energy: 100,
    })
    .eq("id", newDungeon.id);

  const tiles = [];

  // --- Soil vein generation: brown default, rare green/crystal clusters ---
  const soilGrid: { nutrient: number; mana: number }[][] = [];
  for (let y = 0; y < CHUNK_H; y++) {
    soilGrid[y] = [];
    for (let x = 0; x < CHUNK_W; x++) {
      // Base: low values → brown
      soilGrid[y][x] = {
        nutrient: 0.15 + Math.random() * 0.25,  // 0.15-0.40
        mana: 0.1 + Math.random() * 0.3,         // 0.10-0.40
      };
    }
  }

  // Depth influences how many veins of each type
  const depthRatio = startCY / (GRID - 1); // 0=top, 1=bottom
  const greenSeeds = Math.max(1, Math.round(3 - depthRatio * 2.5 + Math.random())); // 3-4 at top, 0-1 deep
  const crystalSeeds = Math.max(0, Math.round(depthRatio * 3 - 0.5 + Math.random())); // 0-1 at top, 2-3 deep

  // Place green cluster seeds
  for (let i = 0; i < greenSeeds; i++) {
    const sx = 1 + Math.floor(Math.random() * (CHUNK_W - 2));
    const sy = 1 + Math.floor(Math.random() * (CHUNK_H - 2));
    const radius = 2 + Math.random() * 2; // 2-4 tile radius
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const ny = sy + dy;
        const nx = sx + dx;
        if (ny < 0 || ny >= CHUNK_H || nx < 0 || nx >= CHUNK_W) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        const strength = 1 - dist / radius; // 1 at center, 0 at edge
        soilGrid[ny][nx].nutrient = Math.min(1, soilGrid[ny][nx].nutrient + strength * 0.6);
      }
    }
  }

  // Place crystal cluster seeds
  for (let i = 0; i < crystalSeeds; i++) {
    const sx = 1 + Math.floor(Math.random() * (CHUNK_W - 2));
    const sy = 1 + Math.floor(Math.random() * (CHUNK_H - 2));
    const radius = 1.5 + Math.random() * 2; // 1.5-3.5 tile radius
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const ny = sy + dy;
        const nx = sx + dx;
        if (ny < 0 || ny >= CHUNK_H || nx < 0 || nx >= CHUNK_W) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        const strength = 1 - dist / radius;
        soilGrid[ny][nx].mana = Math.min(5, soilGrid[ny][nx].mana + strength * 3.0);
      }
    }
  }

  for (let y = 0; y < CHUNK_H; y++) {
    for (let x = 0; x < CHUNK_W; x++) {
      const isCrystal = x === crystalX && y === crystalY;
      const isGround = y === 0;
      const isPath = path.has(`${x},${y}`);

      let tileType: string;
      if (isGround) {
        tileType = "ground";
      } else if (isCrystal) {
        tileType = "crystal";
      } else if (isPath) {
        tileType = "corridor";
      } else {
        tileType = "solid";
      }

      // Soil varies by depth with clustered veins
      let nutrient: number;
      let mana: number;
      if (isCrystal) {
        nutrient = 0;
        mana = 5.0;
      } else {
        nutrient = soilGrid[y][x].nutrient;
        mana = soilGrid[y][x].mana;
      }

      tiles.push({
        chunk_id: startChunk.id,
        dungeon_id: newDungeon.id,
        local_x: x,
        local_y: y,
        chunk_x: startCX,
        chunk_y: startCY,
        type: tileType,
        nutrient,
        mana,
      });
    }
  }

  await supabase.from("tiles").insert(tiles);

  return {
    dungeonId: newDungeon.id,
    startChunk: { cx: startCX, cy: startCY },
    crystalPosition: { x: crystalX, y: crystalY },
    pathTiles: path.size,
    totalChunks: chunks.length,
  };
}
