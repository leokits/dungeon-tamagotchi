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

  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  // Derive discoveries from the pets table — unique monster species the player has encountered
  const { data: pets } = await supabase
    .from("pets")
    .select("species, created_at")
    .eq("player_id", player.id);

  // Aggregate by species: count and first discovered timestamp
  const discoveryMap = new Map<string, { count: number; first_discovered_at: string }>();

  if (pets) {
    for (const pet of pets) {
      const species = pet.species as string;
      const existing = discoveryMap.get(species);
      if (existing) {
        existing.count += 1;
        if (pet.created_at < existing.first_discovered_at) {
          existing.first_discovered_at = pet.created_at;
        }
      } else {
        discoveryMap.set(species, { count: 1, first_discovered_at: pet.created_at });
      }
    }
  }

  const discoveries = Array.from(discoveryMap.entries()).map(([monster_type, info]) => ({
    monster_type,
    count: info.count,
    first_discovered_at: info.first_discovered_at,
  }));

  return NextResponse.json({ discoveries });
}
