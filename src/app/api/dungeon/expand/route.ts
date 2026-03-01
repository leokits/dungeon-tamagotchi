import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { direction } = body;

  if (!["north", "south", "east", "west"].includes(direction)) {
    return NextResponse.json(
      { error: "Invalid direction. Use north, south, east, or west." },
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

  // Get existing chunks to determine new chunk position
  const { data: existingChunks } = await supabase
    .from("chunks")
    .select("chunk_x, chunk_y")
    .eq("dungeon_id", dungeon.id);

  if (!existingChunks) {
    return NextResponse.json(
      { error: "No existing chunks" },
      { status: 500 }
    );
  }

  // Determine new chunk coordinates based on direction
  // Place adjacent to an existing boundary chunk so they connect
  let newChunkX: number;
  let newChunkY: number;

  const chunkXs = existingChunks.map((c) => c.chunk_x);
  const chunkYs = existingChunks.map((c) => c.chunk_y);
  const chunkSet = new Set(existingChunks.map((c) => `${c.chunk_x},${c.chunk_y}`));

  switch (direction) {
    case "north": {
      // Find the northernmost row, pick a chunk from it
      const minY = Math.min(...chunkYs);
      const northChunks = existingChunks.filter((c) => c.chunk_y === minY);
      // Prefer center (x=0), fallback to first
      const base = northChunks.find((c) => c.chunk_x === 0) || northChunks[0];
      newChunkX = base.chunk_x;
      newChunkY = minY - 1;
      break;
    }
    case "south": {
      const maxY = Math.max(...chunkYs);
      const southChunks = existingChunks.filter((c) => c.chunk_y === maxY);
      const base = southChunks.find((c) => c.chunk_x === 0) || southChunks[0];
      newChunkX = base.chunk_x;
      newChunkY = maxY + 1;
      break;
    }
    case "east": {
      const maxX = Math.max(...chunkXs);
      const eastChunks = existingChunks.filter((c) => c.chunk_x === maxX);
      const base = eastChunks.find((c) => c.chunk_y === 0) || eastChunks[0];
      newChunkX = maxX + 1;
      newChunkY = base.chunk_y;
      break;
    }
    case "west": {
      const minX = Math.min(...chunkXs);
      const westChunks = existingChunks.filter((c) => c.chunk_x === minX);
      const base = westChunks.find((c) => c.chunk_y === 0) || westChunks[0];
      newChunkX = minX - 1;
      newChunkY = base.chunk_y;
      break;
    }
    default:
      return NextResponse.json({ error: "Invalid direction" }, { status: 400 });
  }

  // Check if chunk already exists
  const exists = existingChunks.some(
    (c) => c.chunk_x === newChunkX && c.chunk_y === newChunkY
  );
  if (exists) {
    return NextResponse.json(
      { error: "Chunk already exists in that direction" },
      { status: 400 }
    );
  }

  // Check max chunks (soft limit)
  if (existingChunks.length >= 48) {
    return NextResponse.json(
      { error: "Maximum dungeon size reached" },
      { status: 400 }
    );
  }

  // TODO: deduct stone resource cost (skipped for Phase 1 MVP)

  // Create the new chunk (20x15 — same as starting chunk)
  const chunkWidth = 20;
  const chunkHeight = 15;

  const { data: newChunk, error: chunkError } = await supabase
    .from("chunks")
    .insert({
      dungeon_id: dungeon.id,
      chunk_x: newChunkX,
      chunk_y: newChunkY,
      width: chunkWidth,
      height: chunkHeight,
    })
    .select()
    .single();

  if (chunkError || !newChunk) {
    return NextResponse.json(
      { error: chunkError?.message || "Failed to create chunk" },
      { status: 500 }
    );
  }

  // Generate tiles for the new chunk — all solid
  const tiles = [];
  for (let y = 0; y < chunkHeight; y++) {
    for (let x = 0; x < chunkWidth; x++) {
      tiles.push({
        chunk_id: newChunk.id,
        dungeon_id: dungeon.id,
        local_x: x,
        local_y: y,
        chunk_x: newChunkX,
        chunk_y: newChunkY,
        type: "solid" as const,
        nutrient: 1.0,
        mana: Math.random() * 0.3,
      });
    }
  }

  // Open a corridor on the border edge facing the existing dungeon
  // so the player can dig into this chunk from the adjacent one
  const borderTiles: { x: number; y: number }[] = [];
  if (direction === "north") {
    // bottom edge of new chunk connects to top edge of chunk below
    for (let x = 0; x < chunkWidth; x++) borderTiles.push({ x, y: chunkHeight - 1 });
  } else if (direction === "south") {
    for (let x = 0; x < chunkWidth; x++) borderTiles.push({ x, y: 0 });
  } else if (direction === "east") {
    for (let y = 0; y < chunkHeight; y++) borderTiles.push({ x: 0, y });
  } else if (direction === "west") {
    for (let y = 0; y < chunkHeight; y++) borderTiles.push({ x: chunkWidth - 1, y });
  }

  // Open 1-3 corridor tiles on the connecting border so dig adjacency works
  const mid = Math.floor(borderTiles.length / 2);
  const openPositions = [borderTiles[mid]];
  if (mid > 0) openPositions.push(borderTiles[mid - 1]);
  if (mid < borderTiles.length - 1) openPositions.push(borderTiles[mid + 1]);

  for (const pos of openPositions) {
    const tile = tiles.find((t) => t.local_x === pos.x && t.local_y === pos.y);
    if (tile) {
      (tile as { type: string }).type = "corridor";
    }
  }

  const { error: tilesError } = await supabase.from("tiles").insert(tiles);

  if (tilesError) {
    return NextResponse.json({ error: tilesError.message }, { status: 500 });
  }

  return NextResponse.json({
    chunk: newChunk,
    message: `Expanded dungeon ${direction}`,
  });
}
