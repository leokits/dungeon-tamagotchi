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

  // Get current player
  const { data: me } = await supabase
    .from("players")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!me) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  // Get all other players with their dungeons
  const { data: players } = await supabase
    .from("players")
    .select("id, username, chrono_dust, updated_at")
    .neq("id", me.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (!players || players.length === 0) {
    return NextResponse.json({ dungeons: [] });
  }

  const playerIds = players.map((p) => p.id);

  // Get dungeons for those players
  const { data: dungeons } = await supabase
    .from("dungeons")
    .select("id, player_id, crystal_energy")
    .in("player_id", playerIds);

  // Get alive pet counts per dungeon
  const dungeonIds = (dungeons || []).map((d) => d.id);
  const { data: petCounts } = await supabase
    .from("pets")
    .select("dungeon_id, id")
    .in("dungeon_id", dungeonIds)
    .eq("status", "alive");

  const petCountMap = new Map<string, number>();
  for (const pet of petCounts || []) {
    petCountMap.set(pet.dungeon_id, (petCountMap.get(pet.dungeon_id) ?? 0) + 1);
  }

  const dungeonMap = new Map((dungeons || []).map((d) => [d.player_id, d]));

  const result = players
    .map((p) => {
      const dungeon = dungeonMap.get(p.id);
      if (!dungeon) return null;
      return {
        player_id: p.id,
        username: p.username,
        dungeon_id: dungeon.id,
        crystal_energy: dungeon.crystal_energy,
        pet_count: petCountMap.get(dungeon.id) ?? 0,
        last_active: p.updated_at,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ dungeons: result });
}
