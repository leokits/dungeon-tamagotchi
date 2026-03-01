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
    .select("id")
    .eq("player_id", player.id)
    .single();

  if (!dungeon) {
    return NextResponse.json({ error: "Dungeon not found" }, { status: 404 });
  }

  // Find tile
  const { data: tile } = await supabase
    .from("tiles")
    .select("*")
    .eq("dungeon_id", dungeon.id)
    .eq("chunk_x", chunk_x)
    .eq("chunk_y", chunk_y)
    .eq("local_x", local_x)
    .eq("local_y", local_y)
    .single();

  if (!tile) {
    return NextResponse.json({ error: "Tile not found" }, { status: 404 });
  }

  if (tile.type !== "corridor" && tile.type !== "packed") {
    return NextResponse.json(
      { error: "Can only place hatchery on corridor or packed tiles" },
      { status: 400 }
    );
  }

  // Update tile to hatchery
  const { data: updatedTile, error } = await supabase
    .from("tiles")
    .update({ type: "hatchery" })
    .eq("id", tile.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tile: updatedTile });
}
