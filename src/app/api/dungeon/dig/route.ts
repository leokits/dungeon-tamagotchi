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
  const neighbors = [
    { x: local_x - 1, y: local_y, cx: chunk_x, cy: chunk_y },
    { x: local_x + 1, y: local_y, cx: chunk_x, cy: chunk_y },
    { x: local_x, y: local_y - 1, cx: chunk_x, cy: chunk_y },
    { x: local_x, y: local_y + 1, cx: chunk_x, cy: chunk_y },
  ];

  // Get the chunk dimensions to handle edge wrapping
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

  // Normalize neighbor coordinates (handle chunk boundaries)
  const normalizedNeighbors = neighbors.filter(
    (n) => n.x >= 0 && n.x < chunk.width && n.y >= 0 && n.y < chunk.height
  );

  // Check if any neighbor is walkable
  const walkableTypes = ["corridor", "packed", "crystal", "hatchery"];
  let hasWalkableNeighbor = false;

  for (const n of normalizedNeighbors) {
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

  // Remove any resource that was on this tile
  await supabase.from("resources").delete().eq("tile_id", targetTile.id);

  return NextResponse.json({ tile: updatedTile });
}
