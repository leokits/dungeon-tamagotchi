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
  // Find the extreme chunk in the given direction and place one beyond it
  let newChunkX: number;
  let newChunkY: number;

  const chunkXs = existingChunks.map((c) => c.chunk_x);
  const chunkYs = existingChunks.map((c) => c.chunk_y);

  switch (direction) {
    case "north":
      newChunkX = 0;
      newChunkY = Math.min(...chunkYs) - 1;
      break;
    case "south":
      newChunkX = 0;
      newChunkY = Math.max(...chunkYs) + 1;
      break;
    case "east":
      newChunkX = Math.max(...chunkXs) + 1;
      newChunkY = 0;
      break;
    case "west":
      newChunkX = Math.min(...chunkXs) - 1;
      newChunkY = 0;
      break;
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

  // Create the new chunk (10x10)
  const chunkWidth = 10;
  const chunkHeight = 10;

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

  // Generate tiles for the new chunk
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

  const { error: tilesError } = await supabase.from("tiles").insert(tiles);

  if (tilesError) {
    return NextResponse.json({ error: tilesError.message }, { status: 500 });
  }

  return NextResponse.json({
    chunk: newChunk,
    message: `Expanded dungeon ${direction}`,
  });
}
