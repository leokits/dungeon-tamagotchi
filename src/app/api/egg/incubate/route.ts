import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Eggs cost only Chrono Dust — resources stay on tiles for pets to eat
const EGG_DUST_COST: Record<string, number> = {
  glob_slime: 5,
  dust_mite: 5,
  cave_beetle: 5,
  mycelid: 6,
  wisp: 8,
  cave_serpent: 7,
  stone_golem: 8,
  shade_wraith: 9,
  fang_beetle: 6,
  moss_crawler: 5,
  ember_salamander: 8,
  crystal_sprite: 8,
  // Legacy / alternate names
  shroom_slime: 5,
  stone_crawler: 6,
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { base_type, hatchery_tile_id } = body;

  if (!base_type || !hatchery_tile_id) {
    return NextResponse.json(
      { error: "Missing base_type or hatchery_tile_id" },
      { status: 400 }
    );
  }

  const dustCost = EGG_DUST_COST[base_type];
  if (dustCost === undefined) {
    return NextResponse.json(
      { error: "Invalid base_type" },
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

  // Check chrono dust
  if (player.chrono_dust < dustCost) {
    return NextResponse.json(
      {
        error: `Need ${dustCost} Chrono Dust (have ${player.chrono_dust})`,
      },
      { status: 400 }
    );
  }

  // Get dungeon
  const { data: dungeon } = await supabase
    .from("dungeons")
    .select("id")
    .eq("player_id", player.id)
    .single();

  if (!dungeon) {
    return NextResponse.json({ error: "Dungeon not found" }, { status: 404 });
  }

  // Check alive pet count
  const { count: alivePetCount } = await supabase
    .from("pets")
    .select("id", { count: "exact" })
    .eq("player_id", player.id)
    .in("status", ["alive", "raiding"]);

  if ((alivePetCount || 0) >= 20) {
    return NextResponse.json(
      { error: "Max 20 alive pets reached" },
      { status: 400 }
    );
  }

  // Verify hatchery tile
  const { data: hatcheryTile } = await supabase
    .from("tiles")
    .select("*")
    .eq("id", hatchery_tile_id)
    .eq("dungeon_id", dungeon.id)
    .eq("type", "hatchery")
    .single();

  if (!hatcheryTile) {
    return NextResponse.json(
      { error: "Invalid hatchery tile" },
      { status: 400 }
    );
  }

  // Check if hatchery already has an incubating egg
  const { data: existingEgg } = await supabase
    .from("eggs")
    .select("id")
    .eq("hatchery_tile_id", hatchery_tile_id)
    .eq("hatched", false)
    .maybeSingle();

  if (existingEgg) {
    return NextResponse.json(
      { error: "Hatchery already has an incubating egg" },
      { status: 400 }
    );
  }

  // Deduct chrono dust (no resource cost — resources stay on tiles for pets)
  await supabase
    .from("players")
    .update({
      chrono_dust: player.chrono_dust - dustCost,
      updated_at: new Date().toISOString(),
    })
    .eq("id", player.id);

  // Create egg — hatches in 1 hour (1 minute in dev)
  const hatchMinutes = process.env.NODE_ENV === "production" ? 60 : 1;
  const hatchesAt = new Date(Date.now() + hatchMinutes * 60 * 1000).toISOString();

  const { data: egg, error } = await supabase
    .from("eggs")
    .insert({
      player_id: player.id,
      dungeon_id: dungeon.id,
      base_type,
      hatchery_tile_id,
      hatches_at: hatchesAt,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ egg });
}
