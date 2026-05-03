import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CRYSTAL_MOVE_COST = 25; // dust cost to relocate crystal

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

  // Get player
  const { data: player } = await supabase
    .from("players")
    .select("*")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  if (player.chrono_dust < CRYSTAL_MOVE_COST) {
    return NextResponse.json(
      { error: `Need ${CRYSTAL_MOVE_COST} dust to move crystal (have ${player.chrono_dust})` },
      { status: 400 }
    );
  }

  const { data: dungeon } = await supabase
    .from("dungeons")
    .select("*")
    .eq("player_id", player.id)
    .single();

  if (!dungeon) {
    return NextResponse.json({ error: "Dungeon not found" }, { status: 404 });
  }

  // Find the target tile — must be a walkable tile (corridor/packed/hatchery)
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

  const validTypes = ["corridor", "packed"];
  if (!validTypes.includes(targetTile.type)) {
    return NextResponse.json(
      { error: "Crystal can only be placed on a corridor or packed tile" },
      { status: 400 }
    );
  }

  // Remove crystal from old tile — set it back to corridor
  const { data: oldCrystalTile } = await supabase
    .from("tiles")
    .select("*")
    .eq("dungeon_id", dungeon.id)
    .eq("chunk_x", dungeon.crystal_chunk_x)
    .eq("chunk_y", dungeon.crystal_chunk_y)
    .eq("local_x", dungeon.crystal_tile_x)
    .eq("local_y", dungeon.crystal_tile_y)
    .single();

  if (oldCrystalTile) {
    await supabase
      .from("tiles")
      .update({ type: "corridor" })
      .eq("id", oldCrystalTile.id);
  }

  // Set new tile as crystal
  await supabase
    .from("tiles")
    .update({ type: "crystal", nutrient: 0, mana: 5.0 })
    .eq("id", targetTile.id);

  // Update dungeon crystal position
  await supabase
    .from("dungeons")
    .update({
      crystal_tile_x: local_x,
      crystal_tile_y: local_y,
      crystal_chunk_x: chunk_x,
      crystal_chunk_y: chunk_y,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dungeon.id);

  // Deduct dust atomically via DB-side arithmetic
  const { data: updatedPlayer, error: updateError } = await supabase
    .from("players")
    .update({
      chrono_dust: "chrono_dust" - CRYSTAL_MOVE_COST,
      updated_at: new Date().toISOString(),
    })
    .eq("id", player.id)
    .gte("chrono_dust", CRYSTAL_MOVE_COST)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!updatedPlayer) {
    return NextResponse.json({ error: "Insufficient chrono dust" }, { status: 400 });
  }

  return NextResponse.json({
    message: `Crystal moved! Cost: ${CRYSTAL_MOVE_COST} dust`,
    newPosition: { chunk_x, chunk_y, local_x, local_y },
    remainingDust: updatedPlayer.chrono_dust,
  });
}
