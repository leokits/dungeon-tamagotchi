import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Default cost; can be overridden by admin param sent from client
const DEFAULT_AREA_COST = 50;

export async function POST(request: NextRequest) {
  try {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { chunk_x, chunk_y, cost_override } = body;

  if (chunk_x === undefined || chunk_y === undefined) {
    return NextResponse.json({ error: "Missing chunk coordinates" }, { status: 400 });
  }

  // Validate bounds: 10x10 grid, chunks 0-9
  if (chunk_x < 0 || chunk_x > 9 || chunk_y < 0 || chunk_y > 9) {
    return NextResponse.json({ error: "Out of bounds" }, { status: 400 });
  }

  // Get player
  const { data: player } = await supabase
    .from("players")
    .select("*")
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

  // Find the target chunk
  const { data: targetChunk } = await supabase
    .from("chunks")
    .select("*")
    .eq("dungeon_id", dungeon.id)
    .eq("chunk_x", chunk_x)
    .eq("chunk_y", chunk_y)
    .single();

  if (!targetChunk) {
    return NextResponse.json({ error: "Chunk not found" }, { status: 404 });
  }

  if (!targetChunk.locked) {
    return NextResponse.json({ error: "Area already unlocked" }, { status: 400 });
  }

  // Must be adjacent to an unlocked chunk
  const adjacentPositions = [
    { cx: chunk_x - 1, cy: chunk_y },
    { cx: chunk_x + 1, cy: chunk_y },
    { cx: chunk_x, cy: chunk_y - 1 },
    { cx: chunk_x, cy: chunk_y + 1 },
  ];

  // Fetch all chunks for this dungeon to check adjacency properly
  const { data: allChunks } = await supabase
    .from("chunks")
    .select("id, chunk_x, chunk_y, locked, width, height")
    .eq("dungeon_id", dungeon.id);

  const adjacentChunks = (allChunks || []).filter((c) =>
    adjacentPositions.some((p) => p.cx === c.chunk_x && p.cy === c.chunk_y)
  );

  const hasUnlockedNeighbor = (adjacentChunks || []).some(
    (c) =>
      !c.locked &&
      adjacentPositions.some(
        (p) => p.cx === c.chunk_x && p.cy === c.chunk_y
      )
  );

  if (!hasUnlockedNeighbor) {
    return NextResponse.json(
      { error: "Must be adjacent to an unlocked area" },
      { status: 400 }
    );
  }

  // Check cost
  const areaCost = cost_override ?? DEFAULT_AREA_COST;
  if (player.chrono_dust < areaCost) {
    return NextResponse.json(
      { error: `Need ${areaCost} dust (have ${player.chrono_dust})` },
      { status: 400 }
    );
  }

  // Unlock the chunk
  await supabase
    .from("chunks")
    .update({ locked: false })
    .eq("id", targetChunk.id);

  // --- Soil vein generation: brown default, rare green/crystal clusters ---
  const W = targetChunk.width;
  const H = targetChunk.height;
  const soilGrid: { nutrient: number; mana: number }[][] = [];
  for (let y = 0; y < H; y++) {
    soilGrid[y] = [];
    for (let x = 0; x < W; x++) {
      soilGrid[y][x] = {
        nutrient: 0.15 + Math.random() * 0.25,
        mana: 0.1 + Math.random() * 0.3,
      };
    }
  }

  const depthRatio = chunk_y / 9;
  const greenSeeds = Math.max(1, Math.round(3 - depthRatio * 2.5 + Math.random()));
  const crystalSeeds = Math.max(0, Math.round(depthRatio * 3 - 0.5 + Math.random()));

  for (let i = 0; i < greenSeeds; i++) {
    const sx = 1 + Math.floor(Math.random() * (W - 2));
    const sy = 1 + Math.floor(Math.random() * (H - 2));
    const radius = 2 + Math.random() * 2;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const ny = sy + dy, nx = sx + dx;
        if (ny < 0 || ny >= H || nx < 0 || nx >= W) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        soilGrid[ny][nx].nutrient = Math.min(1, soilGrid[ny][nx].nutrient + (1 - dist / radius) * 0.6);
      }
    }
  }

  for (let i = 0; i < crystalSeeds; i++) {
    const sx = 1 + Math.floor(Math.random() * (W - 2));
    const sy = 1 + Math.floor(Math.random() * (H - 2));
    const radius = 1.5 + Math.random() * 2;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const ny = sy + dy, nx = sx + dx;
        if (ny < 0 || ny >= H || nx < 0 || nx >= W) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        soilGrid[ny][nx].mana = Math.min(5, soilGrid[ny][nx].mana + (1 - dist / radius) * 3.0);
      }
    }
  }

  const tiles = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const isGround = chunk_y === 0 && y === 0;

      tiles.push({
        chunk_id: targetChunk.id,
        dungeon_id: dungeon.id,
        local_x: x,
        local_y: y,
        chunk_x: chunk_x,
        chunk_y: chunk_y,
        type: isGround ? "ground" : "solid",
        nutrient: soilGrid[y][x].nutrient,
        mana: soilGrid[y][x].mana,
      });
    }
  }

  // Open corridor on shared border with adjacent unlocked chunks
  // so dig adjacency works across chunk boundaries
  for (const adj of adjacentPositions) {
    const neighbor = (adjacentChunks || []).find(
      (c) => c.chunk_x === adj.cx && c.chunk_y === adj.cy && !c.locked
    );
    if (!neighbor) continue;

    // Open 3 tiles on the shared border
    if (adj.cx < chunk_x) {
      // neighbor is left → open left edge (x=0) of new chunk
      const mid = Math.floor(H / 2);
      for (let dy = -1; dy <= 1; dy++) {
        const ty = mid + dy;
        if (ty >= 0 && ty < H) {
          const t = tiles.find((t) => t.local_x === 0 && t.local_y === ty);
          if (t && t.type === "solid") (t as { type: string }).type = "corridor";
        }
      }
    } else if (adj.cx > chunk_x) {
      // neighbor is right → open right edge (x=W-1)
      const mid = Math.floor(H / 2);
      for (let dy = -1; dy <= 1; dy++) {
        const ty = mid + dy;
        if (ty >= 0 && ty < H) {
          const t = tiles.find((t) => t.local_x === W - 1 && t.local_y === ty);
          if (t && t.type === "solid") (t as { type: string }).type = "corridor";
        }
      }
    } else if (adj.cy < chunk_y) {
      // neighbor is above → open top edge (y=0)
      const mid = Math.floor(W / 2);
      for (let dx = -1; dx <= 1; dx++) {
        const tx = mid + dx;
        if (tx >= 0 && tx < W) {
          const t = tiles.find((t) => t.local_x === tx && t.local_y === 0);
          if (t && t.type === "solid") (t as { type: string }).type = "corridor";
        }
      }
    } else if (adj.cy > chunk_y) {
      // neighbor is below → open bottom edge (y=H-1)
      const mid = Math.floor(W / 2);
      for (let dx = -1; dx <= 1; dx++) {
        const tx = mid + dx;
        if (tx >= 0 && tx < W) {
          const t = tiles.find((t) => t.local_x === tx && t.local_y === H - 1);
          if (t && t.type === "solid") (t as { type: string }).type = "corridor";
        }
      }
    }
  }

  await supabase.from("tiles").insert(tiles);

  // Also open corridor on the NEIGHBOR's border tiles so there's a passage both ways
  for (const adj of adjacentPositions) {
    const neighbor = adjacentChunks.find(
      (c) => c.chunk_x === adj.cx && c.chunk_y === adj.cy && !c.locked
    );
    if (!neighbor) continue;

    const nW = neighbor.width || 20;
    const nH = neighbor.height || 15;

    // Determine which edge of the NEIGHBOR to open
    let borderCondition: { local_x?: number; local_y?: number } = {};
    let midMax: number;

    if (adj.cx < chunk_x) {
      // neighbor is left of new chunk → open neighbor's RIGHT edge
      borderCondition = { local_x: nW - 1 };
      midMax = nH;
    } else if (adj.cx > chunk_x) {
      // neighbor is right → open neighbor's LEFT edge
      borderCondition = { local_x: 0 };
      midMax = nH;
    } else if (adj.cy < chunk_y) {
      // neighbor is above → open neighbor's BOTTOM edge
      borderCondition = { local_y: nH - 1 };
      midMax = nW;
    } else {
      // neighbor is below → open neighbor's TOP edge
      borderCondition = { local_y: 0 };
      midMax = nW;
    }

    const mid = Math.floor(midMax / 2);
    for (let d = -1; d <= 1; d++) {
      const v = mid + d;
      if (v < 0 || v >= midMax) continue;

      let query = supabase
        .from("tiles")
        .update({ type: "corridor" })
        .eq("chunk_id", neighbor.id)
        .eq("type", "solid");

      if (borderCondition.local_x !== undefined) {
        query = query.eq("local_x", borderCondition.local_x).eq("local_y", v);
      } else {
        query = query.eq("local_y", borderCondition.local_y!).eq("local_x", v);
      }

      await query;
    }
  }

  // Deduct dust
  await supabase
    .from("players")
    .update({
      chrono_dust: player.chrono_dust - areaCost,
      updated_at: new Date().toISOString(),
    })
    .eq("id", player.id);

  return NextResponse.json({
    message: `Area (${chunk_x},${chunk_y}) unlocked! Cost: ${areaCost} dust`,
    remainingDust: player.chrono_dust - areaCost,
  });
  } catch (err) {
    console.error("buy-area error:", err);
    return NextResponse.json(
      { error: "Internal server error: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}
