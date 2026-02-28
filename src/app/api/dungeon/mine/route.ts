import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  // Get dungeon
  const { data: dungeon } = await supabase
    .from("dungeons")
    .select("*")
    .eq("player_id", player.id)
    .single();

  if (!dungeon) {
    return NextResponse.json({ error: "Dungeon not found" }, { status: 404 });
  }

  // Get all tiles for this dungeon
  const { data: tiles } = await supabase
    .from("tiles")
    .select("*")
    .eq("dungeon_id", dungeon.id)
    .order("chunk_y")
    .order("chunk_x")
    .order("local_y")
    .order("local_x");

  // Get all resources
  const { data: resources } = await supabase
    .from("resources")
    .select("*")
    .eq("dungeon_id", dungeon.id);

  // Get chunks
  const { data: chunks } = await supabase
    .from("chunks")
    .select("*")
    .eq("dungeon_id", dungeon.id);

  return NextResponse.json({
    player,
    dungeon,
    chunks: chunks || [],
    tiles: tiles || [],
    resources: resources || [],
  });
}
